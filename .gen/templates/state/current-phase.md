---
id: state-current-phase
kind: state
title: 当前阶段
created: YYYY-MM-DDTHH:MM:00+08:00
updated: YYYY-MM-DDTHH:MM:00+08:00
status: doing
---

# 当前阶段

| 字段 | 值 |
|---|---|
| 阶段 | bootstrap / <phase-name> |
| 阶段目标 | <一句话，可验收> |
| 当前切片 | S-<feature>-NN（`todo` / `doing` / `blocked` / `done`） |
| 切片开始时间 | YYYYMMDDHH |
| 计划文件 | `workflow/plans/<TS>-<phase>.md` |
| 上次报告 | `reports/<TS>-<标题>.html` 或 无 |
| 阻塞项 | <无 / 决策 D-... / 外部依赖> |

## 下一步（只写一个）

<一个动作，能在一小时内开始>

之后的：

1.
2.

## 未关闭决策（影响当前推进的）

| decision_id | 未关闭项 | 卡点 |
|---|---|---|
| 无 | — | — |

## 交接备注

- <下次接手必须先知道的 3 件事以内>
