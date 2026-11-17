---
id: decisions-index
kind: state
title: 决策看板
created: YYYY-MM-DDTHH:MM:00+08:00
updated: YYYY-MM-DDTHH:MM:00+08:00
status: open
---

# 决策看板

> 工具可读的权威索引。正文在多轮线程 `D-*/thread.md`，这里只放状态。
> 每次状态、轮次、未关闭项变化时更新；`implement` 的闸门读这张表。

| decision_id | 状态 | 轮次 | 一句话 | 未关闭项 | 关联 feature | 最近更新 |
|---|---|---|---|---|---|---|
| D-YYYYMMDDHH-slug | open | 1 | ... | 2 项 | auth | YYYYMMDDHH |

## 状态图例

- `open`：进行中，**阻塞实现**
- `resolved`：全部项关闭，有最终结论段
- `blocked`：等待外部信息（写明解锁条件）
- `superseded`：被更新决策取代（链到新 ID）
- `waived`：用户明确要求"按默认行为执行"，风险已登记

## 未关闭项速查

| decision_id | 未关闭项 | 卡在哪 | 下一步 |
|---|---|---|---|
| — | — | — | — |
