---
id: D-YYYYMMDDHH-slug
kind: thread
title: <决策标题：一句话说清要定什么>
created: YYYY-MM-DDTHH:MM:00+08:00
updated: YYYY-MM-DDTHH:MM:00+08:00
status: open
feature: <feature>
links: [S-<feature>-NN]
author: agent
---

# D-YYYYMMDDHH-slug · <决策标题>

> 权威记录，append-only。页面（page.html）与本文冲突时以本文为准。

## 背景

- 这次变更要达成：<用户视角目标>
- 为什么现在必须定：<不定的后果>
- 相关规格：`specs/<feature>/spec.md`
- 相关切片：`S-<feature>-NN`

---

## Round 1 · YYYY-MM-DDTHH:MM

### agent

**核心问题**：<一句话>

**Q1 <问题>**

- 为什么现在定：<...>
- 选项：

| 选项 | 名称 | 怎么做 | 收益 | 代价 | 可逆性 |
|---|---|---|---|---|---|
| A | ... | ... | ... | ... | ... |
| B | ... | ... | ... | ... | ... |

- 推荐：B，理由：<...>
- 待确认假设：<agent 替用户假设了什么>
- 已排除：C（理由：...）
- 若不决策：按 B 实现，风险记入 `ambiguities.md`（不等于同意）

**Q2 <问题>** …（同上结构）

### 用户批复

> 原文照录，不改措辞。来源：`response-r1.md`

```
（等待用户导出/粘贴）
```

### agent 回应

逐项回应（模板，每项都必须有）：

- **Q1**：你要求解释 X → 我的依据是 <文件/命令/数据>；据此我把选项表改为 …；你的反问 Y 我还需要确认，因为 …；**该项状态：仍开放 / 已关闭（依据：「<用户原话>」）**。
- **Q2**：…

**本轮新增问题**（≤3 条）：Q3 …

---

## Round 2 · YYYY-MM-DDTHH:MM

### agent

（基于 Round 1 批复修订后的方案；已关闭项折叠为上表一行，不再展开）

…

### 用户批复

```
（response-r2.md 原文）
```

### agent 回应

…

---

## 状态追踪

| 项 | 问题 | 状态 | 关闭依据 |
|---|---|---|---|
| Q1 | ... | unanswered | — |
| Q2 | ... | closed | 「按 B 走」 |

> 状态取值只有 `unanswered` / `annotated` / `closed` 三种（见 `.gen/AGENTS.md` §5）。

---

## 最终结论

> 只在全部项关闭后填写；`implement` 的闸门会检查本节是否存在。

1. **Q1 定为**：B。理由：<用户原话或依据>。影响：<哪些文件/模块/契约>；需同步：`spec.md` / `architecture/agent/modules/<m>.md` / `REGISTRY.md`。
2. **Q2 定为**：…

**遗留风险**：<...>
**关联产出**：ADR `<TS>-<slug>.md`、切片 `S-<feature>-NN`
