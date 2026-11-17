---
id: state-ambiguities
kind: state
title: 未解疑问
created: YYYY-MM-DDTHH:MM:00+08:00
updated: YYYY-MM-DDTHH:MM:00+08:00
status: open
---

# 未解疑问（append-only）

> 所有"我还不确定"的地方都进这里，即使它当前不阻塞。
> 阻塞实现的疑问必须升级为 `decision-page`，不能只躺在这里。

| 编号 | 疑问 | 影响 | 状态 | 处理方式 | 关联 |
|---|---|---|---|---|---|
| A-001 | 用户说的"实时"是 ≤1s 还是 ≤1min | 决定用轮询还是推送 | open | 建议开决策 | S-xxx-01 |
| A-002 | 生产 Node 版本 | 影响可选语法 | resolved | 读 CI 配置确认为 20.11 | — |

## 状态

- `open`：未解决
- `resolved`：已确认（写清依据）
- `deferred`：故意推迟（写清何时必须解决）
- `promoted`：已升级为决策 `D-...`

## 规则

1. 每条必须有"处理方式"：直接问 / 开决策 / 读代码确认 / 推迟并记条件。
2. `deferred` 必须写"到期条件"（如"上生产前必须解决"）。
3. 解决后不要删行，改状态并补依据。
