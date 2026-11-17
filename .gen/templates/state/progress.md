---
id: state-progress
kind: state
title: 进度流水
created: YYYY-MM-DDTHH:MM:00+08:00
updated: YYYY-MM-DDTHH:MM:00+08:00
status: generated
---

# 进度流水（append-only）

> 一行一次变更。**只追加，不删除**；写错就在下一行写更正。
> 格式：`| 时间 | 切片 | 改了什么 | 证据 | 未决项 |`

| 时间 | 切片 | 改了什么 | 证据 | 未决项 |
|---|---|---|---|---|
| YYYYMMDDHH | S-<feature>-NN | ... | `tests/LEDGER.md` 行 / 决策 ID / 提交 sha | — |

## 事件类型速记（写在"改了什么"开头，便于 grep）

- `impl:` 实现
- `fix:` 修复
- `test:` 测试
- `decision:` 决策状态变化
- `arch:` 架构同步
- `key:` key 变更
- `format:` 格式覆盖（md↔html）
- `blocked:` 因决策/依赖阻塞
- `correct:` 更正上一条

## 示例

| 时间 | 切片 | 改了什么 | 证据 | 未决项 |
|---|---|---|---|---|
| 2026111503 | S-auth-03 | impl: 加 token 版本号校验，涉及 verify.ts/token.ts | `pnpm vitest run tests/auth` 12 passed | Q3 跨域待用户确认 |
| 2026111504 | S-auth-03 | decision: D-2026111502 关闭（Q3 按 header 方案） | `decisions/D-.../thread.md` 最终结论 | — |
| 2026111504 | S-auth-03 | arch: 同步 mod-auth + K-token-verify | `architecture/agent/modules/mod-auth.md` | — |
