---
id: plan-YYYYMMDDHH-phase
kind: plan
title: 切片计划 · <phase>
created: YYYY-MM-DDTHH:MM:00+08:00
updated: YYYY-MM-DDTHH:MM:00+08:00
status: doing
feature: <feature>
links: [F-<feature>]
author: agent
---

# 切片计划 · <phase>

## 目标（可验收）

<一句话，能被第三方判定>

## 非目标（明确不做）

- <防止范围膨胀，至少 2 条>

## 依赖图

```
S-01 ──► S-02 ──► S-04
   └───► S-03 ──┘
```

## 切片

### S-<feature>-01 <一句话>

- 状态：`todo`
- 验收：AC-1, AC-2（引用 spec，不新造）
- blocked_by：无 / `D-YYYYMMDDHH-slug`
- touch：`src/a.ts`, `src/b/**`（超出即停，需改计划）
- 做法要点：<≤3 行，不写实现细节>
- 回滚：`git revert <sha>` / 关闭开关 `FEATURE_X` / 反向迁移 `migrations/down/003.sql`
- 停止规则：若 <信号>，停止并转 repair / 决策
- 证据：`tests/LEDGER.md` 行 / 提交 sha（完成后填）

### S-<feature>-02 …

## 停止修复规则（全计划级）

1. 同一失败连续 2 次修复无效 → 停，回 `analyze` 补证据。
2. 发现需改契约 / key → 停，开 `decision-page`。
3. 测试环境不可用 → 停，标 `blocked`，不用目测替代。
4. 需要超出 touch list 的文件 → 停，改计划并记录原因。

## 里程碑

| 里程碑 | 包含切片 | 达成判据 | 预计 |
|---|---|---|---|
| M1 可用 | S-01..S-03 | 主路径手工走通 + AC-1 pass | — |

## 修订记录（只追加）

| 时间 | 改了什么 | 原因 |
|---|---|---|
| YYYYMMDDHH | 初始版本 | — |
