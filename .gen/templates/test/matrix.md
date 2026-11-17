---
id: tests-matrix
kind: state
title: 测试环境矩阵
created: YYYY-MM-DDTHH:MM:00+08:00
updated: YYYY-MM-DDTHH:MM:00+08:00
status: generated
---

# 环境矩阵

> 台账里的"环境"列必须能在这里找到对应行。新增环境先登记，再写台账。

| 代号 | OS | 运行时 | 包管理 | 数据库/服务 | 备注 | 上次验证 |
|---|---|---|---|---|---|---|
| win11/node20 | Windows 11 23H2 | Node 20.11 | pnpm 8.15 | SQLite | 开发机 | — |
| linux/ci | Ubuntu 22.04 | Node 20.11 | pnpm 8.15 | Postgres 15 | CI | — |

## 已知环境差异

| 现象 | 只在哪出现 | 结论 | 关联失败 |
|---|---|---|---|
| 路径大小写敏感 | linux | 代码里统一用 `path.join` | — |

## 不可用环境（记录阻塞）

| 环境 | 缺什么 | 影响哪些验收 | 补齐条件 |
|---|---|---|---|
| — | — | — | — |
