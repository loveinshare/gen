---
id: key-changelog
kind: key
title: key 变更史
created: YYYY-MM-DDTHH:MM:00+08:00
updated: YYYY-MM-DDTHH:MM:00+08:00
status: generated
---

# key 变更史（append-only，最新在上）

> 格式固定，一行一次变更。`changing` 状态期间禁止发布。

| 时间 | key | 旧→新 | 原因 | 决策 | 验证 | 结果 |
|---|---|---|---|---|---|---|
| YYYYMMDDHH | K-example | v1.0→v1.1 | <为什么改> | D-YYYYMMDDHH-slug | <测试 + 手工次数> | 通过 |

## 字段说明

- **原因**：写"业务动机"，不写"改了代码"。
- **验证**：必须是可复核的证据（测试路径 + 结果、基准数据、手工复跑次数）。
- **结果**：`通过` / `回滚` / `部分通过（说明）`。

## 漂移修复记录（drift-fix）

> 仅更新路径/行号、不改行为的记录放这里，避免与行为变更混淆。

| 时间 | key | 旧位置 → 新位置 | 触发 |
|---|---|---|---|
|  |  |  |  |
