/**
 * gen.mjs 自测（零依赖，Node ≥ 18：用了全局 fetch）
 *
 *   node --test .gen/scripts/gen.test.mjs
 *   node .gen/scripts/gen.mjs test          # 等价入口
 *
 * 约定：每个用例自己建临时项目（用真实模板 init），跑完删除。
 * 断言分两层：单元（parseFrontmatter 等）+ 端到端（spawn CLI，检查退出码与 JSON 输出）。
 */

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import * as gen from './gen.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, 'gen.mjs');
const BUNDLE = path.resolve(HERE, '..');
const REPO = path.resolve(BUNDLE, '..');

/* ───────────────────────── helpers ───────────────────────── */

const created = new Set();
function mkProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-test-'));
  created.add(root);
  quiet(() => gen.cmdInit({ root }));
  return root;
}
function cleanup(root) {
  created.delete(root);
  fs.rmSync(root, { recursive: true, force: true });
}
function quiet(fn) {
  const log = console.log;
  const err = console.error;
  console.log = () => {};
  console.error = () => {};
  try { return fn(); } finally { console.log = log; console.error = err; }
}

function runCli(args) {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout || '', err: r.stderr || '' };
}
function lintOf(root, extra = []) {
  const r = runCli(['lint', '--root', root, '--json', ...extra]);
  let data = null;
  try { data = JSON.parse(r.out); } catch { /* 保持 null，由断言暴露 */ }
  return { code: r.code, data, out: r.out, err: r.err };
}
const codesOf = (root) => (lintOf(root).data?.findings || []).map((f) => f.code);
const findingsOf = (root) => lintOf(root).data?.findings || [];

function write(root, rel, content) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
  return p;
}
function read(root, rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function edit(root, rel, fn) {
  const p = path.join(root, rel);
  fs.writeFileSync(p, fn(fs.readFileSync(p, 'utf8')), 'utf8');
}

function decisionOf(root) {
  const dir = path.join(root, '.gen', 'decisions');
  const id = fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith('D-'))
    .map((e) => e.name)
    .sort()
    .pop();
  return { id, dir: path.join(dir, id) };
}

function newDecision(root, slug = 'token-store', title = '令牌存储') {
  const before = new Set(fs.readdirSync(path.join(root, '.gen', 'decisions')));
  quiet(() => gen.cmdNew('decision', { root, slug, title, feature: 'auth' }));
  const { id, dir } = decisionOf(root);
  assert.ok(!before.has(id), '应当新建了决策目录');
  return { id, dir };
}

/** 把决策真正关闭：resolved + 有实质结论 + INDEX 同步 */
function closeDecision(root, id) {
  edit(root, `.gen/decisions/${id}/thread.md`, (s) =>
    s.replace('status: open', 'status: resolved')
      .replace(/^## 最终结论[\s\S]*$/m, `## 最终结论

1. **Q1 定为 C（双令牌）**：移动端没有 cookie 语义，用户已确认「按 C 走」。影响：签发与校验两处。
2. **Q2 定为 A（token 版本号）**：改密要立即生效，用户已确认。影响：用户表加字段。
`));
  edit(root, '.gen/decisions/INDEX.md', (s) =>
    s.replace(new RegExp(`\\| ${id} \\| open \\|`), `| ${id} | resolved |`));
}

after(() => {
  for (const r of [...created]) {
    try { fs.rmSync(r, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

/* ───────────────────────── 单元：frontmatter ───────────────────────── */

describe('frontmatter 解析', () => {
  test('基础字段 + 行内注释被剥离', () => {
    const fm = gen.parseFrontmatter('---\nid: D-1\nkind: decision\nstatus: open   # open | resolved\ntitle: 中文标题\n---\n\n正文\n');
    assert.equal(fm.data.id, 'D-1');
    assert.equal(fm.data.status, 'open');
    assert.equal(fm.data.title, '中文标题');
    assert.equal(fm.body.trim(), '正文');
  });

  test('links 行内数组会被拆成数组', () => {
    const fm = gen.parseFrontmatter('---\nid: x\nlinks: [S-auth-01, D-2026111503-a]\n---\n');
    assert.deepEqual(fm.data.links, ['S-auth-01', 'D-2026111503-a']);
  });

  test('缩进映射（metadata）不会污染顶层', () => {
    const fm = gen.parseFrontmatter('---\nname: demo\nmetadata:\n  version: "4.1.0"\n  system: .gen\n---\n');
    assert.equal(fm.data.name, 'demo');
    assert.equal(fm.data.metadata.version, '4.1.0');
    assert.equal(fm.data.system, undefined);
  });

  test('没有 frontmatter 返回 null', () => {
    assert.equal(gen.parseFrontmatter('# 只有标题\n'), null);
  });

  test('引号值去引号，中文冒号不受影响', () => {
    const fm = gen.parseFrontmatter('---\ntitle: "a: b"\ndesc: \'x\'\n---\n');
    assert.equal(fm.data.title, 'a: b');
    assert.equal(fm.data.desc, 'x');
  });
});

/* ───────────────────────── lint 基线 ───────────────────────── */

describe('lint 基线', () => {
  test('本仓库（模板包）无错误', () => {
    const { code, data } = lintOf(REPO);
    assert.equal(data.summary.errors, 0, JSON.stringify(data.findings, null, 2));
    assert.equal(code, 0);
  });

  test('刚 init 的项目无错误', () => {
    const root = mkProject();
    try {
      const { code, data } = lintOf(root);
      assert.equal(data.summary.errors, 0, JSON.stringify(data.findings, null, 2));
      assert.equal(code, 0);
    } finally { cleanup(root); }
  });

  test('--json 输出含 summary 与 findings', () => {
    const { data } = lintOf(REPO);
    assert.equal(typeof data.summary.errors, 'number');
    assert.ok(Array.isArray(data.findings));
  });
});

/* ───────────────────────── lint 负向（每条规则） ───────────────────────── */

describe('lint 能抓到具体缺陷', () => {
  test('E20 缺 frontmatter', () => {
    const root = mkProject();
    try {
      write(root, '.gen/reports/裸文件.md', '# 没有 frontmatter\n');
      assert.ok(codesOf(root).includes('E20'));
    } finally { cleanup(root); }
  });

  test('E21 缺必填字段 created', () => {
    const root = mkProject();
    try {
      edit(root, '.gen/tests/matrix.md', (s) => s.replace(/^created:.*$/m, ''));
      assert.ok(codesOf(root).includes('E21'));
    } finally { cleanup(root); }
  });

  test('E23 status 不在枚举内', () => {
    const root = mkProject();
    try {
      write(root, '.gen/tests/failures/F-2026111503-x.md',
        '---\nid: F-2026111503-x\nkind: failure\ntitle: x\ncreated: 2026-11-15T03:00:00+08:00\nstatus: 基本完成\n---\n');
      assert.ok(codesOf(root).includes('E23'));
    } finally { cleanup(root); }
  });

  test('E25 决策 id 与目录名不一致', () => {
    const root = mkProject();
    try {
      const { dir } = newDecision(root);
      const moved = path.join(path.dirname(dir), 'D-2026111503-other');
      fs.renameSync(dir, moved);
      assert.ok(codesOf(root).includes('E25'));
    } finally { cleanup(root); }
  });

  test('E26 文件名时间戳与 created 不一致', () => {
    const root = mkProject();
    try {
      write(root, '.gen/reports/2025010100-旧报告.md',
        '---\nid: R-2025010100-old\nkind: report\ntitle: 旧报告\ncreated: 2026-11-15T03:00:00+08:00\nstatus: final\n---\n');
      assert.ok(codesOf(root).includes('E26'));
    } finally { cleanup(root); }
  });

  test('E30 决策缺 page.html', () => {
    const root = mkProject();
    try {
      const { dir } = newDecision(root);
      fs.rmSync(path.join(dir, 'page.html'));
      assert.ok(codesOf(root).includes('E30'));
    } finally { cleanup(root); }
  });

  test('E32 resolved 但「最终结论」仍是占位', () => {
    const root = mkProject();
    try {
      const { id } = newDecision(root);
      edit(root, `.gen/decisions/${id}/thread.md`, (s) => s.replace('status: open', 'status: resolved'));
      const codes = codesOf(root);
      assert.ok(codes.includes('E32'), `实际: ${codes.join(',')}`);
    } finally { cleanup(root); }
  });

  test('E32 在结论写实后消失（只剩 INDEX 不一致）', () => {
    const root = mkProject();
    try {
      const { id } = newDecision(root);
      closeDecision(root, id);
      const codes = codesOf(root);
      assert.ok(!codes.includes('E32'), `实际: ${codes.join(',')}`);
      assert.ok(!codes.includes('E34'), `INDEX 已同步，不应再有 E34，实际: ${codes.join(',')}`);
    } finally { cleanup(root); }
  });

  test('E33 决策未登记进 INDEX', () => {
    const root = mkProject();
    try {
      const { id } = newDecision(root);
      edit(root, '.gen/decisions/INDEX.md', (s) => s.replace(new RegExp(`^\\| ${id} \\|.*$\\n?`, 'm'), ''));
      assert.ok(codesOf(root).includes('E33'));
    } finally { cleanup(root); }
  });

  test('E34 INDEX 与 thread 状态不一致', () => {
    const root = mkProject();
    try {
      const { id } = newDecision(root);
      edit(root, '.gen/decisions/INDEX.md', (s) => s.replace(new RegExp(`\\| ${id} \\| open \\|`), `| ${id} | blocked |`));
      assert.ok(codesOf(root).includes('E34'));
    } finally { cleanup(root); }
  });

  test('E35 INDEX 里有、磁盘上没有', () => {
    const root = mkProject();
    try {
      edit(root, '.gen/decisions/INDEX.md', (s) =>
        s.replace(/(\| decision_id \|.*\n\|[-|]+\|\n)/, `$1| D-2026111503-ghost | open | 1 | 幽灵 | 1 项 | — | 2026111503 |\n`));
      assert.ok(codesOf(root).includes('E35'));
    } finally { cleanup(root); }
  });

  test('E41 台账列数不是 9 列', () => {
    const root = mkProject();
    try {
      edit(root, '.gen/tests/LEDGER.md', (s) =>
        s.replace(/\| 2026111503 \|.*$/m, '| 2026111503 | S-x-01 | 自检 | `x` | pass | 0 | — | win |'));
      assert.ok(codesOf(root).includes('E41'));
    } finally { cleanup(root); }
  });

  test('W20 未填充的模板副本', () => {
    const root = mkProject();
    try {
      fs.copyFileSync(path.join(BUNDLE, 'templates/spec/plan.md'), path.join(root, '.gen/workflow/plans/2026111503-x.md'));
      assert.ok(codesOf(root).includes('W20'));
    } finally { cleanup(root); }
  });

  test('W70 仓库根出现过程文件', () => {
    const root = mkProject();
    try {
      write(root, 'NOTES.md', '随手记\n');
      assert.ok(codesOf(root).includes('W70'));
    } finally { cleanup(root); }
  });

  test('W90 links 指向不存在的决策', () => {
    const root = mkProject();
    try {
      edit(root, '.gen/tests/matrix.md', (s) => s.replace('status: generated', 'status: generated\nlinks: [D-1999010100-nope]'));
      assert.ok(codesOf(root).includes('W90'));
    } finally { cleanup(root); }
  });

  test('E13 skill 的 name 与目录不一致', () => {
    const root = mkProject();
    try {
      write(root, '.gen/skills/wrong-name/SKILL.md', '---\nname: other-name\ndescription: 一个用于测试的技能描述，长度足够触发检查逻辑。\n---\n\n# x\n');
      assert.ok(codesOf(root).includes('E13'));
    } finally { cleanup(root); }
  });

  test('E01 不是 .gen 项目', () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-empty-'));
    try {
      const r = lintOf(empty);
      assert.equal(r.code, 1);
      assert.equal(r.data.findings[0].code, 'E01');
    } finally { fs.rmSync(empty, { recursive: true, force: true }); }
  });

  test('--strict 把警告升级为失败', () => {
    const root = mkProject();
    try {
      write(root, '.gen/reports/2026111503-未登记.md',
        '---\nid: R-2026111503-x\nkind: report\ntitle: 未登记\ncreated: 2026-11-15T03:00:00+08:00\nstatus: final\n---\n');
      assert.equal(lintOf(root).code, 0, '默认警告不失败');
      assert.equal(lintOf(root, ['--strict']).code, 1, 'strict 下应失败');
    } finally { cleanup(root); }
  });
});

/* ───────────────────────── status ───────────────────────── */

describe('status 闸门', () => {
  test('有 open 决策 → 退出码 1，canImplement=false', () => {
    const root = mkProject();
    try {
      newDecision(root);
      const r = runCli(['status', '--root', root, '--json']);
      const data = JSON.parse(r.out);
      assert.equal(r.code, 1);
      assert.equal(data.canImplement, false);
      assert.equal(data.open.length, 1);
    } finally { cleanup(root); }
  });

  test('全部 resolved → 退出码 0', () => {
    const root = mkProject();
    try {
      const { id } = newDecision(root);
      closeDecision(root, id);
      const r = runCli(['status', '--root', root, '--json']);
      const data = JSON.parse(r.out);
      assert.equal(r.code, 0, JSON.stringify(data));
      assert.equal(data.canImplement, true);
      assert.deepEqual(data.open, []);
    } finally { cleanup(root); }
  });

  test('能从状态表读到阶段与当前切片', () => {
    const root = mkProject();
    try {
      edit(root, '.gen/workflow/state/current-phase.md', (s) =>
        s.replace(/\| 阶段 \|.*\|/, '| 阶段 | auth-refactor |')
          .replace(/\| 当前切片 \|.*\|/, '| 当前切片 | S-auth-03（blocked） |'));
      const r = runCli(['status', '--root', root, '--json']);
      assert.equal(JSON.parse(r.out).phaseTable['阶段'], 'auth-refactor');
    } finally { cleanup(root); }
  });
});

/* ───────────────────────── new / init ───────────────────────── */

describe('new', () => {
  test('decision：目录 + thread id + 自动登记 INDEX', () => {
    const root = mkProject();
    try {
      const { id, dir } = newDecision(root, 'cache-strategy', '缓存策略');
      assert.ok(fs.existsSync(path.join(dir, 'page.html')));
      assert.match(read(root, `.gen/decisions/${id}/thread.md`), new RegExp(`id: ${id}`));
      assert.ok(read(root, '.gen/decisions/INDEX.md').includes(id), 'INDEX 应自动加行');
      assert.equal(lintOf(root).data.summary.errors, 0);
    } finally { cleanup(root); }
  });

  test('同小时同 slug 重名会被拒绝（退出码 2）', () => {
    const root = mkProject();
    try {
      newDecision(root, 'dup');
      const r = quiet(() => gen.cmdNew('decision', { root, slug: 'dup' }));
      assert.equal(r, 2);
    } finally { cleanup(root); }
  });

  test('report 支持 md 与 html，文件名带 TS', () => {
    const root = mkProject();
    try {
      quiet(() => gen.cmdNew('report', { root, title: '第47周进展', format: 'md' }));
      quiet(() => gen.cmdNew('report', { root, title: '阶段评审', format: 'html' }));
      const files = fs.readdirSync(path.join(root, '.gen/reports'), { withFileTypes: true })
        .filter((e) => e.isFile() && !e.name.startsWith('INDEX'))
        .map((e) => e.name);
      assert.equal(files.length, 2);
      assert.ok(files.every((f) => /^\d{10}-/.test(f)));
      assert.ok(files.some((f) => f.endsWith('.md')) && files.some((f) => f.endsWith('.html')));
    } finally { cleanup(root); }
  });

  test('failure / handoff / plan / adr / review 落在正确目录', () => {
    const root = mkProject();
    try {
      quiet(() => {
        gen.cmdNew('failure', { root, slug: 'login-500', title: '登录 500' });
        gen.cmdNew('handoff', { root, slug: 'resume' });
        gen.cmdNew('plan', { root, slug: 'auth' });
        gen.cmdNew('adr', { root, slug: 'adopt-jwt' });
        gen.cmdNew('review', { root, slug: 'K-token-verify' });
      });
      assert.ok(fs.readdirSync(path.join(root, '.gen/tests/failures')).some((f) => f.startsWith('F-')));
      assert.ok(fs.readdirSync(path.join(root, '.gen/workflow/handoffs')).length >= 1);
      assert.ok(fs.readdirSync(path.join(root, '.gen/workflow/plans')).length >= 1);
      assert.ok(fs.readdirSync(path.join(root, '.gen/architecture/agent/adr')).length >= 1);
      assert.ok(fs.readdirSync(path.join(root, '.gen/architecture/agent/key/reviews')).length >= 1);
      assert.equal(lintOf(root).data.summary.errors, 0, JSON.stringify(findingsOf(root), null, 2));
    } finally { cleanup(root); }
  });
});

describe('init', () => {
  test('幂等：第二次运行不新增文件', () => {
    const root = mkProject();
    try {
      const count = () => fs.readdirSync(root, { recursive: true, withFileTypes: true })
        .filter((e) => e.isFile()).length;
      const before = count();
      quiet(() => gen.cmdInit({ root }));
      assert.equal(count(), before);
      assert.equal(lintOf(root).data.summary.errors, 0);
    } finally { cleanup(root); }
  });

  test('--force 覆盖已存在文件', () => {
    const root = mkProject();
    try {
      write(root, '.gen/workflow/state/progress.md', '破坏内容\n');
      quiet(() => gen.cmdInit({ root, force: true }));
      assert.match(read(root, '.gen/workflow/state/progress.md'), /kind: state/);
    } finally { cleanup(root); }
  });
});

/* ───────────────────────── demo ───────────────────────── */

describe('demo', () => {
  test('生成的示例项目 lint 通过、status 报阻塞、结构完整', () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-demo-test-'));
    const target = path.join(parent, 'app');
    try {
      quiet(() => gen.cmdDemo({ dir: target }));
      assert.ok(fs.existsSync(path.join(target, 'AGENTS.md')));
      assert.ok(fs.existsSync(path.join(target, '.gen/skills/decision-page/SKILL.md')));

      const { data } = lintOf(target);
      assert.equal(data.summary.errors, 0, JSON.stringify(data.findings, null, 2));

      const r = runCli(['status', '--root', target, '--json']);
      assert.equal(r.code, 1);
      assert.equal(JSON.parse(r.out).open.length, 1);

      const { id } = decisionOf(target);
      assert.ok(fs.existsSync(path.join(target, '.gen/reports')), 'reports 目录应存在');
      assert.ok(fs.readdirSync(path.join(target, '.gen/reports')).some((f) => f.endsWith('.html')));

      const ledger = fs.readFileSync(path.join(target, '.gen/tests/LEDGER.md'), 'utf8');
      assert.ok(ledger.includes(id), '台账应引用该决策');
    } finally { fs.rmSync(parent, { recursive: true, force: true }); }
  });
});

/* ───────────────────────── serve ───────────────────────── */

async function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}
async function waitFor(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return r;
    } catch { /* 还没起来 */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`服务未就绪: ${url}`);
}

describe('serve', () => {
  test('GET 列表 / GET 页面 / POST 落盘 / 非法 ID 被拒', async () => {
    const root = mkProject();
    const { id } = newDecision(root);
    const port = await freePort();
    const child = spawn(process.execPath, [CLI, 'serve', '--root', root, '--port', String(port), '--no-open'], {
      stdio: 'pipe',
    });
    try {
      const base = `http://127.0.0.1:${port}`;
      const home = await waitFor(`${base}/`);
      assert.equal(home.status, 200);
      assert.match(await home.text(), new RegExp(id));

      const page = await fetch(`${base}/${id}/`);
      assert.equal(page.status, 200);
      const html = await page.text();
      assert.match(html, /saveToDisk/);

      const md = '# 批复：测试\n\n## Q1\n- 状态：已关闭\n- 我的批复：按 C 走。\n';
      const post = await fetch(`${base}/api/response`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, round: '2', markdown: md }),
      });
      assert.equal(post.status, 200);
      const body = await post.json();
      assert.equal(body.ok, true);
      const saved = path.join(root, '.gen/decisions', id, 'response-r2.md');
      assert.ok(fs.existsSync(saved), '应写入 response-r2.md');
      const text = fs.readFileSync(saved, 'utf8');
      assert.match(text, /kind: response/);
      assert.match(text, /按 C 走/);

      const bad = await fetch(`${base}/api/response`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: '../../etc', round: '1', markdown: 'x' }),
      });
      assert.equal(bad.status, 400);

      const empty = await fetch(`${base}/api/response`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, round: '1', markdown: '   ' }),
      });
      assert.equal(empty.status, 400, '空批复应被拒');

      const missing = await fetch(`${base}/${id}/thread.md`);
      assert.equal(missing.status, 200);
      assert.match(await missing.text(), /kind: thread/);
    } finally {
      child.kill();
      cleanup(root);
    }
  });

  test('不存在的决策返回 404', async () => {
    const root = mkProject();
    const port = await freePort();
    const child = spawn(process.execPath, [CLI, 'serve', '--root', root, '--port', String(port), '--no-open'], {
      stdio: 'pipe',
    });
    try {
      await waitFor(`http://127.0.0.1:${port}/`);
      const r = await fetch(`http://127.0.0.1:${port}/D-2026111503-ghost/`);
      assert.equal(r.status, 404);
    } finally {
      child.kill();
      cleanup(root);
    }
  });
});

/* ───────────────────────── 回归：非 ASCII 路径 ───────────────────────── */

describe('copyTree', () => {
  test('能复制含中文的源路径（fs.cpSync 会崩，这是回归用例）', () => {
    const src = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-中文源-'));
    const dstParent = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-dst-'));
    const dst = path.join(dstParent, '副本');
    try {
      write(src, 'a/b/深.md', '内容\n');
      gen.copyTree(src, dst);
      assert.equal(fs.readFileSync(path.join(dst, 'a/b/深.md'), 'utf8'), '内容\n');
    } finally {
      fs.rmSync(src, { recursive: true, force: true });
      fs.rmSync(dstParent, { recursive: true, force: true });
    }
  });
});

/* ───────────────────────── key-check ───────────────────────── */

const hasGit = spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0;
function git(root, args) {
  const r = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} 失败: ${r.stderr}`);
  return r.stdout;
}
function initGitRepo(root) {
  git(root, ['init', '-q']);
  git(root, ['add', '-A']);
  git(root, ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init']);
}
function setKeyRow(root, location, level = 'critical') {
  const rel = '.gen/architecture/agent/key/REGISTRY.md';
  edit(root, rel, (s) => s.replace(
    /\| K-example \|.*$/m,
    `| K-token-verify | ${level} | 令牌校验 | \`${location}\` | 同一时刻最多一个有效令牌 | \`tests/key/x.spec.ts\` | v1.0.0 | stable | 用户@20261115 |`,
  ));
}

describe('key-check', () => {
  test('命中 key 区间 → 退出码 1，并给出决策建议', { skip: !hasGit }, () => {
    const root = mkProject();
    try {
      setKeyRow(root, 'src/auth/verify.ts:1-20');
      write(root, 'src/auth/verify.ts', Array.from({ length: 40 }, (_, i) => `// line ${i + 1}`).join('\n'));
      initGitRepo(root);
      edit(root, 'src/auth/verify.ts', (s) => s.replace('// line 5', '// line 5 CHANGED'));

      const r = runCli(['key-check', '--root', root]);
      assert.equal(r.code, 1, r.err);
      assert.match(r.out, /K-token-verify/);
      assert.match(r.out, /new decision --slug key-token-verify/);
    } finally { cleanup(root); }
  });

  test('只改 key 区间之外 → 退出码 0（提示但不算命中）', { skip: !hasGit }, () => {
    const root = mkProject();
    try {
      setKeyRow(root, 'src/auth/verify.ts:1-20');
      write(root, 'src/auth/verify.ts', Array.from({ length: 40 }, (_, i) => `// line ${i + 1}`).join('\n'));
      initGitRepo(root);
      edit(root, 'src/auth/verify.ts', (s) => s.replace('// line 30', '// line 30 CHANGED'));

      const r = runCli(['key-check', '--root', root]);
      assert.equal(r.code, 0, r.out + r.err);
      assert.match(r.out, /不在登记区间|没有 key 被触碰/);
    } finally { cleanup(root); }
  });

  test('--fail-on none 不拦截，但 --json 仍报告命中', { skip: !hasGit }, () => {
    const root = mkProject();
    try {
      setKeyRow(root, 'src/auth/verify.ts:1-20');
      write(root, 'src/auth/verify.ts', Array.from({ length: 40 }, (_, i) => `// line ${i + 1}`).join('\n'));
      initGitRepo(root);
      edit(root, 'src/auth/verify.ts', (s) => s.replace('// line 5', '// line 5 X'));

      assert.equal(runCli(['key-check', '--root', root, '--fail-on', 'none']).code, 0);
      const j = runCli(['key-check', '--root', root, '--json']);
      const data = JSON.parse(j.out);
      assert.equal(data.failing.length, 1);
      assert.equal(data.changes[0].key_id, 'K-token-verify');
      assert.equal(data.changes[0].hits[0].kind, 'lines');
    } finally { cleanup(root); }
  });

  test('--files 手动指定，不依赖 git', () => {
    const root = mkProject();
    try {
      setKeyRow(root, 'src/auth/verify.ts:1-20');
      const hit = runCli(['key-check', '--root', root, '--files', 'src/auth/verify.ts']);
      assert.equal(hit.code, 1);
      const miss = runCli(['key-check', '--root', root, '--files', 'src/other.ts']);
      assert.equal(miss.code, 0);
    } finally { cleanup(root); }
  });

  test('非 git 仓库且无 --files → 退出码 3', { skip: !hasGit }, () => {
    const root = mkProject();
    try {
      setKeyRow(root, 'src/auth/verify.ts:1-20');
      const r = runCli(['key-check', '--root', root]);
      assert.equal(r.code, 3);
    } finally { cleanup(root); }
  });
});

/* ───────────────────────── install ───────────────────────── */

describe('install', () => {
  test('安装 12 个 skill 到 .claude/skills 并写清单', () => {
    const root = mkProject();
    try {
      const r = runCli(['install', '--root', root, '--target', 'claude']);
      assert.equal(r.code, 0, r.err);
      const dest = path.join(root, '.claude/skills');
      const skills = fs.readdirSync(dest, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
      assert.equal(skills.length, 12);
      assert.ok(fs.existsSync(path.join(dest, 'decision-page/SKILL.md')));
      const manifest = JSON.parse(fs.readFileSync(path.join(dest, '.gen-install.json'), 'utf8'));
      assert.equal(manifest.system, 'gen');
      assert.equal(manifest.skills.length, 12);
      assert.match(manifest.version, /^\d+\.\d+\.\d+/);
    } finally { cleanup(root); }
  });

  test('重复安装是幂等的', () => {
    const root = mkProject();
    try {
      assert.equal(runCli(['install', '--root', root, '--target', 'claude']).code, 0);
      assert.equal(runCli(['install', '--root', root, '--target', 'claude']).code, 0);
      assert.equal(fs.readdirSync(path.join(root, '.claude/skills')).filter((f) => !f.startsWith('.')).length, 12);
    } finally { cleanup(root); }
  });

  test('目标目录已存在且非 gen 安装 → 拒绝；--force 可覆盖', () => {
    const root = mkProject();
    try {
      write(root, 'my-skills/README.md', '手写的\n');
      const refused = runCli(['install', '--root', root, '--target', 'my-skills']);
      assert.equal(refused.code, 1);
      assert.match(refused.err, /不是 gen 安装/);
      const forced = runCli(['install', '--root', root, '--target', 'my-skills', '--force']);
      assert.equal(forced.code, 0);
      assert.ok(fs.existsSync(path.join(root, 'my-skills/decision-page/SKILL.md')));
    } finally { cleanup(root); }
  });

  test('--link 安装后仍可读到 SKILL.md', () => {
    const root = mkProject();
    try {
      const r = runCli(['install', '--root', root, '--target', 'claude', '--link']);
      assert.equal(r.code, 0, r.err);
      assert.match(fs.readFileSync(path.join(root, '.claude/skills/plan/SKILL.md'), 'utf8'), /name: plan/);
    } finally { cleanup(root); }
  });
});

/* ───────────────────────── report ───────────────────────── */

describe('report', () => {
  function buildFixture() {
    const root = mkProject();
    const { id } = newDecision(root);
    // 补一条失败台账与一个失败档案
    edit(root, '.gen/tests/LEDGER.md', (s) => `${s.trimEnd()}
| 2026111504 | S-x-01 | 自检 | \`node --test\` | fail | 1 | F-2026111504-x | win11/node20 | — |
`);
    quiet(() => gen.cmdNew('failure', { root, slug: 'x', title: '某个失败' }));
    return { root, id };
  }

  test('汇总数字正确（stdout 模式）', () => {
    const { root } = buildFixture();
    try {
      const r = runCli(['report', '--root', root, '--title', '自动汇总']);
      assert.equal(r.code, 0, r.err);
      assert.match(r.out, /决策 总数 \/ open \/ resolved \/ blocked \| 1 \/ 1 \/ 0 \/ 0/);
      assert.match(r.out, /失败档案 总数 \/ open \| 1 \/ 1/);
      assert.match(r.out, /status: draft/);
      assert.match(r.out, /待填写/);
    } finally { cleanup(root); }
  });

  test('--write 生成报告、登记 INDEX，且 lint 保持 0 error', () => {
    const { root } = buildFixture();
    try {
      const r = runCli(['report', '--root', root, '--title', '第47周进展', '--write']);
      assert.equal(r.code, 0, r.err);
      const files = fs.readdirSync(path.join(root, '.gen/reports')).filter((f) => f.endsWith('.md') && !f.startsWith('INDEX'));
      assert.equal(files.length, 1);
      assert.ok(files[0].includes('第47周进展'));
      assert.match(fs.readFileSync(path.join(root, '.gen/reports/INDEX.md'), 'utf8'), /第47周进展/);
      assert.equal(lintOf(root).data.summary.errors, 0);
    } finally { cleanup(root); }
  });

  test('--json 返回结构化统计', () => {
    const { root } = buildFixture();
    try {
      const r = runCli(['report', '--root', root, '--json']);
      const s = JSON.parse(r.out);
      assert.equal(s.decisions.open, 1);
      assert.equal(s.failures.open, 1);
      assert.ok(s.tests.total >= 1);
    } finally { cleanup(root); }
  });
});

/* ───────────────────────── decision-diff ───────────────────────── */

describe('decision-diff', () => {
  function makeTwoRounds() {
    const root = mkProject();
    const { id, dir } = newDecision(root);
    const tpl = fs.readFileSync(path.join(BUNDLE, 'templates/decision/page.html'), 'utf8');
    const next = {
      id, title: '令牌存储', round: 2, goal: 'g', decision_question: 'q', updated: '2026-11-15T03:00',
      items: [
        {
          id: 'Q1', question: '令牌放哪？', why_now: 'w', options: [
            { key: 'A', label: 'Cookie', how: 'h', gain: 'g', cost: 'c', reversible: '可逆' },
            { key: 'B', label: 'Header', how: 'h', gain: 'g', cost: 'c2', reversible: '可逆' },
          ], recommend: 'B', recommend_reason: '简单', assumptions: ['假设只有 Web'], excluded: [], default_if_silent: '按 B', state: 'annotated', answers: {},
        },
        { id: 'Q2', question: '失效窗口？', why_now: 'w2', options: [{ key: 'A', label: '立即', how: 'h', gain: 'g', cost: 'c', reversible: '可逆' }], recommend: 'A', recommend_reason: '安全', assumptions: [], excluded: [], default_if_silent: '按 A', state: 'unanswered', answers: {} },
      ],
    };
    const prevItem = {
      ...JSON.parse(JSON.stringify(next.items[0])),
      recommend: 'A',
      recommend_reason: '最简单',
      assumptions: ['假设只有 Web'],
      state: 'unanswered',
    };
    prevItem.options = prevItem.options.map((o) => (o.key === 'B' ? { ...o, cost: 'c-old' } : o));
    const prev = { ...next, round: 1, items: [prevItem] };
    fs.writeFileSync(path.join(dir, 'page.html'), gen.fillPageData(tpl, next), 'utf8');
    fs.writeFileSync(path.join(dir, 'page-r1.html'), gen.fillPageData(tpl, prev), 'utf8');
    return { root, id, dir };
  }

  test('--json 能识别新增项、推荐变化、选项变化', () => {
    const { root, id } = makeTwoRounds();
    try {
      const r = runCli(['decision-diff', '--root', root, '--decision', id, '--json']);
      assert.equal(r.code, 0, r.err);
      const data = JSON.parse(r.out);
      assert.equal(data.from, 1);
      assert.equal(data.to, 2);
      const kinds = data.changes.map((c) => c.kind);
      assert.ok(kinds.includes('item-added'), JSON.stringify(data.changes));
      assert.ok(data.changes.some((c) => c.field === '推荐' && c.before === 'A' && c.after === 'B'));
      assert.ok(data.changes.some((c) => c.field.includes('选项 B') && c.kind === 'option-changed'));
    } finally { cleanup(root); }
  });

  test('默认写出 diff HTML，含旧值与新值', () => {
    const { root, id, dir } = makeTwoRounds();
    try {
      const r = runCli(['decision-diff', '--root', root, '--decision', id]);
      assert.equal(r.code, 0, r.err);
      const file = path.join(dir, 'diff-r1-r2.html');
      assert.ok(fs.existsSync(file));
      const html = fs.readFileSync(file, 'utf8');
      assert.match(html, /第 1 轮 → 第 2 轮/);
      assert.match(html, /class="old"/);
      assert.match(html, /新增决策项/);
    } finally { cleanup(root); }
  });

  test('缺少上一轮快照 → 退出码 1 并提示命名', () => {
    const { root, id, dir } = makeTwoRounds();
    try {
      fs.rmSync(path.join(dir, 'page-r1.html'));
      const r = runCli(['decision-diff', '--root', root, '--decision', id]);
      assert.equal(r.code, 1);
      assert.match(r.err, /page-r1\.html/);
    } finally { cleanup(root); }
  });

  test('demo 自带两轮，可直接 diff', () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-diff-demo-'));
    const target = path.join(parent, 'app');
    try {
      quiet(() => gen.cmdDemo({ dir: target }));
      const { id } = decisionOf(target);
      const r = runCli(['decision-diff', '--root', target, '--decision', id, '--json']);
      assert.equal(r.code, 0, r.err);
      assert.ok(JSON.parse(r.out).count > 0);
    } finally { fs.rmSync(parent, { recursive: true, force: true }); }
  });
});

/* ───────────────────────── 技能包完整性 ───────────────────────── */

describe('技能包', () => {
  test('12 个核心 skill 齐全且 frontmatter 合法', () => {
    const dir = path.join(BUNDLE, 'skills');
    const names = fs.readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
    const expect = ['gen-init', 'continuation-planner', 'analyze', 'plan', 'decision-page',
      'implement', 'validate', 'repair', 'periodic-report', 'test-ledger', 'arch-sync', 'key-guard'];
    for (const n of expect) assert.ok(names.includes(n), `缺少 ${n}`);
    for (const n of names) {
      const text = fs.readFileSync(path.join(dir, n, 'SKILL.md'), 'utf8');
      const fm = gen.parseFrontmatter(text);
      assert.ok(fm, `${n} 缺 frontmatter`);
      assert.equal(fm.data.name, n);
      assert.ok(String(fm.data.description).length > 40, `${n} description 过短`);
    }
  });
});
