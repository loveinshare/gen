# `.gen/skills/` — 12 个 skill

格式遵循 [Agent Skills 规范](https://agentskills.io/specification)：目录名 = frontmatter `name`，必须含 `SKILL.md`，正文 ≤500 行，可选 `references/` `scripts/` `assets/`。
这样同一套文件可以被 Claude Code、Codex、Cursor、DSH 等支持该规范的客户端直接加载（不支持的客户端也能当普通文档读）。

## 安装（任选）

| 客户端 | 做法 |
|---|---|
| 支持 Agent Skills 的客户端 | 一条命令：`node .gen/scripts/gen.mjs install --target claude`（也支持 `codex` / `cursor` / 自定义路径；`--link` 用符号链接，Windows 走 junction） |
| 只认 `AGENTS.md` 的客户端（Codex、Cursor、Jules…） | 不用安装：根 `AGENTS.md` 已经把 12 个 skill 的触发条件和顺序写成制度，agent 会按需读取 `.gen/skills/<name>/SKILL.md` |
| 手动 | 在对话里说"读 .gen/skills/decision-page/SKILL.md 并按它执行" |

**关键点**：skill 是"操作规程"，`AGENTS.md` 是"制度"。两者都要在仓库里，缺一个就会退化成"建议"。

## 索引（按进程顺序）

| # | skill | 一句话 | 主要产物 |
|---|---|---|---|
| 0 | `gen-init` | 初始化 `.gen` 骨架 | 目录 + 状态栈 + 首份快照 |
| 1 | `continuation-planner` | 接管半成品，产出交接 | `handoffs/<TS>-<slug>.md` |
| 2 | `analyze` | 钉住事实、约束、风险、验收标准 | `spec.md` 现状与证据节 |
| 3 | `plan` | 拆有界切片，带停止规则 | `workflow/plans/<TS>-<phase>.md` |
| 4 | `decision-page` | **多轮交互决策，关闭才放行** | `decisions/D-*/` 全套 |
| 5 | `implement` | 过闸门、有界改、只做静态检查 | 有界 diff + 进度行 |
| 6 | `validate` | 一条标准一条证据 | 证据矩阵 + 台账行 |
| 7 | `repair` | 复现→根因→回归 | `tests/failures/F-*.md` |
| 8 | `test-ledger` | 测试账本与月卷 | `tests/LEDGER.md` |
| 9 | `periodic-report` | 定期报告与阶段评审 | `reports/<TS>-<标题>.html` |
| 10 | `arch-sync` | 双架构同步 + 批注回路 | `architecture/agent/*` + `human/*` |
| 11 | `key-guard` | 关键实现识别与守护 | `key/REGISTRY.md` + `CHANGELOG.md` + `reviews/` |

## 依赖关系

```
gen-init
  └─ continuation-planner
        └─ analyze ──► plan ──► decision-page ──► implement ──► validate
                                        ▲                        │
                                        │                        ├─► repair
                                        │                        │     └─► test-ledger
                                        └────────────────────────┴─► periodic-report
                                                                     └─► arch-sync ──► key-guard
```

## 公共约定（所有 skill 共用，不要在各处重复定义）

- 命名 / 时间戳 / frontmatter / 状态枚举：`.gen/AGENTS.md`
- 闸门：`decision-page` §6 定义，`implement` §0 执行
- 格式判定（md vs html）：根 `AGENTS.md` §4
- 模板：`.gen/templates/`（唯一真源，skill 内不重复维护模板）
- 机械检查交给 CLI：`node .gen/scripts/gen.mjs lint` / `status` / `new` / `serve` / `init` / `demo`，见 [scripts/README](../scripts/README.md)

## 校验

若环境里有 `skills-ref`：

```bash
skills-ref validate .gen/skills/decision-page
```

无该工具时，人工检查：目录名与 `name` 一致、`description` 含触发词、正文有"触发/不触发/步骤/交付判定/反模式"五段。
