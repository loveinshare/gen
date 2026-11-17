---
name: continuation-planner
description: 接管半成品项目：读状态栈、规格、决策看板和测试台账，产出 handoff，复述“我们在哪/为什么在这/下一步/需要你拍板什么”。当会话恢复、换工具、隔一段时间回来、用户说“继续上次”“做到哪了”“先看看现状”，或任何 agent 第一次进入仓库时使用。
license: MIT
metadata:
  version: "4.3.1"
  system: .gen
---

# continuation-planner — 接管

**原则：接管者不重新决策，只重新对齐。** 发现不一致就记录，不要顺手"修正"。

## 触发

- 新会话 / 新工具 / 新 agent 首次进入
- 用户说"继续""上次做到哪了""先别改，看看状态"
- 距离上次活动 > 24h，且 `progress.md` 尾部不是当前会话写的
- 上一轮被中断（有 `doing` 状态但无结论）

**不触发**：同一会话内连续追问同一件事（上下文还在，直接答）。

## 步骤

1. **读状态栈**（按序，缺哪个就在报告里点名）：
   - `workflow/state/project-snapshot.md`
   - `workflow/state/current-phase.md`
   - `workflow/state/progress.md`（**只读尾部 20 行**，全文会吃光上下文）
   - `workflow/state/ambiguities.md`
   - `workflow/state/done-criteria.md`
2. **读需求侧**：当前 `specs/<feature>/spec.md` + `revisions/` 最新一份 + `decisions.md`。
3. **读决策看板**：`decisions/INDEX.md`，抽出 `open` / `blocked` 行；对每个 `open` 读其 `thread.md` 最后一轮，确认"卡在哪一项"。
4. **读测试侧**：`tests/LEDGER.md` 尾部 10 行 + `tests/failures/` 中 `status: open` 的条目。
5. **一致性抽查**（轻量，只查会翻车的）：
   - 快照里列的模块目录是否还存在（`ls`/`glob` 验证，不猜）
   - `REGISTRY.md` 里每个 key 的 `path` 是否存在、行号是否还附近（允许漂移，标出来）
   - `INDEX.md` 里 `open` 的决策目录是否都在
   - 文档里引用的 ID 是否有对应文件（抽样 5 条）
6. **写 handoff**：`workflow/handoffs/<TS>-<slug>.md`，按模板填；**必须**含"未关闭决策"和"需重新确认的假设"两节。
7. **更新** `project-snapshot.md` 中已变化的事实（只改事实，不改历史叙述），并刷新 `current-phase.md`。
8. **向用户复述**（这一步不能省）：用 4 句话——我们在哪、为什么在这、接下来一步是什么、需要你现在拍板什么。然后**停下来等确认**。

## 一致性问题的处理

| 发现 | 动作 |
|---|---|
| 文档说有的模块，代码里没有 | 记入 `ambiguities.md`，handoff 标 `drift`，不擅自删文档 |
| 代码有但架构文档没有 | 记入 `ambiguities.md`，建议跑 `arch-sync` |
| `doing` 切片无结论 | 标为 `stale`，问用户"这片是放弃还是继续" |
| 决策 `open` 但代码已经实现了 | **高优先级**：告知用户"决策被绕过"，要么补关闭、要么回滚；记入 `progress.md` |
| key 路径漂移 | 更新 REGISTRY 的 `path`/`anchor`，在 CHANGELOG 记 `drift-fix` |

## 交付判定

- [ ] handoff 有 frontmatter（`kind: handoff`、`status`）
- [ ] 明确写出未关闭决策 ID 列表（没有就写"无"）
- [ ] 明确写下一步的**一个**动作，不是一串
- [ ] 引用路径均存在（抽样验证过）
- [ ] 没有修改任何源码

## 反模式

- 读完状态直接开始改代码（违反 R4）
- 把 `progress.md` 全文读进上下文（浪费且淹没重点）
- 用"应该是""大概是"描述现状（不确定就标 `unknown` 并去验证）
- 接管时顺手重构命名/目录（那是 L3，要走决策）

## 模板

`templates/handoff.md`
