---
id: tests-ledger
kind: ledger
title: 测试总账 YYYY-MM
created: YYYY-MM-DDTHH:MM:00+08:00
updated: YYYY-MM-DDTHH:MM:00+08:00
status: generated
---

# 测试总账 · YYYY-MM

> append-only。每次执行测试追加一行。月末分卷到 `history/LEDGER-YYYYMM.md`。
> 列不可增减；字段缺失写 `—`。

| 时间 | 切片/阶段 | 触发原因 | 范围（命令） | 结果 | 失败数 | 失败链接 | 环境 | 对应决策/修订 |
|---|---|---|---|---|---|---|---|---|

> 本表初始为空（表头下不放假数据）。**每次执行测试追加一行**，时间列必须是 `YYYYMMDDHH` 形式，否则不会被统计成一次执行。
> 示例（**不是数据**，仅供格式参考；放在代码块里以免被统计工具误读）：

```text
| 2026111503 | S-auth-03 | 实现后自检 | `pnpm vitest run tests/auth` | fail | 2 | F-2026111503-login-500, F-2026111503-token-exp | win11/node20 | D-2026111502 |
```

## 结果取值

`pass` / `fail` / `flaky` / `skipped` / `blocked`（仅此五种）

## 触发原因取值

`实现后自检` / `回归` / `发版前` / `用户报告` / `CI` / `排查 flaky` / `性能`

## 分卷记录

| 月份 | 归档文件 | 行数 | fail 数 | 分卷时间 |
|---|---|---|---|---|
| — | — | — | — | — |
