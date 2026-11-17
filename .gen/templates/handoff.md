---
id: handoff-YYYYMMDDHH-slug
kind: handoff
title: 交接 · <一句话>
created: YYYY-MM-DDTHH:MM:00+08:00
status: final
feature: <feature>
links: [S-<feature>-NN]
author: agent
---

# 交接 YYYYMMDDHH

## 1. 我们在哪

- 阶段：<phase> / 切片 `S-<feature>-NN`（`doing`）
- 已完成：<3 条以内，带证据链接>
- 当前 diff 状态：`<干净 / 有未提交改动：文件名>`

## 2. 为什么在这里

<一两句因果：上一步做了什么决定/发现了什么，导致现在停在这。>

## 3. 下一步（只写一个）

<具体动作 + 预期结果 + 怎么验证>

之后可能是：1. … 2. …

## 4. 未关闭决策（阻塞实现）

| decision_id | 未关闭项 | 卡点 | 页面 |
|---|---|---|---|
| 无 | — | — | — |

## 5. 需要重新确认的假设

- <假设 + 如果错了会怎样 + 怎么快速验证>

## 6. 一致性检查结果

| 检查项 | 结果 | 证据 |
|---|---|---|
| 快照里的模块目录存在 | ok / drift | `<path>` |
| key 位置漂移 | ok / drift（已修 path） | `REGISTRY.md` |
| 决策目录与 INDEX 一致 | ok / 不一致 | — |
| 文档引用 ID 有效（抽 5 条） | ok / 悬空 | — |

**drift 详情**：<...>

## 7. 上次活动

- 时间：YYYY-MM-DDTHH:MM
- 工具/会话：<codex / claude-code / ...>
- 中断原因：<正常收尾 / 用户暂停 / 报错中断 / 上下文用尽>
