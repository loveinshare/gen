---
id: key-registry
kind: key
title: 关键实现登记
created: YYYY-MM-DDTHH:MM:00+08:00
updated: YYYY-MM-DDTHH:MM:00+08:00
status: generated
---

# 关键实现登记（REGISTRY）

> key = 错了产品就不成立、且换技术栈也不能重写的那一小段逻辑。
> **判定必须人签字**；`confirmed_by: pending` 只是候选，不享受守护。

## 登记表

| key_id | 级别 | 一句话 | 位置 | 不变量 | 验证方式 | 版本 | 状态 | confirmed_by |
|---|---|---|---|---|---|---|---|---|
| K-example | critical | <算什么> | `src/x.ts:10-80` | <可断言> | `tests/key/x.spec.ts` | v1.0.0 | stable | pending |

## 级别判据（影响 × 不可逆）

| 级别 | 判据 | 要求 |
|---|---|---|
| critical | 高 × 不可逆 | 决策 + 人评审 + 双人确认 + 快照 + 回归基准数据 |
| high | 高 × 可逆 或 中 × 不可逆 | 决策 + 人确认 + 回归测试 + CHANGELOG |
| normal | 其余 | 登记 + 测试 + CHANGELOG |

## 落选清单（重要，防止反复提名）

| 候选 | 为什么不算 key | 日期 |
|---|---|---|
| 整个 auth 模块 | 粒度过粗，无法守护；已拆为 K-token-verify | YYYYMMDDHH |

## 数量约束

当前 key 数：`0`（建议 ≤15；超了必须合并或降级并说明理由）
