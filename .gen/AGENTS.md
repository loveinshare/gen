# `.gen/AGENTS.md` — 目录契约与文件强规范

> 本文件定义 `.gen/` 内部**所有**文件的命名、时间戳、头部字段、状态枚举、追加规则与归档规则。
> 冲突时：根 `AGENTS.md` > 本文件 > 各 skill 的默认建议。改本文件属于 L3，需要人确认（`decision-page`）。

---

## 1. `.gen` 是什么

`.gen` = **gen**eration / **gen**ealogy：这里存的是**由工具生成、供工具与人对齐的过程产物**。

- 它是**过程真源**，不是代码真源。代码在仓库正常位置，`.gen` 不镜像代码。
- 它随仓库入库（少数运行日志除外），因为半年后追查的依据全在这里。
- 它不是 `.project` 的同义词重命名：`.project` 容易被理解成"项目工程文件"，而 `.gen` 强调的是"每一份产物都是某次会话生成、有生成者、有轮次、有依据"。

---

## 2. 目录树（权威版）

```text
.gen/
├── AGENTS.md                       # 本文件：目录契约
├── VERSION                         # 体系版本，如 4.2.0（SemVer）
│
├── skills/                         # 12 个 skill，符合 Agent Skills 规范
│   ├── README.md                   # 安装、触发、索引
│   ├── gen-init/
│   ├── continuation-planner/
│   ├── analyze/
│   ├── plan/
│   ├── decision-page/
│   ├── implement/
│   ├── validate/
│   ├── repair/
│   ├── periodic-report/
│   ├── test-ledger/
│   ├── arch-sync/
│   └── key-guard/
│
├── templates/                      # 所有模板的唯一真源
│   ├── state/                      # 状态栈 5 件套
│   ├── decision/                   # page.html / thread.md / response.md / INDEX.md
│   ├── spec/                       # spec.md / revision.md / plan.md
│   ├── report/                     # report.md / report.html
│   ├── test/                       # ledger.md / failure.md / matrix.md
│   ├── architecture/               # agent 层 / human 层 / key / adr
│   ├── ci/                         # gen-lint.yml 等 CI 片段
│   ├── handoff.md
│   └── gitignore.template
│
├── scripts/                        # 工具链（零依赖 Node）
│   ├── gen.mjs                     # lint/status/serve/new/init/demo/test/key-check/install/report/decision-diff
│   ├── gen.test.mjs                # 自测（node:test，56 个用例）
│   ├── new-artifact.ps1            # PowerShell 兼容包装
│   └── README.md                   # 用法、检查项、安全边界
│
├── workflow/
│   ├── state/
│   │   ├── project-snapshot.md     # 项目是什么：技术栈、模块、入口、运行方式
│   │   ├── current-phase.md        # 现在在哪：阶段、切片、下一步
│   │   ├── progress.md             # append-only：每次改动一行
│   │   ├── ambiguities.md          # 所有未解疑问（含不影响当前推进的）
│   │   └── done-criteria.md        # 本项目"做完"的定义
│   ├── plans/
│   │   └── YYYYMMDDHH-<phase>.md
│   └── handoffs/
│       └── YYYYMMDDHH-<slug>.md
│
├── decisions/
│   ├── INDEX.md                    # 看板（工具可读源）
│   ├── INDEX.html                  # 可选：决策多时由 INDEX.md 渲染
│   └── D-YYYYMMDDHH-<slug>/
│       ├── page.html               # 最新交互页
│       ├── thread.md               # 权威多轮线程，append-only
│       ├── response-r1.md          # 第 1 轮用户批复
│       ├── response-r2.md
│       └── page-r1.html            # 历史页快照
│
├── specs/
│   └── <feature>/
│       ├── spec.md                 # 当前有效规格
│       ├── revisions/
│       │   └── YYYYMMDDHH-<slug>.md
│       ├── plan.md                 # 当前切片计划（指向 workflow/plans 或内联）
│       └── decisions.md            # 只列相关决策 ID + 一句结论，不复制正文
│
├── reports/
│   ├── INDEX.md                    # 报告索引（按时间倒序，一行一份）
│   ├── YYYYMMDDHH-<标题>.md
│   ├── YYYYMMDDHH-<标题>.html
│   └── archive/
│       └── YYYY-QN/                # 季度归档
│
├── tests/
│   ├── LEDGER.md                   # 当月活账，append-only
│   ├── history/
│   │   └── LEDGER-YYYYMM.md        # 月结卷
│   ├── failures/
│   │   └── F-YYYYMMDDHH-<slug>.md  # 失败档案（进 git）
│   ├── fixtures/
│   │   └── <F-id>/                 # 最小复现数据（脱敏、小体积）
│   ├── runs/                       # 原始日志，gitignore
│   ├── matrix.md                   # 环境矩阵：OS / 运行时 / 依赖版本
│   └── README.md                   # 怎么跑、怎么记
│
└── architecture/
    ├── agent/                      # 机器/agent 读：单一真源
    │   ├── ARCHITECTURE.md         # 系统总图：边界、模块、数据流、不变量
    │   ├── modules/<module>.md
    │   ├── contracts/<contract>.md
    │   ├── flows/<flow>.md
    │   ├── key/
    │   │   ├── REGISTRY.md
    │   │   ├── CHANGELOG.md
    │   │   └── reviews/YYYYMMDDHH-<key-id>.md
    │   ├── adr/YYYYMMDDHH-<slug>.md
    │   └── snapshots/YYYYMMDDHH-<phase>.md   # 冻结，永不修改
    └── human/                      # 人读：生成物，禁止手改正文
        ├── ARCHITECTURE.md
        ├── KEY.md
        ├── GLOSSARY.md
        ├── KNOWN-ISSUES.md
        └── annotations/
            └── YYYYMMDDHH-批注.md   # 用户批注被处理后的回执
```

---

## 3. 命名强规范

### 3.1 时间戳 `TS`

**唯一格式：`YYYYMMDDHH`**（本地时间，24 小时制，**不补分钟的语义**）。

- 示例：`2026111502` = 2026-11-15 02 时。
- **同一小时产出多份时**，追加两位分钟：`YYYYMMDDHHmm`（`202611150230`）。仅在这种情况下使用。
- 禁止：`2026-11-15`、`Nov15`、`v2`、`final`、`new`、`改`、`副本`。
- 所有 TS 由 `date +%Y%m%d%H` 一类的命令生成，**不靠记忆**；生成后不得手改（改时间等于伪造历史）。

### 3.2 文件与目录名

`<TS>-<slug>` 或 `<前缀>-<TS>-<slug>`，其中：

| 类型 | 模式 | 示例 |
|---|---|---|
| 计划 | `workflow/plans/<TS>-<phase>.md` | `2026111502-auth-refactor.md` |
| 交接 | `workflow/handoffs/<TS>-<slug>.md` | `2026111502-resume-auth.md` |
| 决策目录 | `decisions/D-<TS>-<slug>/` | `decisions/D-2026111502-token-store/` |
| 规格修订 | `specs/<feature>/revisions/<TS>-<slug>.md` | `2026111502-scope-cut.md` |
| 报告 | `reports/<TS>-<标题>.md\|.html` | `2026111502-鉴权重构阶段评审.html` |
| 失败档案 | `tests/failures/F-<TS>-<slug>.md` | `tests/failures/F-2026111502-login-500.md` |
| key 评审 | `architecture/agent/key/reviews/<TS>-<key-id>.md` | `2026111502-K-token-verify.md` |
| ADR | `architecture/agent/adr/<TS>-<slug>.md` | `2026111502-adopt-jwt.md` |
| 快照 | `architecture/agent/snapshots/<TS>-<phase>.md` | `2026111502-auth-phase.md` |
| 批注回执 | `architecture/human/annotations/<TS>-批注.md` | `2026111502-批注.md` |

**slug 规则**：全小写 ASCII，`kebab-case`，3–6 个词，能独立看懂，不含技术黑话缩写。
**报告例外**：报告是给人看的门面，`<标题>` **允许中文**，但不得含空格、`/ \ : * ? " < > |` 与换行；超过 20 字请压缩。跨平台/CI 场景改用 ASCII slug，中文标题写进 H1 与 frontmatter `title`。

**中文命名总则**：只允许出现在"给人读的标题段"，路径段与程序读取的 ID 段一律 ASCII。

### 3.3 ID

| 对象 | ID 形式 | 说明 |
|---|---|---|
| 决策 | `D-<TS>-<slug>` | 与目录名一致 |
| 切片 | `S-<feature>-<NN>` | 如 `S-auth-03`，稳定不变 |
| 测试运行 | `T-<TS>-<NN>` | 同小时第 N 次运行 |
| 失败 | `F-<TS>-<slug>` | 与文件名一致 |
| key | `K-<name>` | 小写；版本另记 `v1.2.0` |
| 需求/规格 | `F-<feature>` | 与 `specs/` 目录同名 |
| 报告 | `R-<TS>-<slug>` | 文件名可带中文，ID 用 ASCII |

**ID 一旦分配不复用、不重编号**；废弃的 ID 只在 `INDEX.md` 标 `superseded`。

---

## 4. 文件头部规范

所有 `.gen/` 下的 md **必须**有 YAML frontmatter（模板已内置）：

```yaml
---
id: D-2026111502-token-store
kind: decision            # state|plan|handoff|decision|thread|response|spec|revision|report|ledger|failure|arch|key|review|adr|snapshot|annotation
title: 令牌存储方案取舍
created: 2026-11-15T02:30:00+08:00
updated: 2026-11-15T03:10:00+08:00
status: open              # 见 §5
feature: auth             # 可选
links: [S-auth-03]        # 可选，关联 ID
author: agent             # agent | human | both
---
```

规则：

- `id` / `kind` / `title` / `created` / `status` 必填，其余按需。
- 时间一律 **RFC 3339 带时区偏移**；文件名里的 `TS` 是它的本地压缩形式，两者必须同源。
- `kind` 是枚举，不许自造；新类型必须先改本文件（L3）。
- `links` 只放 ID，不放路径；路径由 ID 反查（`INDEX.md` 或 grep）。
- 表格、字段名、状态值一律**英文小写 + 连字符**，正文用中文。这样 grep 和脚本都稳。

---

## 5. 状态枚举（唯一合法取值）

| 对象 | 枚举 | 含义 |
|---|---|---|
| 决策 | `open` `resolved` `blocked` `superseded` | `blocked` = 等外部信息；`superseded` = 被新决策取代 |
| 决策项（单条） | `unanswered` `annotated` `closed` | 页面控件的三个状态 |
| 切片 / 阶段 | `todo` `doing` `blocked` `done` `dropped` | `dropped` 必须写原因 |
| 测试结果 | `pass` `fail` `flaky` `skipped` `blocked` | `flaky` 需 ≥3 次证据 |
| 缺陷 | `open` `mitigated` `fixed` `wontfix` | `wontfix` 必须写理由与影响 |
| key | `stable` `changing` `deprecated` | `changing` 期间禁止发布 |
| 评审 | `final` `draft` | key 变更评审单 |
| 报告 | `draft` `final` | `final` 后只许追加勘误节 |
| 架构文档 | `generated` `reviewed` | `reviewed` 需人签字（批注回执） |

**禁止自造状态**：如 `done-ish`、`基本完成`、`待定`。要表达就用正文。

---

## 6. 追加与冻结

| 文件 | 规则 |
|---|---|
| `thread.md` | **append-only**。每轮追加：`## Round N` → `### agent` → `### 用户批复` → `### agent 回应` |
| `progress.md` | **append-only**，一行一次变更；写错追加更正行，不删原行 |
| `LEDGER.md` | **append-only**；月末把内容剪切到 `history/LEDGER-YYYYMM.md` 并在活账留一行指针（唯一的"剪切"许可） |
| `CHANGELOG.md` | **append-only**，最新在最上；行格式 `<TS> \| <key> \| <旧→新> \| <原因> \| <D-id> \| <验证> \| <结果>` |
| `architecture/agent/snapshots/*` | **冻结**，永不修改；新阶段新建快照 |
| `reports/*` | `final` 后只许追加 `## 勘误` 节 |
| `specs/<f>/spec.md` | **可就地更新**，但每次实质修改必须同时在 `revisions/` 留一份快照式说明 |

---

## 7. 归档与清理

- 报告：每季度末把上一季度报告移入 `reports/archive/YYYY-QN/`，`INDEX.md` 保留一行指向归档。
- 决策：`superseded` 满 2 个季度后可移入 `decisions/archive/`，但 `INDEX.md` 行永远保留。
- 测试原始日志：`tests/runs/` 默认 gitignore，本地保留 **≥ 30 天**；失败档案与证据片段必须进 git。
- **禁止删除**：`thread.md`、`failures/`、`snapshots/`、`CHANGELOG.md`。要作废就标 `superseded` / `wontfix`。

---

## 8. gitignore 契约

`.gen/.gitignore`（模板见 `templates/gitignore.template`）应至少包含：

```gitignore
tests/runs/
*.local.md
*.secret.*
.env
.env.*
!.env.example
reports/_draft/
```

`.gen/` 其余内容**全部入库**。若仓库策略不允许提交过程文件，整体忽略 `.gen/` 但保留 `decisions/` 与 `architecture/`——这两处是追查依据，不能丢。

---

## 9. 格式判定（md vs html）落地细则

1. 写文件前先问：这份东西**要不要人动手**？要 → html。
2. 要不要**并排比较 3 个以上方案**或看**前后行为差异**？要 → html。
3. 一屏能否扫完？不能，且有分区导航价值 → html。
4. 其余 → md。
5. 选 html 时首行写 `<!-- 为何 html：<判据原文> -->`；选 md 时无需解释。
6. 同一份内容不要 md/html 双份维护；需要时 **md 为源、html 为渲染产物**，html 首行标注 `<!-- generated from: <path> @ <TS> -->` 并禁止手改。

---

## 10. 本文件的修改

改 §2 目录树、§3 命名、§4 头部字段、§5 状态枚举 = **L3**：必须开决策页，`resolved` 后同步更新 `.gen/VERSION`（次版本号 +1），并在 `progress.md` 记录迁移动作（老文件是否批量改名）。



