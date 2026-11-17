---
id: arch-root
kind: arch
title: 系统架构（agent 层）
created: YYYY-MM-DDTHH:MM:00+08:00
updated: YYYY-MM-DDTHH:MM:00+08:00
status: generated
last_synced: YYYY-MM-DDTHH:MM:00+08:00
source_decision: <D-... 或 —>
owner: agent
paths: []
depends_on: []
depended_by: []
key_refs: []
---

# 系统架构（agent 层 · 单一真源）

> 本层是事实的唯一来源；`architecture/human/` 由本层 + 决策 + 测试档案渲染，禁止手写事实。

## 1. 系统边界

| 方向 | 对方 | 方式 | 契约 |
|---|---|---|---|
| 入站 | 浏览器 / 第三方回调 | HTTP | `contracts/http-api.md` |
| 出站 | 支付网关 | HTTPS | `contracts/payment.md` |

## 2. 模块清单

| module_id | 一句话职责 | 路径 | 依赖 | key |
|---|---|---|---|---|
| mod-auth | 认证与令牌 | `src/auth/**` | mod-user, mod-storage | K-token-verify |
|  |  |  |  |  |

## 3. 主数据流

### F1 <流程名>

```
用户 → api(/login) → mod-auth → mod-storage
                        └→ mod-user（读凭证）
```

- 入口：`src/api/login.ts`
- 关键约束：<...>
- 失败模式：<...>

## 4. 横切关注点

| 关注点 | 做法 | 位置 | 备注 |
|---|---|---|---|
| 鉴权 |  |  |  |
| 日志 |  |  |  |
| 错误处理 |  |  |  |
| 配置 |  |  |  |
| 迁移 |  |  |  |

## 5. 不变量总表

> 每条必须可断言（能写成测试或运行时断言）。

| # | 不变量 | 守护位置 | 验证 |
|---|---|---|---|
| INV-1 | 同一用户同一时刻最多一个有效令牌 | mod-auth | `tests/key/token-verify.spec.ts` |

## 6. key 入口

见 `key/REGISTRY.md`。人读版见 `../human/KEY.md`。

## 7. 当前阶段快照

- 最新：`snapshots/<TS>-<phase>.md`
- 冻结策略：阶段收束时新建，不修改历史快照
