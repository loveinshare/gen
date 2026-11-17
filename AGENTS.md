# AGENTS.md — 项目宪法（.gen 体系 · 通用版）

> 适用范围：本仓库及其所有子目录里的任何 AI coding 工具（Claude Code、Codex CLI、Cursor、Gemini CLI、DSH、Aider…）。
> 生效顺序：**用户当前对话里的明确指令 > 离被改文件最近的 AGENTS.md > 仓库根 AGENTS.md > `.gen/AGENTS.md` > 各 skill 的默认建议**。
> 本文件是"制度"，`.gen/skills/` 是"操作规程"，`.gen/` 下其余目录是"运行状态"。制度只写不可协商的部分。

---

## 0. 一句话

**先对齐，再动手；过程留痕在 `.gen/`，仓库根目录不放过程文件。**

任何一次改动都应能回答三个问题：为什么做（决策）、做了什么（切片+diff）、怎么证明（测试证据）。答不上来就不要提交。

---

## 1. 铁律（R1–R10，违反即视为流程失败，需回滚重做）

| 编号 | 铁律 | 判定方式 |
|---|---|---|
| **R1** | **未关闭的决策不得进入实现。** 当前 feature/slice 关联的决策只要有一个不是 `resolved`，`implement` 必须拒绝执行并列出未关闭项。 | 读 `.gen/decisions/INDEX.md` + 对应 `thread.md` 最终结论段 |
| **R2** | **单一真源。** 同一事实只在一个文件里定义，其余地方只链接、不复制。人读架构文档是**生成物**，禁止手改正文。 | 出现两处同一张字段表即视为违反 |
| **R3** | **不声称未验证的通过。** 没跑过就说没跑过；没证据就写 `unknown`，不写 `pass`。 | `validate` 的证据矩阵每行必须有命令与输出 |
| **R4** | **接管先读状态。** 新会话、恢复会话、换工具，先跑 `continuation-planner`，产出 handoff 后才允许改代码。 | `.gen/workflow/handoffs/` 有当次文件 |
| **R5** | **append-only 文件只追加。** `thread.md`、`progress.md`、`LEDGER.md`、`CHANGELOG.md` 永不覆盖历史；写错就追加一条更正。 | git diff 出现删除行即违反 |
| **R6** | **写文件前先判定 md/html。** 默认 md；选 html 必须写明触发了哪条判据（§4）。 | 产物头部或 `_format-note.md` 有一句理由 |
| **R7** | **秘密不入库。** `.env`、token、私钥、用户数据样本一律不写进 `.gen/` 与 git。测试用脱敏 fixture。 | 提交前扫描 |
| **R8** | **key 变更必须人确认。** AI 只能提候选；判定、守护级别、变更放行由人签字。 | `.gen/architecture/agent/key/REGISTRY.md` 有 `confirmed_by` |
| **R9** | **不静默扩大范围。** 一个切片只做计划里列出的文件；需要扩大就先改 plan 并记录原因。 | 与 `plan.md` 的 touch list 对比 |
| **R10** | **不留悬空指针。** 文档里引用的路径、决策 ID、测试 ID 必须存在；删除文件前先改引用。 | `arch-sync` 的 drift check |

---

## 2. 进程模型

所有 skill 挂在这一条环上，**不跳步，但可判定为"不适用"并写明理由**：

```
intake → analyze → plan → decision-gate → implement → validate → repair → document → advance
```

| 阶段 | 入口 skill | 必需产物 | 何时可以离开 |
|---|---|---|---|
| intake | `continuation-planner` | `handoffs/<ts>-<slug>.md`、刷新 `project-snapshot.md` | 状态栈读完、未决项列清 |
| analyze | `analyze` | 证据、约束、风险、可测的验收标准 | 验收标准能被第三方判定 |
| plan | `plan` | 切片计划（每片 ≤ 1 个会话）、停止修复规则 | 每片都有验收 + 回滚 |
| decision-gate | `decision-page` | 决策目录 + 多轮线程，全部 `resolved` | **闸门：0 个 open** |
| implement | `implement` | 有界 diff + 静态检查结果 | 不宣称运行时通过 |
| validate | `validate` | 验收标准 → 证据矩阵 | 每行都有命令与输出 |
| repair | `repair` | 可复现用例 + 根因 + 回归测试 | 复现失败时不许猜 |
| document | `periodic-report` `test-ledger` `arch-sync` `key-guard` | 报告、台账、架构更新、key 变更史 | 只记录，不重新决策 |
| advance | 状态推进 | `current-phase.md` + `progress.md` | 进入下一片或收束 |

---

## 3. 分级触发（决定这套流程要跑多重）

| 级别 | 触发条件 | 必跑 | 可省 |
|---|---|---|---|
| **L1 微改** | 改文案、单文件小修、依赖补丁、≤ 30 行且无契约变化 | `implement → validate`，`progress.md` 追加一行 | 决策、报告、架构同步。**但一旦发现模糊点，立即升级为 L2 并走决策** |
| **L2 功能** | 新增/修改一个用户可见功能、接口字段、数据结构、页面 | `analyze → plan → decision-gate(有模糊点时) → implement → validate → test-ledger`；收束时 `periodic-report` + `arch-sync` | 阶段快照冻结、key 评审 |
| **L3 架构 / key / 契约** | 触碰 key 登记位置、跨模块契约、数据迁移、鉴权、计费、性能主路径、对外 API 破坏性变更 | 全链路 + 强制 `decision-page` + `key-guard` + `arch-sync` + 阶段快照 + 完整报告 | 无 |

**升级只能升不能降**；降级必须由用户明确说"这个不用走流程"，并记入 `progress.md`。

---

## 4. 横切规则 A：md / html 由复杂度判定

默认 md。选 html 必须命中下表至少一条，并在产物第一行（或同目录 `_format-note.md`）写：`为何 html：<命中的判据>`。

| 判据 | 倾向 md | 倾向 html |
|---|---|---|
| 结构 | 线性叙述、清单、结论 | 需要并排对比 ≥ 3 个选项 / 矩阵 |
| 可视化 | 无图、无 diff、无对照 | 架构图、时序图、前后行为对比、测试矩阵 |
| 交互 | 只读 | 需要选择、批注、文字输入、回传 |
| 首屏 | 一屏扫完 | 密度高到一屏扫不完，需分区/锚点导航 |
| 更新方式 | 追加 / 就地小改 | 每次生成即整体快照 |

**唯一预设**：决策交互页 `decisions/<id>/page.html` 恒为 html，因为它的本质是交互而不是文档。
用户可覆盖判定；覆盖记录写入 `progress.md`（`<ts> 格式覆盖：<文件> 由 md 改 html，理由：用户要求`）。

---

## 5. 横切规则 B：决策交互协议（摘要，全文见 `decision-page` skill）

1. 一个决策一个目录：`.gen/decisions/D-YYYYMMDDHH-<slug>/`。
2. 生命周期：`open → resolved`，另有 `blocked`（卡在外部）与 `superseded`（被新决策取代）。
3. 每个决策目录含：`page.html`（最新交互页）、`thread.md`（**权威记录**，append-only）、`response-rN.md`（每轮用户批复）、`page-rN.html`（历史快照）。
4. 工具必须**逐项回应**用户批复：解释、回答反问、修订方案、给新问题；禁止只回"已更新"。**每轮最多新增 3 个问题**，防止发散。
5. 关闭只能由用户明确表态触发，工具不得单方面关闭；`thread.md` 必须留下"依据：<用户原话>"。
6. 未关闭 → `implement` 拒绝执行。这条在根 `AGENTS.md`（本节）与 `implement/SKILL.md` 里各写一遍。

---

## 6. 目录契约（只列根层，细节见 `.gen/AGENTS.md`）

```
<repo>/
├── AGENTS.md                  # 本文件
├── .gen/                      # 进程与治理，随代码入库（少数子目录 gitignore）
│   ├── AGENTS.md              # 目录契约、命名、状态枚举
│   ├── skills/                # 12 个可执行 skill
│   ├── templates/             # 所有模板（唯一真源）
│   ├── scripts/               # 工具链 gen.mjs（lint/status/serve/new/init/demo）
│   ├── workflow/              # 状态栈 + 计划 + 交接
│   ├── decisions/             # 多轮决策线程
│   ├── specs/                 # 功能规格与其修订
│   ├── reports/               # 定期报告（数字时间戳命名）
│   ├── tests/                 # 测试总账 + 失败档案 + 原始日志(ignored)
│   └── architecture/          # agent 层 + human 层 + key 登记
└── <code...>
```

**禁止**：在仓库根散放 `NOTES.md`、`TODO.md`、`report-final-v2.html`、`临时.md`；过程文件一律进 `.gen/` 对应目录。根目录的 `README.md` 只为人服务。

---

## 7. 完成定义（DoD）

一个切片算"完成"必须同时满足：

- [ ] 验收标准逐条有证据（命令 + 输出摘要 + 时间），未知项写 `unknown` 并说明为什么没验
- [ ] `progress.md` 追加一行（时间 | 切片 | 改了什么 | 证据 | 未决项）
- [ ] `tests/LEDGER.md` 追加一行（跑过测试就必须记）
- [ ] 若触碰架构：`arch-sync` 已更新 agent 层并重渲染 human 层
- [ ] 若触碰 key：`REGISTRY.md` / `CHANGELOG.md` / `reviews/` 已更新且有人签字
- [ ] 若产生新决策：已 `resolved` 或明确 `blocked` 且用户知情
- [ ] 无悬空引用（R10）
- [ ] `node .gen/scripts/gen.mjs lint` 无 error（有 warning 需在 `progress.md` 说明为何接受）

---

## 8. 常用命令

> 首次进入项目先跑 `gen-init` 生成骨架；不同工具的命令前缀可以变，语义不变。
> **确定性检查一律交给 CLI**（`.gen/scripts/gen.mjs`，零依赖，Node ≥ 16）：不要靠肉眼数表格列数或猜 ID 是否悬空。

| 意图 | 做法 |
|---|---|
| 接手项目 | 说"继续上次" / "读一下 .gen 状态" → 触发 `continuation-planner` |
| 提需求 | 说"我要做 X" → `analyze` 给证据与验收标准，再 `plan` |
| 有模糊点 | 工具必须开决策页，不许猜：`decision-page` |
| 写代码 | 只走 `implement`，前置闸门自动检查 |
| 验证 | `validate` 出证据矩阵；失败转 `repair` |
| 出报告 | `periodic-report`，文件名 `YYYYMMDDHH-<标题>.html` |
| 架构变了 | `arch-sync`，人读层重新渲染 |
| 动了关键算法 | `key-guard`，先决策再改 |

| CLI | 用途 |
|---|---|
| `node .gen/scripts/gen.mjs lint` | 校验 frontmatter / 枚举 / 命名 / 决策与 INDEX / 台账 / 技能规范 |
| `node .gen/scripts/gen.mjs status` | 状态摘要 + 闸门结论（退出码 1 = 有未关闭决策） |
| `node .gen/scripts/gen.mjs serve --decision <id>` | 决策页直存 `response-rN.md`（仅 127.0.0.1） |
| `node .gen/scripts/gen.mjs new <type>` | 建带正确时间戳的产物 |
| `node .gen/scripts/gen.mjs init` | 初始化骨架 |
| `node .gen/scripts/gen.mjs demo` | 生成可跑示例，用于体验或自测 |
| `node .gen/scripts/gen.mjs test` | 跑工具自身的 56 个测试（改 lint 规则后必跑） |
| `node .gen/scripts/gen.mjs key-check` | 提交前查有没有碰到 key（命中 critical/high 即失败） |
| `node .gen/scripts/gen.mjs install` | 把 skills 装到 `.claude/skills` 等目录（清单可追溯） |
| `node .gen/scripts/gen.mjs report` | 出报告初稿（数字自动，结论人补） |
| `node .gen/scripts/gen.mjs decision-diff` | 决策第 N 轮 vs 上轮的差异页 |


---

## 9. 会话接管（任何工具、任何时间）

1. 读 `.gen/workflow/state/{project-snapshot,current-phase,progress,ambiguities,done-criteria}.md`
2. 读当前 `specs/<feature>/spec.md` 与最新 `revisions/`
3. 读 `.gen/decisions/INDEX.md`，列出 `open` / `blocked`
4. 轻量一致性检查（模块是否还在、key 路径是否漂移、引用是否悬空）
5. 写 `handoffs/<ts>-<slug>.md`，向用户复述："我们在哪 / 为什么在这 / 下一步 / 需要你拍板的事"
6. **没做完这 6 步，不许改代码。**
