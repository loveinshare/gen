#!/usr/bin/env node
/**
 * gen.mjs — .gen 体系的零依赖工具链（Node ≥ 16）
 *
 *   node .gen/scripts/gen.mjs lint   [--root <dir>] [--json] [--strict]
 *   node .gen/scripts/gen.mjs status [--root <dir>] [--json]
 *   node .gen/scripts/gen.mjs new    <report|decision|failure|handoff|plan|adr|review> [--title .. | --slug ..]
 *   node .gen/scripts/gen.mjs init   [--root <dir>] [--force]
 *   node .gen/scripts/gen.mjs serve  --decision <id> [--port 7070] [--no-open]
 *   node .gen/scripts/gen.mjs demo   [--dir <dir>]
 *
 * 设计约束：不引第三方依赖、跨平台、默认只读（除 new/init/demo/serve 外不改文件）。
 * 退出码：0 = 通过（可有警告）；1 = 有错误；2 = 用法错误；3 = 环境错误。
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BUNDLE = path.resolve(HERE, '..'); // .gen 根

/* ──────────────────────────── 通用工具 ──────────────────────────── */

const C = process.stdout.isTTY && !process.env.NO_COLOR
  ? { r: '\x1b[31m', g: '\x1b[32m', y: '\x1b[33m', b: '\x1b[36m', d: '\x1b[2m', x: '\x1b[0m' }
  : { r: '', g: '', y: '', b: '', d: '', x: '' };

const TZ_OFFSET = (() => {
  const m = new Date().toString().match(/GMT([+-])(\d{2})(\d{2})/);
  if (!m) return '+08:00';
  return `${m[1]}${m[2]}:${m[3]}`;
})();

function nowISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${TZ_OFFSET}`;
}
function tsFile(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}`;
}
const rel = (p) => path.relative(process.cwd(), p).split(path.sep).join('/') || '.';
const read = (p) => fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '');
const exists = (p) => { try { fs.accessSync(p); return true; } catch { return false; } };
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };

/** 递归复制目录（替代 fs.cpSync：非 ASCII 源路径下 cpSync 会让 Node 崩溃） */
function copyTree(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) copyTree(s, d);
    else fs.copyFileSync(s, d);
  }
}

function walk(dir, out = []) {  let ents = [];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      walk(p, out);
    } else out.push(p);
  }
  return out;
}

function findProjectRoot(start = process.cwd()) {
  let cur = path.resolve(start);
  for (let i = 0; i < 12; i++) {
    if (exists(path.join(cur, '.gen', 'AGENTS.md'))) return cur;
    if (path.basename(cur) === '.gen' && exists(path.join(cur, 'AGENTS.md'))) return path.dirname(cur);
    const up = path.dirname(cur);
    if (up === cur) break;
    cur = up;
  }
  return null;
}

/* ─────────────────────── frontmatter（YAML 子集） ─────────────────────── */

function parseScalar(v) {
  v = v.trim();
  if (v === '') return '';
  // 行内注释：仅在未被引号包裹时剥离（`status: open  # open | resolved`）
  if (!/^['"]/.test(v)) v = v.replace(/\s+#.*$/, '').trim();
  if (/^".*"$/.test(v) || /^'.*'$/.test(v)) return v.slice(1, -1);
  if (/^\[.*\]$/.test(v)) {
    const inner = v.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(',').map((s) => parseScalar(s)).filter((s) => s !== '');
  }
  return v;
}

function parseFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return null;
  const data = {};
  let curKey = null;
  for (const rawLine of m[1].split(/\r?\n/)) {
    if (!rawLine.trim() || rawLine.trim().startsWith('#')) continue;
    const indented = /^\s+/.test(rawLine);
    const line = rawLine.trim();
    const km = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (km && !indented) {
      curKey = km[1];
      data[curKey] = km[2] === '' ? {} : parseScalar(km[2]);
    } else if (km && indented && curKey && typeof data[curKey] === 'object' && !Array.isArray(data[curKey])) {
      data[curKey][km[1]] = parseScalar(km[2]);
    }
  }
  const bodyStart = m[0].length;
  return { data, body: text.slice(bodyStart), bodyStartLines: m[0].split(/\r?\n/).length - 1 };
}

/* ───────────────────────────── 规则定义 ───────────────────────────── */

const KINDS = {
  state: ['generated', 'open', 'doing', 'done', 'blocked'],
  plan: ['todo', 'doing', 'blocked', 'done', 'dropped', 'draft'],
  handoff: ['final', 'draft'],
  decision: ['open', 'resolved', 'blocked', 'superseded', 'waived'],
  thread: ['open', 'resolved', 'blocked', 'superseded', 'waived'],
  response: ['final', 'draft'],
  spec: ['draft', 'active', 'done', 'dropped'],
  revision: ['final', 'draft'],
  report: ['draft', 'final'],
  ledger: ['generated'],
  failure: ['open', 'mitigated', 'fixed', 'wontfix'],
  arch: ['generated', 'reviewed'],
  key: ['generated', 'stable', 'changing', 'deprecated'],
  review: ['final', 'draft'],
  adr: ['proposed', 'accepted', 'superseded', 'rejected'],
  snapshot: ['generated', 'frozen'],
  annotation: ['final', 'draft'],
};

const REPORT_TYPES = ['phase', 'weekly', 'incident', 'release'];
const REQUIRED = ['id', 'kind', 'title', 'created', 'status'];

/* ────────────────────────────── lint ────────────────────────────── */

function lint(rootArg, opts = {}) {
  const root = rootArg ? path.resolve(rootArg) : findProjectRoot();
  const findings = [];
  const add = (level, code, file, msg, line) => findings.push({ level, code, file: file ? rel(file) : '', line, msg });

  if (!root) {
    add('error', 'E01', '', '找不到 .gen/AGENTS.md：当前目录及其祖先都不是 .gen 项目（用 --root 指定）');
    return finish(findings, opts);
  }
  const GEN = path.join(root, '.gen');
  if (!isDir(GEN)) {
    add('error', 'E01', path.join(root, '.gen'), '.gen 目录不存在');
    return finish(findings, opts);
  }
  const initialized = isDir(path.join(GEN, 'workflow', 'state'));

  /* ---- 1. 技能包：Agent Skills 规范 ---- */
  const skillsDir = path.join(GEN, 'skills');
  const skillNames = new Set();
  if (isDir(skillsDir)) {
    for (const ent of fs.readdirSync(skillsDir, { withFileTypes: true })) {
      if (!ent.isDirectory()) continue;
      const dir = path.join(skillsDir, ent.name);
      const file = path.join(dir, 'SKILL.md');
      if (!exists(file)) { add('error', 'E10', dir, `skill 缺少 SKILL.md`); continue; }
      const text = read(file);
      const fm = parseFrontmatter(text);
      if (!fm) { add('error', 'E11', file, 'SKILL.md 缺少 YAML frontmatter'); continue; }
      const d = fm.data;
      if (!d.name) add('error', 'E12', file, 'frontmatter 缺少 name');
      else {
        if (d.name !== ent.name) add('error', 'E13', file, `name「${d.name}」与目录名「${ent.name}」不一致`);
        if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(d.name)) add('error', 'E14', file, `name「${d.name}」不符合小写 kebab-case`);
        skillNames.add(d.name);
      }
      if (!d.description) add('error', 'E15', file, 'frontmatter 缺少 description');
      else {
        const len = String(d.description).length;
        if (len > 1024) add('error', 'E16', file, `description 超长（${len}/1024）`);
        if (len < 40) add('warn', 'W16', file, `description 偏短（${len} 字），可能无法被正确触发`);
      }
      const bodyLines = text.split(/\r?\n/).length - (fm.bodyStartLines || 0);
      if (bodyLines > 500) add('warn', 'W17', file, `正文 ${bodyLines} 行 > 500，建议拆到 references/`);
    }
    for (const need of ['decision-page', 'implement', 'validate', 'repair', 'test-ledger', 'periodic-report', 'arch-sync', 'key-guard', 'analyze', 'plan', 'continuation-planner', 'gen-init']) {
      if (!skillNames.has(need)) add('warn', 'W18', skillsDir, `缺少核心 skill「${need}」`);
    }
  }

  /* ---- 2. 产物文件：frontmatter / 命名 / 状态 ---- */
  const artifactDirs = ['workflow', 'decisions', 'specs', 'reports', 'tests', 'architecture'];
  const artifacts = [];
  for (const d of artifactDirs) {
    const dir = path.join(GEN, d);
    if (!isDir(dir)) continue;
    for (const f of walk(dir)) {
      if (!f.endsWith('.md')) continue;
      if (f.includes(`${path.sep}templates${path.sep}`)) continue;
      if (path.basename(f) === 'README.md') continue;
      artifacts.push(f);
    }
  }

  const ids = new Map(); // id -> file
  const decisionStatus = new Map();

  for (const file of artifacts) {
    const text = read(file);
    const fm = parseFrontmatter(text);
    if (!fm) { add('error', 'E20', file, '缺少 YAML frontmatter'); continue; }
    const d = fm.data;
    const isPlaceholder = /YYYY|xxx|X{3}/i.test(String(d.id || '')) || /<[^>]+>/.test(String(d.title || ''));
    for (const k of REQUIRED) if (!d[k]) add('error', 'E21', file, `frontmatter 缺少必填字段 ${k}`);
    if (d.kind && !KINDS[d.kind]) add('error', 'E22', file, `kind「${d.kind}」不在枚举内`);
    if (d.kind && KINDS[d.kind] && d.status && !KINDS[d.kind].includes(String(d.status))) {
      add('error', 'E23', file, `status「${d.status}」不属于 kind=${d.kind} 的枚举（允许：${KINDS[d.kind].join('/')}）`);
    }
    if (d.id && d.kind) {
      if (!isPlaceholder) {
        if (ids.has(d.id)) add('error', 'E24', file, `id「${d.id}」重复（另一个在 ${rel(ids.get(d.id))}）`);
        else ids.set(d.id, file);
      }
      if (d.kind === 'decision' || d.kind === 'thread') {
        const dirName = path.basename(path.dirname(file));
        if (isDir(path.dirname(file)) && path.dirname(file).includes(`${path.sep}decisions${path.sep}`)) {
          if (!isPlaceholder && d.id !== dirName) add('error', 'E25', file, `id「${d.id}」与决策目录名「${dirName}」不一致`);
        }
        if (!isPlaceholder && d.status) decisionStatus.set(d.id, String(d.status));
      }
    }
    // 文件名时间戳与 frontmatter created 一致
    const base = path.basename(file);
    const tsMatch = base.match(/(20\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?/);
    if (tsMatch && d.created && !isPlaceholder) {
      const fromName = `${tsMatch[1]}${tsMatch[2]}${tsMatch[3]}${tsMatch[4]}`;
      const cm = String(d.created).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2})/);
      if (cm) {
        const fromCreated = `${cm[1]}${cm[2]}${cm[3]}${cm[4]}`;
        if (fromName !== fromCreated) add('error', 'E26', file, `文件名时间戳 ${fromName} 与 created ${fromCreated} 不一致`);
      }
    }
    if (isPlaceholder) add('warn', 'W20', file, '仍含模板占位符（YYYYMMDDHH / <...>），可能是未填充的模板副本');
  }

  /* ---- 3. 决策目录与 INDEX ---- */
  // 先做一次 links 悬空检查（依赖上面收集到的 ids）
  for (const file of artifacts) {
    const fm = parseFrontmatter(read(file));
    if (!fm) continue;
    const links = fm.data.links;
    if (!Array.isArray(links)) continue;
    for (const l of links) {
      const id = String(l).trim();
      if (!id || /YYYY|xxx/i.test(id) || /[<>]/.test(id)) continue;
      if (!/^(D|F|R)-/.test(id)) continue; // S-/AC-/INV-/K- 不要求有独立文件
      if (!ids.has(id) && !isDir(path.join(GEN, 'decisions', id))) {
        add('warn', 'W90', file, `links 指向不存在的 ID：「${id}」`);
      }
    }
  }

  const decisionsDir = path.join(GEN, 'decisions');
  const indexFile = path.join(decisionsDir, 'INDEX.md');
  const indexRows = new Map();
  if (exists(indexFile)) {
    const text = read(indexFile);
    const lines = text.split(/\r?\n/);
    let headerCols = null;
    for (const line of lines) {
      if (!line.trim().startsWith('|')) continue;
      const cells = splitRow(line);
      if (!headerCols) { headerCols = cells.map((c) => c.toLowerCase()); continue; }
      if (/^[-: ]+$/.test(cells.join(''))) continue;
      const idIdx = headerCols.findIndex((h) => h.includes('decision_id') || h === 'id');
      const stIdx = headerCols.findIndex((h) => h.includes('状态') || h === 'status');
      if (idIdx >= 0 && cells[idIdx] && /^D-/.test(cells[idIdx])) {
        indexRows.set(cells[idIdx], { status: stIdx >= 0 ? cells[stIdx] : '', line });
      }
    }
  }
  if (isDir(decisionsDir)) {
    for (const ent of fs.readdirSync(decisionsDir, { withFileTypes: true })) {
      if (!ent.isDirectory() || !ent.name.startsWith('D-')) continue;
      const dir = path.join(decisionsDir, ent.name);
      if (!/^D-\d{10}(-\d{2})?-[a-z0-9-]+$/.test(ent.name)) {
        add('warn', 'W21', dir, `决策目录名「${ent.name}」不符合 D-YYYYMMDDHH-<slug>`);
      }
      const page = path.join(dir, 'page.html');
      const thread = path.join(dir, 'thread.md');
      if (!exists(page)) add('error', 'E30', dir, '缺少 page.html');
      if (!exists(thread)) { add('error', 'E31', dir, '缺少 thread.md'); continue; }
      const tText = read(thread);
      const tFm = parseFrontmatter(tText);
      const st = tFm ? String(tFm.data.status || '') : '';
      if (st === 'resolved') {
        const sec = (tText.split(/^##\s*最终结论\s*$/m)[1] || '');
        const meaningful = sec.split(/\r?\n/).filter((l) => {
          const s = l.trim();
          if (!s || s.startsWith('>') || s.startsWith('#') || s.startsWith('---')) return false;
          if (/[<>]/.test(s)) return false;           // 仍是 <...> 占位
          if (/（等待|待填|\.\.\.|…/.test(s)) return false;
          return s.length >= 10;
        });
        if (!meaningful.length) {
          add('error', 'E32', thread, 'status=resolved 但「## 最终结论」仍是占位内容（闸门会判为未真正关闭）');
        }
      }
      if (st === 'open' && !/^##\s*Round\s*1/m.test(tText)) {
        add('warn', 'W22', thread, 'open 决策没有 Round 1 记录');
      }
      if (!indexRows.has(ent.name)) {
        add('error', 'E33', dir, `decisions/INDEX.md 没有「${ent.name}」这一行`);
      } else {
        const rowStatus = indexRows.get(ent.name).status.replace(/[`*]/g, '').trim();
        if (rowStatus && st && rowStatus !== st) {
          add('error', 'E34', thread, `INDEX 状态「${rowStatus}」与 thread.md 状态「${st}」不一致`);
        }
      }
      if (st === 'resolved') decisionStatus.set(ent.name, 'resolved');
    }
  }
  for (const [id, row] of indexRows) {
    if (/YYYYMMDDHH|<|xxx/i.test(id)) continue; // 模板占位行不算悬空
    const dir = path.join(decisionsDir, id);
    if (!isDir(dir)) add('error', 'E35', indexFile, `INDEX 中的「${id}」在 decisions/ 下没有对应目录`, row.line);
  }

  /* ---- 4. 测试台账 ---- */
  const ledger = path.join(GEN, 'tests', 'LEDGER.md');
  if (exists(ledger)) {
    const lines = read(ledger).split(/\r?\n/);
    let headerCount = 0;
    const resEnum = ['pass', 'fail', 'flaky', 'skipped', 'blocked'];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim().startsWith('|')) continue;
      const cells = splitRow(line);
      if (/^[-: ]+$/.test(cells.join(''))) continue;
      if (!headerCount) {
        headerCount = cells.length;
        if (headerCount !== 9) add('error', 'E40', ledger, `台账表头应为 9 列，实际 ${headerCount} 列`, i + 1);
        continue;
      }
      if (/^20\d{8}/.test(cells[0])) {
        if (cells.length !== headerCount) {
          add('error', 'E41', ledger, `台账行 ${cells.length} 列 ≠ 表头 ${headerCount} 列`, i + 1);
        }
        if (cells[4] && !resEnum.includes(cells[4].replace(/[`*]/g, '').trim())) {
          add('warn', 'W40', ledger, `台账结果「${cells[4]}」不是合法枚举`, i + 1);
        }
      }
    }
  } else if (initialized) {
    add('warn', 'W41', path.join(GEN, 'tests'), '缺少 tests/LEDGER.md（跑过测试就必须记）');
  } else {
    add('info', 'I01', path.join(GEN), '尚未初始化运行目录（跑一次 gen init 即可）');
  }

  /* ---- 5. 人读架构层是生成物 ---- */
  const humanDir = path.join(GEN, 'architecture', 'human');
  if (isDir(humanDir)) {
    for (const f of walk(humanDir)) {
      if (!f.endsWith('.md')) continue;
      const name = path.basename(f);
      if (['GLOSSARY.md', 'KNOWN-ISSUES.md'].includes(name)) continue;
      const text = read(f);
      const fm = parseFrontmatter(text);
      if (!fm) { add('warn', 'W50', f, '人读架构文件缺少 frontmatter（应为生成物，标注来源）'); continue; }
      if (!fm.data.generated_from) add('warn', 'W51', f, '缺少 generated_from：无法确认来源，可能是手改的');
      if (fm.data.status === 'reviewed' && !text.includes('@resolved')) {
        add('warn', 'W52', f, 'status=reviewed 但没有任何批注回执（@resolved）');
      }
    }
  }

  /* ---- 6. 报告索引覆盖 ---- */
  const reportsDir = path.join(GEN, 'reports');
  const repIndex = path.join(reportsDir, 'INDEX.md');
  if (isDir(reportsDir) && exists(repIndex)) {
    const idx = read(repIndex);
    for (const f of fs.readdirSync(reportsDir)) {
      if (!/\.(md|html)$/.test(f) || f === 'INDEX.md' || f === 'INDEX.html') continue;
      if (!idx.includes(f.replace(/\.(md|html)$/, ''))) {
        add('warn', 'W60', path.join(reportsDir, f), '报告未登记到 reports/INDEX.md');
      }
    }
  }

  /* ---- 7. 仓库根卫生 ---- */
  const roots = fs.readdirSync(root, { withFileTypes: true });
  for (const e of roots) {
    if (!e.isFile()) continue;
    if (/^(NOTES|TODO|TMP|TEMP|SCRATCH|临时|草稿)/i.test(e.name) || /^(report|报告)[-_].*\.(md|html)$/i.test(e.name) || /final.*\.(md|html)$/i.test(e.name)) {
      add('warn', 'W70', path.join(root, e.name), '过程文件不应放在仓库根（应进 .gen/）');
    }
  }

  /* ---- 8. 闸门预检 ---- */
  let openDecisions = 0;
  for (const [id, st] of decisionStatus) if (st === 'open' || st === 'blocked') openDecisions++;
  if (openDecisions > 5) {
    add('warn', 'W80', path.join(decisionsDir, 'INDEX.md'), `有 ${openDecisions} 个未关闭决策，可能已堆积成阻力`);
  }

  const s = finish(findings, opts);
  if (!opts.json && !opts.silent) {
    console.log(`${C.d}项目根：${root}${C.x}`);
    console.log(`${C.d}决策：${decisionStatus.size} 个（未关闭 ${openDecisions}）｜技能：${skillNames.size} 个${C.x}`);
  }
  return s;
}

function splitRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((c) => c.trim());
}

/* 表格数据行：跳过围栏代码块内的行、表头行、分隔行。
   代码块里的表格是"示例"，不是数据——模板里的示例行曾被当成真实执行记录统计。 */
function dataRows(text) {
  const rows = [];
  let fence = false;
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*(```|~~~)/.test(l)) { fence = !fence; continue; }
    if (fence) continue;
    if (!l.trim().startsWith('|')) continue;
    const cells = splitRow(l);
    if (/^[-: ]+$/.test(cells.join(''))) continue;
    rows.push({ cells, line: i + 1 });
  }
  return rows;
}

/* 往表格末尾追加一行：在第一段连续表格块（表头 + 分隔行 + 数据行）的末尾插入。
   模板的表头下现在不放示例行了，所以不能靠"替换示例行"来写入。 */
function appendTableRow(text, row) {
  const lines = text.split(/\r?\n/);
  let fence = false;
  let end = -1;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*(```|~~~)/.test(l)) { fence = !fence; continue; }
    if (fence) continue;
    if (!l.trim().startsWith('|')) {
      if (end >= 0) break;      // 表格块结束
      continue;
    }
    end = i;
  }
  if (end < 0) return text;      // 没有表格块，原样返回
  lines.splice(end + 1, 0, row);
  return lines.join('\n');
}

function finish(findings, opts) {
  const errors = findings.filter((f) => f.level === 'error');
  const warns = findings.filter((f) => f.level === 'warn');
  if (opts.json) {
    console.log(JSON.stringify({ summary: { errors: errors.length, warnings: warns.length }, findings }, null, 2));
  } else if (!opts.silent) {
    const byFile = new Map();
    for (const f of findings) {
      const k = f.file || '(全局)';
      if (!byFile.has(k)) byFile.set(k, []);
      byFile.get(k).push(f);
    }
    for (const [file, list] of byFile) {
      console.log(`\n${C.b}${file}${C.x}`);
      for (const f of list) {
        const icon = f.level === 'error' ? `${C.r}✖` : f.level === 'warn' ? `${C.y}⚠` : `${C.d}ℹ`;
        console.log(`  ${icon} ${f.code}${C.x} ${f.msg}${f.line ? ` ${C.d}(第 ${f.line} 行)${C.x}` : ''}`);
      }
    }
    console.log(
      findings.length === 0
        ? `\n${C.g}✔ 全部通过${C.x}`
        : `\n${errors.length ? C.r + '✖ ' + errors.length + ' 个错误' : C.g + '✔ 0 个错误'}${C.x}  ${warns.length ? C.y + '⚠ ' + warns.length + ' 个警告' : C.d + '⚠ 0 个警告'}${C.x}`
    );
  }
  const failed = errors.length > 0 || (opts.strict && warns.length > 0);
  return failed ? 1 : 0;
}

/* ────────────────────────────── status ────────────────────────────── */

function status(rootArg, opts) {
  const root = rootArg ? path.resolve(rootArg) : findProjectRoot();
  if (!root) { console.error('找不到 .gen 项目'); return 3; }
  const GEN = path.join(root, '.gen');
  const readFm = (p) => (exists(p) ? parseFrontmatter(read(p))?.data || {} : {});

  const phase = readFm(path.join(GEN, 'workflow/state/current-phase.md'));
  const phaseText = exists(path.join(GEN, 'workflow/state/current-phase.md'))
    ? read(path.join(GEN, 'workflow/state/current-phase.md')) : '';
  const tbl = (text, key) => {
    for (const l of text.split(/\r?\n/)) {
      if (!l.trim().startsWith('|')) continue;
      const c = splitRow(l);
      if (c[0] === key && c[1] && !/^[-: ]+$/.test(c[1])) return c[1];
    }
    return '';
  };
  const phaseTable = {
    '阶段': tbl(phaseText, '阶段'),
    '当前切片': tbl(phaseText, '当前切片'),
    '阻塞项': tbl(phaseText, '阻塞项'),
  };
  const indexFile = path.join(GEN, 'decisions/INDEX.md');
  let open = [];
  if (exists(indexFile)) {
    const rows = dataRows(read(indexFile));
    const cols = rows.length ? rows[0].cells.map((c) => c.toLowerCase()) : [];
    const idI = cols.findIndex((h) => h.includes('decision_id') || h === 'id');
    const stI = cols.findIndex((h) => h.includes('状态') || h === 'status');
    const itI = cols.findIndex((h) => h.includes('一句话') || h.includes('标题') || h === 'title');
    for (const { cells } of rows.slice(1)) {
      if (idI >= 0 && /^D-/.test(cells[idI] || '') && !/YYYYMMDDHH/i.test(cells[idI] || '')) {
        const st = (cells[stI] || '').replace(/[`*]/g, '').trim();
        if (st === 'open' || st === 'blocked') open.push({ id: cells[idI], status: st, title: itI >= 0 ? cells[itI] : '' });
      }
    }
  }

  const ledger = path.join(GEN, 'tests/LEDGER.md');
  let tests = { total: 0, fail: 0 };
  if (exists(ledger)) {
    for (const { cells } of dataRows(read(ledger))) {
      if (!/^20\d{8}/.test(cells[0] || '')) continue;
      tests.total++;
      const r = (cells[4] || '').replace(/[`*]/g, '').trim();
      if (r === 'fail' || r === 'flaky') tests.fail++;
    }
  }

  const progress = path.join(GEN, 'workflow/state/progress.md');
  let lastProgress = '';
  if (exists(progress)) {
    const rows = dataRows(read(progress)).filter((r) => /^20\d{8}/.test(r.cells[0] || ''));
    lastProgress = rows.length ? `| ${rows[rows.length - 1].cells.join(' | ')} |` : '';
  }

  const reportsDir = path.join(GEN, 'reports');
  let lastReport = '';
  if (isDir(reportsDir)) {
    const fs2 = fs.readdirSync(reportsDir).filter((f) => /\.(md|html)$/.test(f) && !f.startsWith('INDEX')).sort();
    if (fs2.length) lastReport = fs2[fs2.length - 1];
  }

  const canImplement = open.length === 0;

  if (opts.json) {
    console.log(JSON.stringify({ root, phase, phaseTable, open, tests, lastProgress, lastReport, canImplement }, null, 2));
    return canImplement ? 0 : 1;
  }
  if (opts.silent) return canImplement ? 0 : 1;

  console.log(`${C.d}项目根${C.x} ${root}`);
  console.log(`${C.d}阶段${C.x}   ${phaseTable['阶段'] || '（未填写）'}  ${C.d}当前切片${C.x} ${phaseTable['当前切片'] || '（未填写）'}`);
  console.log(`${C.d}测试${C.x}   ${tests.total} 次执行，${tests.fail} 次 fail/flaky`);
  console.log(`${C.d}报告${C.x}   ${lastReport || '（无）'}`);
  if (lastProgress) console.log(`${C.d}最近${C.x}   ${lastProgress.replace(/\|/g, '│').slice(0, 120)}`);
  console.log('');
  if (open.length === 0) {
    console.log(`${C.g}✔ 闸门通过：可以进入 implement${C.x}`);
  } else {
    console.log(`${C.r}✖ 闸门阻塞：${open.length} 个决策未关闭${C.x}`);
    for (const d of open) console.log(`   - ${d.id} [${d.status}] ${d.title}`);
    console.log(`${C.d}先打开对应 decisions/<id>/page.html，或运行 gen.mjs serve --decision <id>${C.x}`);
  }
  return canImplement ? 0 : 1;
}

/* ─────────────────────────────── new ─────────────────────────────── */

const NEW_KINDS = {
  report: { tpl: 'templates/report/report.@EXT@', dir: 'reports', name: (ts, o) => `${ts}-${o.title || '未命名报告'}.${o.format}`, id: (ts, o) => `R-${ts}-${o.slug || 'report'}` },
  decision: { tpl: 'templates/decision/page.html', dir: 'decisions', name: (ts, o) => `D-${ts}-${o.slug}`, id: (ts, o) => `D-${ts}-${o.slug}`, multi: true },
  failure: { tpl: 'templates/test/failure.md', dir: 'tests/failures', name: (ts, o) => `F-${ts}-${o.slug}.md`, id: (ts, o) => `F-${ts}-${o.slug}` },
  handoff: { tpl: 'templates/handoff.md', dir: 'workflow/handoffs', name: (ts, o) => `${ts}-${o.slug}.md`, id: (ts, o) => `handoff-${ts}-${o.slug}` },
  plan: { tpl: 'templates/spec/plan.md', dir: 'workflow/plans', name: (ts, o) => `${ts}-${o.slug}.md`, id: (ts, o) => `plan-${ts}-${o.slug}` },
  adr: { tpl: 'templates/architecture/adr.md', dir: 'architecture/agent/adr', name: (ts, o) => `${ts}-${o.slug}.md`, id: (ts, o) => `adr-${ts}-${o.slug}` },
  review: { tpl: 'templates/architecture/key-review.md', dir: 'architecture/agent/key/reviews', name: (ts, o) => `${ts}-${o.slug}.md`, id: (ts, o) => `review-${ts}-${o.slug}` },
};

/** 把一行插进 decisions/INDEX.md 的主表（优先替换占位行），避免"新建了决策但看板没它" */
function addIndexRow(file, row) {
  if (!exists(file)) return false;
  let s = read(file);
  if (/^\|\s*D-YYYYMMDDHH-slug\s*\|/m.test(s)) {
    s = s.replace(/^\|\s*D-YYYYMMDDHH-slug\s*\|.*$/m, row);
    fs.writeFileSync(file, s, 'utf8');
    return true;
  }
  const lines = s.split(/\r?\n/);
  const headIdx = lines.findIndex((l) => /^\|\s*decision_id\s*\|/i.test(l));
  if (headIdx >= 0) {
    const sepIdx = headIdx + 1;
    if (lines[sepIdx] && /^\|[\s:|-]+\|$/.test(lines[sepIdx].trim())) {
      lines.splice(sepIdx + 1, 0, row);
    } else {
      lines.splice(headIdx + 1, 0, '|---|---|---|---|---|---|---|', row);
    }
  } else {
    lines.push('', '| decision_id | 状态 | 轮次 | 一句话 | 未关闭项 | 关联 feature | 最近更新 |',
      '|---|---|---|---|---|---|---|', row);
  }
  fs.writeFileSync(file, lines.join('\n'), 'utf8');
  return true;
}

function cmdNew(kind, opts) {  const root = opts.root ? path.resolve(opts.root) : findProjectRoot();
  if (!root) return usage('找不到 .gen 项目');
  const spec = NEW_KINDS[kind];
  if (!spec) return usage(`未知类型「${kind}」，可选：${Object.keys(NEW_KINDS).join(' / ')}`);

  const ts = opts.ts || tsFile();
  const o = { ...opts, format: opts.format || 'md', slug: opts.slug || slugify(opts.title || '') };
  if (!o.slug && kind !== 'report') return usage('需要 --slug 或可转成 slug 的 --title');
  if (kind === 'report' && !opts.title) return usage('report 需要 --title');

  const GEN = path.join(root, '.gen');
  const tpl = path.join(BUNDLE, spec.tpl.replace('@EXT@', o.format));
  if (!exists(tpl)) return usage(`模板不存在：${rel(tpl)}`);

  const dest = path.join(GEN, spec.dir, spec.name(ts, o));
  if (exists(dest)) {
    return usage(`已存在：${rel(dest)}\n  同小时重名？换一个 --slug，或加 --ts ${ts}${String(new Date().getMinutes()).padStart(2, '0')}（两位分钟）`);
  }

  fs.mkdirSync(path.dirname(dest), { recursive: true });

  if (kind === 'decision') {
    fs.mkdirSync(dest, { recursive: true });
    fs.copyFileSync(tpl, path.join(dest, 'page.html'));
    fs.copyFileSync(path.join(BUNDLE, 'templates/decision/thread.md'), path.join(dest, 'thread.md'));
    fillPlaceholders(path.join(dest, 'thread.md'), { id: spec.id(ts, o), title: o.title || o.slug, ts, iso: nowISO() });
    const id = spec.id(ts, o);
    const added = addIndexRow(path.join(GEN, 'decisions/INDEX.md'),
      `| ${id} | open | 1 | ${o.title || '待填写'} | 1 项 | ${o.feature || '—'} | ${ts} |`);
    console.log(`${C.g}已创建${C.x} ${rel(dest)}/`);
    console.log(added
      ? `${C.d}已自动登记到 decisions/INDEX.md（状态 open，1 项未关闭）${C.x}`
      : `${C.y}未找到 decisions/INDEX.md，请手动补一行${C.x}`);
    console.log(`${C.d}下一步：填满 page.html 的 DATA（不留 TODO），再让用户批复。${C.x}`);
  } else {
    fs.copyFileSync(tpl, dest);
    fillPlaceholders(dest, { id: spec.id(ts, o), title: o.title || o.slug, ts, iso: nowISO() });
    console.log(`${C.g}已创建${C.x} ${rel(dest)}`);
    if (kind === 'report') console.log(`${C.d}下一步：更新 reports/INDEX.md，并在首行写格式判定理由。${C.x}`);
  }
  return 0;
}

function fillPlaceholders(file, v) {
  let s = read(file);
  // 顺序很重要：先换完整 ID，再换裸时间戳；否则 D-YYYYMMDDHH-slug 会先被换成 D-<ts>-slug
  if (v.id) {
    s = s.replace(/D-YYYYMMDDHH-slug/g, v.id)
      .replace(/F-YYYYMMDDHH-slug/g, v.id)
      .replace(/R-YYYYMMDDHH-slug/g, v.id)
      .replace(/handoff-YYYYMMDDHH-slug/g, v.id)
      .replace(/plan-YYYYMMDDHH-phase/g, v.id)
      .replace(/adr-YYYYMMDDHH-slug/g, v.id)
      .replace(/review-YYYYMMDDHH-key-id/g, v.id);
  }
  s = s.replace(/YYYY-MM-DDTHH:MM:00\+08:00/g, v.iso)
    .replace(/YYYY-MM-DDTHH:MM/g, v.iso.slice(0, 16));
  if (!v.keepTs) s = s.replace(/YYYYMMDDHH/g, v.ts);
  s = s.replace(/YYYY-MM-DD/g, v.iso.slice(0, 10))
    .replace(/LEDGER-YYYYMM/g, `LEDGER-${v.iso.slice(0, 7).replace('-', '')}`)
    .replace(/YYYY-QN/g, `${v.iso.slice(0, 4)}-Q${Math.floor((Number(v.iso.slice(5, 7)) - 1) / 3) + 1}`);
  if (v.title) {
    s = s.replace(/^title:.*$/m, `title: ${v.title}`);
    s = s.replace(/<报告标题>/g, v.title)
      .replace(/<一句话描述现象，不是原因>/g, v.title)
      .replace(/<决策标题[^>]*>/g, v.title)
      .replace(/<模块名>/g, v.title)
      .replace(/<一句话>/g, v.title);
  }
  fs.writeFileSync(file, s, 'utf8');
}

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
}

/* ─────────────────────────────── init ─────────────────────────────── */

function cmdInit(opts) {
  const root = opts.root ? path.resolve(opts.root) : process.cwd();
  const GEN = path.join(root, '.gen');
  const created = [];
  const skipped = [];

  if (isDir(GEN) && !opts.force) {
    // 只补缺失项
    console.log(`${C.d}.gen 已存在，只补缺失文件（--force 才会覆盖）${C.x}`);
  }

  const dirs = [
    'workflow/state', 'workflow/plans', 'workflow/handoffs',
    'decisions', 'decisions/archive', 'specs', 'reports/archive',
    'tests/history', 'tests/failures', 'tests/fixtures', 'tests/runs',
    'architecture/agent/modules', 'architecture/agent/contracts', 'architecture/agent/flows',
    'architecture/agent/key/reviews', 'architecture/agent/adr', 'architecture/agent/snapshots',
    'architecture/human/annotations',
  ];
  for (const d of dirs) fs.mkdirSync(path.join(GEN, d), { recursive: true });

  const map = [
    ['templates/state/project-snapshot.md', 'workflow/state/project-snapshot.md'],
    ['templates/state/current-phase.md', 'workflow/state/current-phase.md'],
    ['templates/state/progress.md', 'workflow/state/progress.md'],
    ['templates/state/ambiguities.md', 'workflow/state/ambiguities.md'],
    ['templates/state/done-criteria.md', 'workflow/state/done-criteria.md'],
    ['templates/decision/INDEX.md', 'decisions/INDEX.md'],
    ['templates/test/ledger.md', 'tests/LEDGER.md'],
    ['templates/test/matrix.md', 'tests/matrix.md'],
    ['templates/architecture/agent-architecture.md', 'architecture/agent/ARCHITECTURE.md'],
    ['templates/architecture/key-registry.md', 'architecture/agent/key/REGISTRY.md'],
    ['templates/architecture/key-changelog.md', 'architecture/agent/key/CHANGELOG.md'],
    ['templates/architecture/human-architecture.md', 'architecture/human/ARCHITECTURE.md'],
    ['templates/gitignore.template', '.gitignore'],
  ];
  const iso = nowISO();
  for (const [src, dst] of map) {
    const from = path.join(BUNDLE, src);
    const to = path.join(GEN, dst);
    if (exists(to) && !opts.force) { skipped.push(dst); continue; }
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    fillPlaceholders(to, { ts: tsFile(), iso, keepTs: dst === 'decisions/INDEX.md' });
    created.push(dst);
  }

  // 报告索引与人读层空壳，按需生成（都带 frontmatter，否则 lint 会报 E20）
  const emptyFiles = [
    ['reports/INDEX.md', `---
id: reports-index
kind: state
title: 报告索引
created: ${iso}
updated: ${iso}
status: generated
---

# 报告索引

| 时间 | 标题 | 类型 | 一句话结论 | 文件 |
|---|---|---|---|---|
`],
    ['architecture/human/KEY.md', `---
id: human-key
kind: arch
title: 关键实现（人读版）
created: ${iso}
status: generated
generated_from: architecture/agent/key/REGISTRY.md
---

# 关键实现

> 由 key-guard 渲染，禁止手改正文。看不懂就写 \`<!-- @note: ... -->\`。
`],
    ['architecture/human/KNOWN-ISSUES.md', `---
id: human-known-issues
kind: arch
title: 已知缺陷与限制
created: ${iso}
status: generated
generated_from: architecture/agent/ARCHITECTURE.md
---

# 已知缺陷与限制

> 每条五段式：你会看到什么 / 什么条件出现 / 影响谁 / 现状 / 关联决策。
`],
    ['architecture/human/GLOSSARY.md', `---
id: human-glossary
kind: arch
title: 术语表
created: ${iso}
status: generated
generated_from: architecture/agent/ARCHITECTURE.md
---

# 术语表

| 术语 | 一句人话 |
|---|---|
`],
  ];
  for (const [dst, content] of emptyFiles) {
    const to = path.join(GEN, dst);
    if (exists(to) && !opts.force) { skipped.push(dst); continue; }
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.writeFileSync(to, content, 'utf8');
    created.push(dst);
  }

  // VERSION
  const vfile = path.join(GEN, 'VERSION');
  if (!exists(vfile)) { fs.writeFileSync(vfile, '4.1.0\n', 'utf8'); created.push('VERSION'); }

  console.log(`${C.g}✔ 初始化完成${C.x} 新增 ${created.length} 项，保留 ${skipped.length} 项`);
  if (created.length) console.log(`${C.d}新增：${created.join('、')}${C.x}`);
  console.log(`${C.d}下一步：填 workflow/state/project-snapshot.md，然后运行 gen.mjs status${C.x}`);
  return 0;
}

/* ─────────────────────────────── serve ─────────────────────────────── */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function cmdServe(opts) {
  const root = opts.root ? path.resolve(opts.root) : findProjectRoot();
  if (!root) return usage('找不到 .gen 项目');
  const GEN = path.join(root, '.gen');
  const decisionsDir = path.join(GEN, 'decisions');
  const port = Number(opts.port || 7070);

  const listDecisions = () => {
    if (!isDir(decisionsDir)) return [];
    return fs.readdirSync(decisionsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name.startsWith('D-'))
      .map((e) => {
        const dir = path.join(decisionsDir, e.name);
        const t = exists(path.join(dir, 'thread.md')) ? read(path.join(dir, 'thread.md')) : '';
        const fm = parseFrontmatter(t)?.data || {};
        return { id: e.name, title: fm.title || '', status: fm.status || '?', dir };
      })
      .sort((a, b) => b.id.localeCompare(a.id));
  };

  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);

    if (req.method === 'POST' && urlPath === '/api/response') {
      let body = '';
      req.on('data', (c) => {
        body += c;
        if (body.length > 2 * 1024 * 1024) { res.writeHead(413); res.end('payload too large'); req.destroy(); }
      });
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          const id = String(data.id || '');
          const round = String(data.round || '1');
          const md = String(data.markdown || '');
          if (!/^D-\d{10}(-\d{2})?-[a-z0-9-]+$/.test(id)) throw new Error('非法决策 ID');
          if (!/^\d{1,2}$/.test(round)) throw new Error('非法轮次');
          const dir = path.join(decisionsDir, id);
          if (!isDir(dir)) throw new Error('决策目录不存在');
          if (!md.trim()) throw new Error('批复为空');
          const out = path.join(dir, `response-r${round}.md`);
          const header = `---\nid: response-${id}-r${round}\nkind: response\ntitle: 第 ${round} 轮批复\ncreated: ${nowISO()}\nstatus: final\nlinks: [${id}]\nauthor: human\n---\n\n`;
          fs.writeFileSync(out, header + md, 'utf8');
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: true, path: path.relative(root, out) }));
        } catch (e) {
          res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: String(e.message || e) }));
        }
      });
      return;
    }

    if (urlPath === '/' || urlPath === '/index.html') {
      const rows = listDecisions().map((d) => `<li><a href="/${d.id}/">${esc(d.id)}</a> <span class="s ${d.status}">${esc(d.status)}</span> ${esc(d.title)}</li>`).join('\n');
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>决策列表 · .gen</title>
<style>body{font:16px/1.7 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;max-width:820px;margin:40px auto;padding:0 18px;background:#fbfbfa;color:#1f2328}
a{color:#1f6feb}li{margin:8px 0}.s{font-size:12px;padding:1px 7px;border-radius:999px;border:1px solid #d8dee4}
.s.open{color:#9a6700;border-color:#9a6700}.s.resolved{color:#1a7f37;border-color:#1a7f37}.s.blocked{color:#cf222e;border-color:#cf222e}
code{background:#eee;padding:1px 5px;border-radius:4px;font-size:13px}</style>
<h1>决策列表</h1><p>共 ${listDecisions().length} 个。点击进入后可直接在页面里写批复并保存到磁盘。</p>
<ul>${rows || '<li>（还没有决策）</li>'}</ul>
<p style="color:#5b6570;font-size:14px">新增：<code>node .gen/scripts/gen.mjs new decision --slug &lt;slug&gt;</code></p></html>`);
      return;
    }

    const m = urlPath.match(/^\/(D-[A-Za-z0-9-]+)\/?$/);
    if (m) {
      const dir = path.join(decisionsDir, m[1]);
      if (!isDir(dir)) { res.writeHead(404); res.end('not found'); return; }
      const page = path.join(dir, 'page.html');
      if (!exists(page)) { res.writeHead(404); res.end('page.html 缺失'); return; }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(read(page));
      return;
    }

    // 静态：只允许 decisions 下的附属文件（md / html）
    const sm = urlPath.match(/^\/(D-[A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)$/);
    if (sm) {
      const file = path.join(decisionsDir, sm[1], path.basename(sm[2]));
      if (exists(file) && fs.statSync(file).isFile()) {
        res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'text/plain; charset=utf-8' });
        res.end(read(file));
        return;
      }
    }
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('not found');
  });

  server.listen(port, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${port}/`;
    console.log(`${C.g}✔ 决策服务已启动${C.x} ${url}`);
    console.log(`${C.d}绑定 127.0.0.1，仅本机可访问；Ctrl+C 退出${C.x}`);
    const target = opts.decision ? `${url}${opts.decision}/` : url;
    if (opts.decision) console.log(`${C.d}打开：${target}${C.x}`);
    if (!opts['no-open']) openBrowser(target);
  });
  return new Promise(() => {}); // 常驻
}

function openBrowser(url) {
  try {
    if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore', detached: true }).unref();
    else if (process.platform === 'darwin') spawn('open', [url], { stdio: 'ignore', detached: true }).unref();
    else spawn('xdg-open', [url], { stdio: 'ignore', detached: true }).unref();
  } catch { /* 打不开就算了 */ }
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ─────────────────────────────── demo ─────────────────────────────── */

function cmdDemo(opts) {
  const target = opts.dir
    ? path.resolve(opts.dir)
    : path.join(process.env.TEMP || '/tmp', `gen-demo-${Date.now().toString(36)}`);
  if (isDir(target) && fs.readdirSync(target).length && !opts.force) {
    return usage(`目标目录非空：${target}（加 --force 覆盖）`);
  }
  fs.mkdirSync(target, { recursive: true });
  const GEN = path.join(target, '.gen');
  fs.mkdirSync(GEN, { recursive: true });
  // 复制技能与模板（模拟真实项目）。
  // 注意：不用 fs.cpSync —— 在含非 ASCII 字符的源路径上它会让 Node 直接崩溃（0xC0000409）。
  for (const d of ['skills', 'templates', 'scripts']) {
    copyTree(path.join(BUNDLE, d), path.join(GEN, d));
  }
  for (const f of ['AGENTS.md', 'VERSION']) fs.copyFileSync(path.join(BUNDLE, f), path.join(GEN, f));
  fs.copyFileSync(path.join(BUNDLE, '..', 'AGENTS.md'), path.join(target, 'AGENTS.md'));

  cmdInit({ root: target, force: false });

  const ts = tsFile();
  const dId = `D-${ts}-token-store`;
  const ddir = path.join(GEN, 'decisions', dId);
  fs.mkdirSync(ddir, { recursive: true });
  fs.copyFileSync(path.join(BUNDLE, 'templates/decision/thread.md'), path.join(ddir, 'thread.md'));
  fillPlaceholders(path.join(ddir, 'thread.md'), { id: dId, title: '令牌存储方案取舍', ts, iso: nowISO() });

  // 生成决策页：数据在 <script id="gen-data"> 的 JSON 里，便于 decision-diff 解析
  const tplPage = read(path.join(BUNDLE, 'templates/decision/page.html'));
  const demoData = {
    id: dId,
    title: '令牌存储方案取舍',
    round: 2,
    goal: '登录态在 Web 和移动端都能用，且改密后可主动失效',
    decision_question: '令牌存在哪里、失效怎么做',
    updated: nowISO().slice(0, 16),
    items: [
      {
        id: 'Q1',
        question: '令牌放 cookie 还是 Authorization header？',
        why_now: '这决定 CSRF 防护方式、跨域配置，以及后续所有接口的改造范围',
        options: [
          { key: 'A', label: 'HttpOnly Cookie', how: '服务端 Set-Cookie，前端无感', gain: '防 XSS 偷 token', cost: '需要 CSRF 防护与跨域配置', reversible: '可逆' },
          { key: 'B', label: 'Authorization Header', how: '前端存储并随请求头带上', gain: '跨端简单、无 CSRF', cost: 'XSS 可窃取，需要前端存储策略', reversible: '可逆' },
          { key: 'C', label: '双令牌（短 access + 长 refresh）', how: 'access 放 header，refresh 放 cookie', gain: '兼顾安全与体验', cost: '实现复杂度最高', reversible: '部分可逆' },
        ],
        recommend: 'C',
        recommend_reason: '移动端没有 cookie 语义，双令牌是唯一同时覆盖两端的方案',
        assumptions: ['我假设移动端是原生壳而非 WebView', '若只有 Web，A 更简单且更安全'],
        excluded: [{ option: 'D 存 localStorage', reason: 'XSS 直接可读，等同于没有防护' }],
        default_if_silent: '按 C 实现，并把复杂度风险记入 ambiguities.md（这不等于你同意）',
        state: 'annotated',
        answers: { 1: '为什么不用 session？我们不是有 Redis 吗？—— 另外移动端要单独处理吗' },
      },
      {
        id: 'Q2',
        question: '改密后旧令牌多久失效？',
        why_now: '决定要不要引入令牌版本号，影响表结构与校验路径',
        options: [
          { key: 'A', label: '立即失效（引入版本号）', how: '用户表加 token_version，校验时比对', gain: '改密立即踢出', cost: '多一次查询/缓存依赖', reversible: '可逆' },
          { key: 'B', label: '等 access 过期（≤15 分钟）', how: '不改代码，缩短 TTL', gain: '零成本', cost: '最长 15 分钟窗口仍可用', reversible: '可逆' },
        ],
        recommend: 'A',
        recommend_reason: '账号被盗场景下 15 分钟窗口风险不可接受',
        assumptions: ['我假设 Redis 可用于缓存版本号，避免每请求查库'],
        excluded: [],
        default_if_silent: '按 A 实现，若缓存不可用则回退 B 并记录风险',
        state: 'unanswered',
        answers: {},
      },
    ],
  };
  fs.writeFileSync(path.join(ddir, 'page.html'), fillPageData(tplPage, demoData), 'utf8');

  // 第 1 轮快照：供 decision-diff 演示（推荐从 B 改成 C、Q2 是新增的）
  const prevData = JSON.parse(JSON.stringify(demoData));
  prevData.round = 1;
  prevData.updated = demoData.updated;
  prevData.items = [
    {
      ...JSON.parse(JSON.stringify(demoData.items[0])),
      options: demoData.items[0].options.slice(0, 2),
      recommend: 'B',
      recommend_reason: '跨端最简单，不需要处理 CSRF',
      assumptions: ['我假设只有 Web 端'],
      excluded: [],
      state: 'unanswered',
      answers: {},
    },
  ];
  fs.writeFileSync(path.join(ddir, 'page-r1.html'), fillPageData(tplPage, prevData), 'utf8');

  // INDEX 行（替换模板里第一行 D-* 数据行）
  const indexFile = path.join(GEN, 'decisions/INDEX.md');
  let idx = read(indexFile);
  idx = idx.replace(/^\|\s*D-[^|\n]*\|.*$/m, `| ${dId} | open | 2 | 令牌存储与失效策略 | 1 项 | auth | ${ts} |`);
  fs.writeFileSync(indexFile, idx, 'utf8');

  // 一条测试台账 + 一个失败档案
  const ledger = path.join(GEN, 'tests/LEDGER.md');
  const lg = appendTableRow(read(ledger),
    `| ${ts} | S-auth-03 | 实现后自检 | \`pnpm vitest run tests/auth\` | fail | 2 | F-${ts}-login-500 | win11/node20 | ${dId} |`);
  fs.writeFileSync(ledger, lg, 'utf8');

  const fdir = path.join(GEN, 'tests/failures');
  const ffile = path.join(fdir, `F-${ts}-login-500.md`);
  fs.copyFileSync(path.join(BUNDLE, 'templates/test/failure.md'), ffile);
  fillPlaceholders(ffile, { id: `F-${ts}-login-500`, title: '改密后旧令牌仍可用', ts, iso: nowISO() });

  // 一份阶段报告（html 看板）
  const rdir = path.join(GEN, 'reports');
  const rfile = path.join(rdir, `${ts}-鉴权重构阶段评审.html`);
  fs.copyFileSync(path.join(BUNDLE, 'templates/report/report.html'), rfile);
  const ridx = path.join(rdir, 'INDEX.md');
  fs.writeFileSync(ridx, `---
id: reports-index
kind: state
title: 报告索引
created: ${nowISO()}
updated: ${nowISO()}
status: generated
---

# 报告索引

| 时间 | 标题 | 类型 | 一句话结论 | 文件 |
|---|---|---|---|---|
| ${ts} | 鉴权重构阶段评审 | phase | 认证改造完成 60%，令牌存储待你拍板 | ${ts}-鉴权重构阶段评审.html |
`, 'utf8');

  // 进度与阶段
  fs.writeFileSync(path.join(GEN, 'workflow/state/progress.md'), `---
id: state-progress
kind: state
title: 进度流水
created: ${nowISO()}
updated: ${nowISO()}
status: generated
---

# 进度流水（append-only）

| 时间 | 切片 | 改了什么 | 证据 | 未决项 |
|---|---|---|---|---|
| ${ts} | S-auth-02 | impl: 抽出 token 签发/校验 | \`tests/LEDGER.md\` | Q1 待确认 |
| ${ts} | S-auth-03 | blocked: 决策 ${dId} 未关闭 | — | Q1/Q2 |
`, 'utf8');

  fs.writeFileSync(path.join(GEN, 'workflow/state/current-phase.md'), `---
id: state-current-phase
kind: state
title: 当前阶段
created: ${nowISO()}
updated: ${nowISO()}
status: doing
---

# 当前阶段

| 字段 | 值 |
|---|---|
| 阶段 | auth-refactor |
| 阶段目标 | 登录态可跨端使用且可主动失效 |
| 当前切片 | S-auth-03（blocked） |
| 计划文件 | \`workflow/plans/${ts}-auth.md\` |
| 阻塞项 | ${dId}（Q1/Q2 未关闭） |
`, 'utf8');

  console.log(`${C.g}✔ demo 已生成${C.x} ${target}`);
  console.log(`${C.d}下一步：${C.x}`);
  console.log(`  cd ${target}`);
  console.log(`  node .gen/scripts/gen.mjs status`);
  console.log(`  node .gen/scripts/gen.mjs serve --decision ${dId}`);
  return 0;
}

/* ─────────────────── 决策页数据块（JSON，供 diff 解析） ─────────────────── */

const GEN_DATA_RE = /<script type="application\/json" id="gen-data">([\s\S]*?)<\/script>/;

function fillPageData(html, data) {
  return html.replace(GEN_DATA_RE, (m, inner) => m.replace(inner, `\n${JSON.stringify(data, null, 2)}\n`));
}

function readPageData(file) {
  const html = read(file);
  const m = html.match(GEN_DATA_RE);
  if (!m) throw new Error(`找不到 gen-data JSON：${file}`);
  return JSON.parse(m[1]);
}

/* ───────────────────── key-check：key 触碰检测 ───────────────────── */

const LEVEL_ORDER = { normal: 0, high: 1, critical: 2 };

function parseRegistry(root) {
  const file = path.join(root, '.gen/architecture/agent/key/REGISTRY.md');
  if (!exists(file)) return { file, rows: [] };
  const rows = [];
  let cols = null;
  for (const line of read(file).split(/\r?\n/)) {
    if (!line.trim().startsWith('|')) continue;
    const cells = splitRow(line);
    if (!cols) { cols = cells.map((c) => c.toLowerCase()); continue; }
    if (/^[-: ]+$/.test(cells.join(''))) continue;
    if (!/^K-/.test(cells[0])) continue;
    rows.push({
      id: cells[0].replace(/[`*]/g, '').trim(),
      level: (cells[1] || '').replace(/[`*]/g, '').trim() || 'normal',
      summary: cells[2] || '',
      locations: (cells[3] || '').replace(/`/g, '').split(/<br\s*\/?>|\s*,\s*/).map((s) => s.trim()).filter(Boolean),
      status: (cells[7] || '').replace(/[`*]/g, '').trim(),
      confirmedBy: (cells[8] || '').trim(),
    });
  }
  return { file, rows };
}

function gitRun(root, args) {
  const r = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  return { ok: r.status === 0, out: r.stdout || '', err: r.stderr || '' };
}

function parseDiffRanges(diffText) {
  const map = new Map();
  let cur = null;
  for (const line of diffText.split(/\r?\n/)) {
    if (line.startsWith('+++ ')) {
      const p = line.slice(4).trim();
      cur = p === '/dev/null' ? null : p.replace(/^b\//, '');
      if (cur && !map.has(cur)) map.set(cur, { ranges: [], whole: false });
    } else if (line.startsWith('@@') && cur) {
      const m = line.match(/^@@\s+-\d+(?:,\d+)?\s+\+(\d+)(?:,(\d+))?\s+@@/);
      if (m) {
        const start = Number(m[1]);
        const count = m[2] === undefined ? 1 : Number(m[2]);
        const entry = map.get(cur);
        if (count === 0) entry.whole = true; // 纯删除：整文件算触碰
        else entry.ranges.push({ start, end: start + count - 1 });
      }
    }
  }
  return map;
}

function changedFiles(root, base) {
  const inside = gitRun(root, ['rev-parse', '--is-inside-work-tree']);
  if (!inside.ok) return null;

  const files = new Map(); // path -> {ranges, whole, untracked}
  if (base) {
    const names = gitRun(root, ['diff', '--name-only', '--diff-filter=ACMRT', `${base}...HEAD`]);
    if (!names.ok) return null;
    for (const f of names.out.split(/\r?\n/).filter(Boolean)) files.set(f, { ranges: [], whole: false });
    const diff = gitRun(root, ['diff', '-U0', `${base}...HEAD`]);
    if (diff.ok) {
      for (const [f, v] of parseDiffRanges(diff.out)) {
        if (!files.has(f)) files.set(f, { ranges: [], whole: false });
        Object.assign(files.get(f), v);
      }
    }
  } else {
    const st = gitRun(root, ['status', '--porcelain']);
    if (!st.ok) return null;
    for (const line of st.out.split(/\r?\n/).filter(Boolean)) {
      const code = line.slice(0, 2).trim();
      let p = line.slice(3).trim();
      if (p.includes(' -> ')) p = p.split(' -> ').pop();
      p = p.replace(/^"|"$/g, '');
      files.set(p, { ranges: [], whole: code === '??' });
    }
    const diff = gitRun(root, ['diff', '-U0', 'HEAD']);
    if (diff.ok) {
      for (const [f, v] of parseDiffRanges(diff.out)) {
        const entry = files.get(f) || { ranges: [], whole: false };
        entry.ranges.push(...v.ranges);
        entry.whole = entry.whole || v.whole;
        files.set(f, entry);
      }
    }
    // 暂存但未提交的改动（diff HEAD 已含暂存；兜底再跑一次 --cached 以防 HEAD 不存在）
    const cached = gitRun(root, ['diff', '-U0', '--cached']);
    if (cached.ok) {
      for (const [f, v] of parseDiffRanges(cached.out)) {
        const entry = files.get(f) || { ranges: [], whole: false };
        entry.ranges.push(...v.ranges);
        entry.whole = entry.whole || v.whole;
        files.set(f, entry);
      }
    }
  }
  return files;
}

function globToRegex(glob) {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`);
}

/** 判断某个 key 登记位置是否被改动命中 */
function matchLocation(loc, files) {
  const m = loc.match(/^(.+?):(\d+)(?:-(\d+))?\s*$/);
  const pattern = (m ? m[1] : loc).replace(/\\/g, '/');
  const range = m ? { start: Number(m[2]), end: Number(m[3] || m[2]) } : null;
  const isGlob = /[*?]/.test(pattern);
  const re = isGlob ? globToRegex(pattern) : null;

  const hits = [];
  for (const [file, info] of files) {
    const f = file.replace(/\\/g, '/');
    const pathHit = isGlob ? re.test(f) : f === pattern;
    if (!pathHit) continue;
    if (!range || info.whole || info.ranges.length === 0) {
      hits.push({ file: f, kind: info.whole || !range ? 'whole' : 'file', lines: null });
      continue;
    }
    const overlap = info.ranges.filter((r) => r.start <= range.end && r.end >= range.start);
    if (overlap.length) {
      hits.push({ file: f, kind: 'lines', lines: overlap.map((r) => `${r.start}-${r.end}`).join(', ') });
    } else {
      hits.push({ file: f, kind: 'outside', lines: info.ranges.map((r) => `${r.start}-${r.end}`).join(', ') });
    }
  }
  return hits;
}

function cmdKeyCheck(opts) {
  const root = opts.root ? path.resolve(opts.root) : findProjectRoot();
  if (!root) return usage('找不到 .gen 项目');
  const reg = parseRegistry(root);
  if (!reg.rows.length) {
    console.error(`${C.y}⚠ REGISTRY.md 里没有已登记的 key（或在候选阶段）${C.x}`);
    return 0;
  }

  let files;
  if (opts.files) {
    files = new Map(String(opts.files).split(',').map((s) => s.trim()).filter(Boolean)
      .map((f) => [f.replace(/\\/g, '/'), { ranges: [], whole: true }]));
  } else {
    files = changedFiles(root, opts.base && opts.base !== true ? String(opts.base) : null);
    if (!files) {
      console.error(`${C.r}✖ 当前目录不是 git 仓库（或 --base 不存在）${C.x}`);
      console.error(`${C.d}可用 --files a.ts,b.ts 手动指定要检查的文件${C.x}`);
      return 3;
    }
  }

  const report = [];
  for (const key of reg.rows) {
    const hits = [];
    for (const loc of key.locations) hits.push(...matchLocation(loc, files).map((h) => ({ ...h, loc })));
    const real = hits.filter((h) => h.kind !== 'outside');
    const outside = hits.filter((h) => h.kind === 'outside');
    if (real.length || outside.length) {
      report.push({ key, hits: real, outside });
    }
  }

  const failOn = opts['fail-on'] || 'high';
  const threshold = failOn === 'any' ? 0 : failOn === 'critical' ? 2 : failOn === 'none' ? 99 : 1;
  const failing = report.filter((r) => r.hits.length && (LEVEL_ORDER[r.key.level] ?? 0) >= threshold);

  if (opts.json) {
    console.log(JSON.stringify({ root, checked: reg.rows.length, changes: report.map((r) => ({
      key_id: r.key.id, level: r.key.level, status: r.key.status,
      hits: [...r.hits, ...r.outside],
    })), failing: failing.map((r) => r.key.id) }, null, 2));
    return failing.length ? 1 : 0;
  }

  console.log(`${C.d}检查了 ${reg.rows.length} 个 key，改动文件 ${files.size} 个${C.x}\n`);
  if (!report.length) {
    console.log(`${C.g}✔ 没有 key 被触碰${C.x}`);
    return 0;
  }
  for (const r of report) {
    for (const h of r.hits) {
      const c = r.key.level === 'critical' ? C.r : C.y;
      console.log(`${c}✖ ${r.key.id} [${r.key.level}]${C.x} ${h.file}${h.lines ? ` (改动行 ${h.lines})` : ''}`);
      console.log(`   ${C.d}登记位置：${h.loc}${C.x}`);
      console.log(`   ${C.d}必须先走决策：node .gen/scripts/gen.mjs new decision --slug key-${r.key.id.replace(/^K-/, '')}${C.x}`);
    }
    for (const h of r.outside) {
      console.log(`${C.d}· ${r.key.id} 文件被改但行号不在登记区间（改动 ${h.lines}；登记 ${h.loc}）——确认是否需要更新位置${C.x}`);
    }
    if (r.key.status === 'changing') console.log(`${C.y}⚠ ${r.key.id} 处于 changing，禁止发布${C.x}`);
  }
  console.log('');
  if (failing.length) {
    console.log(`${C.r}✖ ${failing.length} 个 key 被触碰（fail-on=${failOn}），阻止静默合并${C.x}`);
    return 1;
  }
  console.log(`${C.g}✔ 被触碰的 key 均低于拦截阈值（fail-on=${failOn}）${C.x}`);
  return 0;
}

/* ───────────────────── install：把 skills 装到客户端 ───────────────────── */

const INSTALL_TARGETS = {
  claude: '.claude/skills',
  codex: '.codex/skills',
  cursor: '.cursor/skills',
  dsh: '.dsh/skills',
};

function cmdInstall(opts) {
  const root = opts.root ? path.resolve(opts.root) : (findProjectRoot() || process.cwd());
  const targetArg = String(opts.target || 'claude');
  const base = opts.global ? os.homedir() : root;
  const relTarget = INSTALL_TARGETS[targetArg] || targetArg;
  const dest = path.isAbsolute(relTarget) ? relTarget : path.join(base, relTarget);
  const manifestFile = path.join(dest, '.gen-install.json');

  const src = path.join(BUNDLE, 'skills');
  const skills = fs.readdirSync(src, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);

  // 目标目录已存在且不是本系统装的：只拦"同名 skill 会被覆盖"的情况，其余照装。
  // （全局目录 ~/.claude/skills 通常已有别的 skill，硬拒绝等于逼用户一律 --force。）
  if (isDir(dest) && !exists(manifestFile) && !opts.force) {
    const clashes = skills.filter((n) => exists(path.join(dest, n)));
    if (clashes.length) {
      console.error(`${C.r}✖ 目标目录已有同名 skill：${clashes.join('、')}${C.x}`);
      console.error(`${C.d}${rel(dest)} 不是本系统安装的，覆盖会丢失原有内容。${C.x}`);
      console.error(`${C.d}确认要覆盖请加 --force（只覆盖上面这些同名目录，不动其他 skill）${C.x}`);
      return 1;
    }
    console.log(`${C.y}⚠ ${rel(dest)} 已存在且不是 gen 装的，但无同名 skill，继续安装${C.x}`);
  }
  fs.mkdirSync(dest, { recursive: true });

  const installed = [];
  for (const name of skills) {
    const from = path.join(src, name);
    const to = path.join(dest, name);
    if (exists(to)) fs.rmSync(to, { recursive: true, force: true });
    if (opts.link) {
      try {
        fs.symlinkSync(from, to, process.platform === 'win32' ? 'junction' : 'dir');
        installed.push({ name, mode: 'link' });
        continue;
      } catch { /* 无权限则退回复制 */ }
    }
    copyTree(from, to);
    installed.push({ name, mode: 'copy' });
  }

  fs.writeFileSync(manifestFile, JSON.stringify({
    system: 'gen',
    version: fs.existsSync(path.join(BUNDLE, 'VERSION')) ? read(path.join(BUNDLE, 'VERSION')).trim() : 'unknown',
    installedAt: nowISO(),
    source: src,
    skills: installed,
  }, null, 2), 'utf8');

  console.log(`${C.g}✔ 已安装 ${installed.length} 个 skill${C.x} → ${dest}`);
  console.log(`${C.d}模式：${installed[0]?.mode || 'copy'}｜清单：${rel(manifestFile)}${C.x}`);
  if (!exists(path.join(root, 'AGENTS.md'))) {
    console.log(`${C.y}⚠ 项目根没有 AGENTS.md：只装 skill 不够，制度文件必须一起放${C.x}`);
  }
  return 0;
}

/* ───────────────────── report：自动汇总数字看板 ───────────────────── */

function collectStats(root) {
  const GEN = path.join(root, '.gen');
  const readFm = (p) => (exists(p) ? parseFrontmatter(read(p))?.data || {} : {});

  const decisions = { total: 0, open: 0, resolved: 0, blocked: 0, waived: 0, superseded: 0, rows: [] };
  const indexFile = path.join(GEN, 'decisions/INDEX.md');
  if (exists(indexFile)) {
    const rows = dataRows(read(indexFile));
    const cols = rows.length ? rows[0].cells.map((c) => c.toLowerCase()) : [];
    const idI = cols.findIndex((h) => h.includes('decision_id') || h === 'id');
    const stI = cols.findIndex((h) => h.includes('状态') || h === 'status');
    for (const { cells } of rows.slice(1)) {
      const id = cells[idI] || '';
      if (!/^D-/.test(id) || /YYYYMMDDHH/i.test(id)) continue;
      const st = (cells[stI] || '').replace(/[`*]/g, '').trim();
      decisions.total++;
      if (st === 'open') decisions.open++;
      else if (st === 'resolved') decisions.resolved++;
      else if (st === 'blocked') decisions.blocked++;
      else if (st === 'waived') decisions.waived++;
      else if (st === 'superseded') decisions.superseded++;
      decisions.rows.push({ id, status: st });
    }
  }

  const tests = { total: 0, pass: 0, fail: 0, flaky: 0, skipped: 0, blocked: 0, recent: [] };
  const ledger = path.join(GEN, 'tests/LEDGER.md');
  if (exists(ledger)) {
    for (const { cells } of dataRows(read(ledger))) {
      if (!/^20\d{8}/.test(cells[0] || '')) continue;
      const r = (cells[4] || '').replace(/[`*]/g, '').trim();
      tests.total++;
      if (r in tests) tests[r]++;
      tests.recent.push(cells);
    }
  }

  const failures = { open: 0, total: 0, items: [] };
  const fdir = path.join(GEN, 'tests/failures');
  if (isDir(fdir)) {
    for (const f of fs.readdirSync(fdir).filter((n) => n.endsWith('.md'))) {
      const fm = readFm(path.join(fdir, f));
      failures.total++;
      if (fm.status === 'open') { failures.open++; failures.items.push({ file: f, title: fm.title, severity: fm.severity }); }
    }
  }

  const progress = [];
  const pfile = path.join(GEN, 'workflow/state/progress.md');
  if (exists(pfile)) {
    for (const { cells } of dataRows(read(pfile))) {
      if (/^20\d{8}/.test(cells[0] || '')) progress.push(cells);
    }
  }

  const reports = isDir(path.join(GEN, 'reports'))
    ? fs.readdirSync(path.join(GEN, 'reports')).filter((f) => /\.(md|html)$/.test(f) && !f.startsWith('INDEX')).sort()
    : [];

  const phaseText = exists(path.join(GEN, 'workflow/state/current-phase.md')) ? read(path.join(GEN, 'workflow/state/current-phase.md')) : '';
  const tbl = (key) => {
    for (const l of phaseText.split(/\r?\n/)) {
      if (!l.trim().startsWith('|')) continue;
      const c = splitRow(l);
      if (c[0] === key) return c[1] || '';
    }
    return '';
  };

  return { decisions, tests, failures, progress, reports, phase: { 阶段: tbl('阶段'), 当前切片: tbl('当前切片') } };
}

function cmdReport(opts) {
  const root = opts.root ? path.resolve(opts.root) : findProjectRoot();
  if (!root) return usage('找不到 .gen 项目');
  const type = String(opts.type || 'weekly');
  if (!REPORT_TYPES.includes(type)) return usage(`--type 只能是 ${REPORT_TYPES.join(' / ')}（收到「${type}」）`);
  const s = collectStats(root);
  const ts = tsFile();
  const title = String(opts.title || '进展自动汇总').replace(/[\\/:*?"<>|]/g, '-').slice(0, 40);
  const slug = String(opts.slug || 'auto').replace(/[^a-z0-9-]/gi, '-').toLowerCase() || 'auto';

  const md = buildReportMd({ s, title, ts, type, slug });
  if (opts.json) { console.log(JSON.stringify(s, null, 2)); return 0; }
  if (!opts.write) { process.stdout.write(md); return 0; }

  const file = path.join(root, '.gen/reports', `${ts}-${title}.md`);
  if (exists(file)) return usage(`已存在：${rel(file)}`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, md, 'utf8');
  addReportRow(path.join(root, '.gen/reports/INDEX.md'), `| ${ts} | ${title} | ${type} | 自动汇总，待人工补结论 | ${ts}-${title}.md |`);
  console.log(`${C.g}✔ 已生成${C.x} ${rel(file)}`);
  console.log(`${C.d}下一步：核对数字 → 补「一句话结论 / 风险 / 下一步 / 待拍板」→ status 改 final${C.x}`);
  return 0;
}

function addReportRow(file, row) {
  if (!exists(file)) return false;
  const lines = read(file).split(/\r?\n/);
  const head = lines.findIndex((l) => /^\|\s*时间\s*\|/.test(l));
  if (head < 0) { lines.push('', '| 时间 | 标题 | 类型 | 一句话结论 | 文件 |', '|---|---|---|---|---|', row); }
  else lines.splice(head + 2, 0, row);
  fs.writeFileSync(file, lines.join('\n'), 'utf8');
  return true;
}

function buildReportMd({ s, title, ts, type = 'weekly', slug = 'report' }) {
  const iso = nowISO();
  const rows = s.tests.recent.slice(-10).map((c) => `| ${c[0]} | ${c[1]} | \`${c[3]}\` | ${c[4]} | ${c[5]} |`).join('\n');
  const passRate = s.tests.total ? Math.round((s.tests.pass / s.tests.total) * 100) : 0;
  return `---
id: R-${ts}-${slug}
kind: report
title: ${title}
created: ${iso}
status: draft
report_type: ${type}
links: []
author: agent
---

# ${title}

> 自动汇总生成，数字来自 \`decisions/INDEX.md\`、\`tests/LEDGER.md\`、\`tests/failures/\`、\`progress.md\`。
> **数字需人工核对**，结论/风险/下一步必须人补；补完把 \`status\` 改 \`final\`。
> 结构固定十节（见 \`periodic-report\` skill）；标「待填写」的节是人写的部分。

## 1. 一句话结论

<!-- 待填写：≤40 字，说人话 -->

## 2. 本周期做了什么

${s.progress.length ? s.progress.slice(-8).map((c) => `- ${c[0]} ｜ ${c[1]} ｜ ${c[2]}`).join('\n') : '- （无）'}

## 3. 数字看板

| 指标 | 数值 | 来源 |
|---|---|---|
| 阶段 / 当前切片 | ${s.phase['阶段'] || '—'} / ${s.phase['当前切片'] || '—'} | current-phase.md |
| 决策 总数 / open / resolved / blocked / waived | ${s.decisions.total} / ${s.decisions.open} / ${s.decisions.resolved} / ${s.decisions.blocked} / ${s.decisions.waived} | decisions/INDEX.md |
| 测试 执行 / pass / fail / flaky | ${s.tests.total} / ${s.tests.pass} / ${s.tests.fail} / ${s.tests.flaky} | tests/LEDGER.md |
| 测试 通过率 | ${s.tests.total ? passRate + '%' : '—'} | tests/LEDGER.md |
| 失败档案 总数 / open | ${s.failures.total} / ${s.failures.open} | tests/failures/ |
| 已出报告 | ${s.reports.length} | reports/ |

## 4. 决策与变更

${s.decisions.rows.length ? s.decisions.rows.map((d) => `- \`${d.id}\` — ${d.status}`).join('\n') : '- （无）'}

## 5. 风险与阻塞

<!-- 待填写：每条写「影响 / 触发条件 / 建议怎么办」 -->

## 6. 质量

| 时间 | 切片 | 命令 | 结果 | 失败数 |
|---|---|---|---|---|
${rows || '| — | — | — | — | — |'}

未结失败：

${s.failures.items.length ? s.failures.items.map((f) => `- \`${f.file}\` ${f.severity || ''} — ${f.title || ''}`).join('\n') : '- （无）'}

<!-- 待填写：哪些验收标准仍未验证（写 unknown 的原因） -->

## 7. 架构影响

<!-- 待填写：哪个模块 / 契约 / key 变了；无则写「本周期无架构变更」 -->

## 8. 下一步

1. <!-- 待填写：可验收 -->

## 9. 需要你拍板的事

<!-- 0–3 条；有就开决策页，别只写在报告里 -->

## 10. 附录

- 生成命令：\`node .gen/scripts/gen.mjs report --title "${title}" --type ${type}\`
- 数字来源：\`decisions/INDEX.md\`、\`tests/LEDGER.md\`、\`tests/failures/\`、\`workflow/state/progress.md\`
- 环境矩阵：\`tests/matrix.md\`

## 勘误

`;
}

/* ───────────────── decision-diff：轮次差异 ───────────────── */

function diffPageData(prev, next) {
  const changes = [];
  const byId = (d) => new Map((d.items || []).map((it) => [it.id, it]));
  const P = byId(prev);
  const N = byId(next);

  for (const id of [...N.keys()]) if (!P.has(id)) changes.push({ item: id, kind: 'item-added', field: '问题', before: '', after: N.get(id).question || '' });
  for (const id of [...P.keys()]) if (!N.has(id)) changes.push({ item: id, kind: 'item-removed', field: '问题', before: P.get(id).question || '', after: '' });

  for (const [id, n] of N) {
    const p = P.get(id);
    if (!p) continue;
    const cmp = (field, label) => {
      const a = p[field] === undefined ? '' : String(p[field]);
      const b = n[field] === undefined ? '' : String(n[field]);
      if (a !== b) changes.push({ item: id, kind: 'changed', field: label, before: a, after: b });
    };
    cmp('recommend', '推荐');
    cmp('recommend_reason', '推荐理由');
    cmp('state', '状态');
    cmp('question', '问题');
    cmp('why_now', '为什么现在定');
    cmp('default_if_silent', '不决策的默认行为');

    const po = new Map((p.options || []).map((o) => [o.key, o]));
    const no = new Map((n.options || []).map((o) => [o.key, o]));
    for (const [k, o] of no) {
      if (!po.has(k)) { changes.push({ item: id, kind: 'option-added', field: `选项 ${k}`, before: '', after: `${o.label}｜代价：${o.cost}` }); continue; }
      const old = po.get(k);
      for (const f of ['label', 'how', 'gain', 'cost', 'reversible']) {
        if (String(old[f] ?? '') !== String(o[f] ?? '')) {
          changes.push({ item: id, kind: 'option-changed', field: `选项 ${k} 的 ${f}`, before: String(old[f] ?? ''), after: String(o[f] ?? '') });
        }
      }
    }
    for (const [k, o] of po) if (!no.has(k)) changes.push({ item: id, kind: 'option-removed', field: `选项 ${k}`, before: `${o.label}｜代价：${o.cost}`, after: '' });

    const pa = new Set(p.assumptions || []);
    const na = new Set(n.assumptions || []);
    for (const a of na) if (!pa.has(a)) changes.push({ item: id, kind: 'assumption-added', field: '待确认假设', before: '', after: a });
    for (const a of pa) if (!na.has(a)) changes.push({ item: id, kind: 'assumption-removed', field: '待确认假设', before: a, after: '' });

    const pe = new Set((p.excluded || []).map((e) => e.option));
    const ne = new Set((n.excluded || []).map((e) => e.option));
    for (const e of n.excluded || []) if (!pe.has(e.option)) changes.push({ item: id, kind: 'excluded-added', field: '已排除', before: '', after: `${e.option}：${e.reason}` });
    for (const e of p.excluded || []) if (!ne.has(e.option)) changes.push({ item: id, kind: 'excluded-removed', field: '已排除', before: `${e.option}：${e.reason}`, after: '' });
  }
  return changes;
}

const CHANGE_LABEL = {
  'item-added': '新增决策项',
  'item-removed': '删除决策项',
  'option-added': '新增选项',
  'option-removed': '删除选项',
  'option-changed': '选项内容变化',
  changed: '字段变化',
  'assumption-added': '新增假设',
  'assumption-removed': '移除假设',
  'excluded-added': '新增排除项',
  'excluded-removed': '移除排除项',
};

function cmdDecisionDiff(opts) {
  const root = opts.root ? path.resolve(opts.root) : findProjectRoot();
  if (!root) return usage('找不到 .gen 项目');
  const decisionsDir = path.join(root, '.gen/decisions');
  const id = String(opts.decision || opts._?.[0] || '');
  const dir = path.join(decisionsDir, id);
  if (!id || !isDir(dir)) return usage(`决策不存在：${id || '(未指定 --decision)'}`);

  const current = path.join(dir, 'page.html');
  if (!exists(current)) return usage(`缺少 ${rel(current)}`);
  const next = readPageData(current);
  const to = Number(opts.to || next.round || 1);
  const from = Number(opts.from || to - 1);
  if (!Number.isFinite(from) || from < 1) return usage('没有上一轮可对比（第一轮无需 diff）');

  const prevFile = from === next.round ? current : path.join(dir, `page-r${from}.html`);
  if (!exists(prevFile)) {
    console.error(`${C.y}⚠ 找不到第 ${from} 轮快照：${rel(prevFile)}${C.x}`);
    console.error(`${C.d}生成新一版页面时，把旧页面另存为 page-r${from}.html${C.x}`);
    return 1;
  }
  const prev = readPageData(prevFile);
  const changes = diffPageData(prev, next);

  if (opts.json) {
    console.log(JSON.stringify({ decision: id, from, to, count: changes.length, changes }, null, 2));
    return 0;
  }

  const out = path.join(dir, `diff-r${from}-r${to}.html`);
  fs.writeFileSync(out, renderDiffHtml({ id, from, to, prev, next, changes }), 'utf8');

  console.log(`${C.g}✔ 差异页${C.x} ${rel(out)}`);
  console.log(`${C.d}第 ${from} 轮 → 第 ${to} 轮，共 ${changes.length} 处变化${C.x}`);
  const grouped = new Map();
  for (const c of changes) {
    if (!grouped.has(c.item)) grouped.set(c.item, []);
    grouped.get(c.item).push(c);
  }
  for (const [item, list] of grouped) {
    console.log(`\n${C.b}${item}${C.x}`);
    for (const c of list) {
      console.log(`  ${C.y}${CHANGE_LABEL[c.kind] || c.kind}${C.x} · ${c.field}`);
      if (c.before) console.log(`    ${C.d}旧：${c.before.slice(0, 100)}${C.x}`);
      if (c.after) console.log(`    ${C.d}新：${c.after.slice(0, 100)}${C.x}`);
    }
  }
  return 0;
}

function renderDiffHtml({ id, from, to, prev, next, changes }) {
  const groups = new Map();
  for (const c of changes) {
    if (!groups.has(c.item)) groups.set(c.item, []);
    groups.get(c.item).push(c);
  }
  const section = [...groups].map(([item, list]) => `
  <section class="card">
    <h2>${esc(item)} <span class="muted">${list.length} 处变化</span></h2>
    <table>
      <thead><tr><th>类型</th><th>字段</th><th>旧</th><th>新</th></tr></thead>
      <tbody>
        ${list.map((c) => `<tr>
          <td><span class="tag ${c.kind}">${esc(CHANGE_LABEL[c.kind] || c.kind)}</span></td>
          <td>${esc(c.field)}</td>
          <td class="old">${esc(c.before) || '<span class="muted">—</span>'}</td>
          <td class="new">${esc(c.after) || '<span class="muted">—</span>'}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </section>`).join('');

  return `<!DOCTYPE html>
<!-- 为何 html：需要并排对比旧/新值，表格密度高，且属于整体快照 -->
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>决策差异 · ${esc(id)} · r${from}→r${to}</title>
<style>
  :root{--bg:#fbfbfa;--fg:#1f2328;--muted:#5b6570;--line:#d8dee4;--card:#fff;--accent:#1f6feb;--ok:#1a7f37;--warn:#9a6700;--bad:#cf222e}
  @media (prefers-color-scheme:dark){:root{--bg:#14171a;--fg:#e6edf3;--muted:#9aa4af;--line:#30363d;--card:#1b1f24;--accent:#4493f8;--ok:#3fb950;--warn:#d29922;--bad:#f85149}}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.7 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif}
  .wrap{max-width:1000px;margin:0 auto;padding:28px 18px 60px}
  h1{font-size:22px;margin:0 0 4px}
  .muted{color:var(--muted);font-size:13px;font-weight:400}
  .meta{color:var(--muted);font-size:14px;margin-bottom:18px}
  .card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px;margin:14px 0}
  h2{font-size:17px;margin:0 0 8px}
  table{width:100%;border-collapse:collapse;font-size:14px}
  th,td{border:1px solid var(--line);padding:7px 9px;text-align:left;vertical-align:top}
  th{background:rgba(127,127,127,.08)}
  td.old{color:var(--bad);text-decoration:line-through;text-decoration-color:rgba(207,34,46,.4)}
  td.new{color:var(--ok)}
  .tag{font-size:12px;padding:1px 7px;border-radius:999px;border:1px solid var(--line);white-space:nowrap}
  .tag.option-added,.tag.item-added{color:var(--ok);border-color:var(--ok)}
  .tag.option-removed,.tag.item-removed{color:var(--bad);border-color:var(--bad)}
  .tag.option-changed,.tag.changed{color:var(--warn);border-color:var(--warn)}
  .empty{padding:20px;text-align:center;color:var(--muted)}
</style></head>
<body><div class="wrap">
  <h1>决策差异 · ${esc(next.title || id)}</h1>
  <div class="meta">${esc(id)} ｜ 第 ${from} 轮 → 第 ${to} 轮 ｜ 共 ${changes.length} 处变化 ｜ 生成 ${esc(nowISO().slice(0, 16))}</div>
  ${changes.length ? section : '<div class="card empty">两轮之间没有差异（可能只是改了文字以外的内容）</div>'}
</div></body></html>`;
}

/* ─────────────────────────────── CLI ─────────────────────────────── */

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) out[key] = true;
      else { out[key] = next; i++; }
    } else out._.push(a);
  }
  return out;
}

function usage(msg) {
  if (msg) console.error(`${C.r}✖ ${msg}${C.x}\n`);
  console.log(`gen — .gen 体系工具链

用法：
  node .gen/scripts/gen.mjs lint   [--root <dir>] [--json] [--strict]
  node .gen/scripts/gen.mjs status [--root <dir>] [--json]
  node .gen/scripts/gen.mjs new    <report|decision|failure|handoff|plan|adr|review> [--title T] [--slug s] [--format md|html] [--ts YYYYMMDDHH]
  node .gen/scripts/gen.mjs init   [--root <dir>] [--force]
  node .gen/scripts/gen.mjs serve  [--decision <id>] [--port 7070] [--no-open]
  node .gen/scripts/gen.mjs demo   [--dir <dir>] [--force]
  node .gen/scripts/gen.mjs test
  node .gen/scripts/gen.mjs key-check [--root d] [--base <ref>] [--files a.ts,b.ts] [--fail-on high|critical|any|none] [--json]
  node .gen/scripts/gen.mjs install [--target claude|codex|cursor|dsh|<path>] [--global] [--link] [--force]
  node .gen/scripts/gen.mjs report  [--title T] [--write] [--type weekly|phase|incident|release] [--json]
  node .gen/scripts/gen.mjs decision-diff --decision <id> [--from N] [--to N] [--json]

退出码：0 通过 / 1 有错误或闸门阻塞 / 2 用法错误 / 3 环境错误`);
  return 2;
}

function main(argvIn = process.argv.slice(2)) {
  const cmd = argvIn[0];
  const opts = parseArgs(argvIn.slice(1));

  let code = 0;
  switch (cmd) {
    case 'lint': code = lint(opts.root, opts); break;
    case 'status': code = status(opts.root, opts); break;
    case 'new': code = cmdNew(opts._[0], opts); break;
    case 'init': code = cmdInit(opts); break;
    case 'serve': code = null; cmdServe(opts); break;
    case 'demo': code = cmdDemo(opts); break;
    case 'key-check': code = cmdKeyCheck(opts); break;
    case 'install': code = cmdInstall(opts); break;
    case 'report': code = cmdReport(opts); break;
    case 'decision-diff': code = cmdDecisionDiff(opts); break;
    case 'test': {
      // 便捷入口：跑工具自身的测试（等价于 node --test .gen/scripts/gen.test.mjs）
      const r = spawnSync(process.execPath, ['--test', path.join(HERE, 'gen.test.mjs')], { stdio: 'inherit' });
      code = r.status || 0;
      break;
    }
    case 'help': case '--help': case undefined: usage(); code = cmd ? 0 : 2; break;
    default: code = usage(`未知命令「${cmd}」`);
  }
  if (typeof code === 'number') process.exitCode = code;
  return code;
}

const invokedDirectly = (() => {
  try {
    return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
})();

if (invokedDirectly) main();

export {
  parseScalar,
  parseFrontmatter,
  splitRow,
  findProjectRoot,
  copyTree,
  tsFile,
  nowISO,
  lint,
  status,
  cmdNew,
  cmdInit,
  cmdDemo,
  cmdServe,
  addIndexRow,
  fillPageData,
  readPageData,
  parseRegistry,
  matchLocation,
  cmdKeyCheck,
  cmdInstall,
  cmdReport,
  cmdDecisionDiff,
  diffPageData,
  collectStats,
  parseArgs,
  main,
  KINDS,
  NEW_KINDS,
};
