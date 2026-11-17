---
name: test-ledger
description: 维护测试总账：每次测试执行追加一行（时间、切片、命令、范围、结果、失败数、失败链接），按月分卷，失败另建档案并保留证据。原始日志本地保留但不入库。当跑完测试、需要追溯“某测试何时开始不稳定”、或用户问“这个功能测过吗”时使用。
license: MIT
metadata:
  version: "4.2.0"
  system: .gen
---

# test-ledger — 账本 + 档案

**目标不是覆盖率，是"半年后还能回答：这项测试什么时候开始坏的、当时的环境是什么"。**

## 触发

- 每次执行测试（自动或手动）**之后**
- 出现失败 / flaky
- 月末分卷
- 阶段收束 / 发版前

---

## 一、目录

```
.gen/tests/
├── LEDGER.md                # 当月活账，append-only
├── history/LEDGER-YYYYMM.md # 月结卷
├── failures/F-<TS>-<slug>.md# 失败档案（进 git）
├── fixtures/<F-id>/         # 最小复现数据（脱敏、小体积、进 git）
├── runs/<TS>-<slice>/       # 原始日志（gitignore）
├── matrix.md                # 环境矩阵
└── README.md                # 怎么跑、怎么记
```

- `runs/`：原始 stdout/stderr、截图、trace、JUnit XML，**不进 git**，本地保留 ≥30 天。
- `failures/`：结论与证据片段进 git；大文件放 `runs/` 并只在档案里写"本地路径 + 摘要"。

## 二、台账行格式（严格 9 列）

```markdown
| 时间 | 切片/阶段 | 触发原因 | 范围（命令） | 结果 | 失败数 | 失败链接 | 环境 | 对应决策/修订 |
|---|---|---|---|---|---|---|---|---|
| 2026111503 | S-auth-03 | 实现后自检 | `pnpm vitest run tests/auth` | fail | 2 | F-2026111503-login-500 | win11/node20 | D-2026111502 |
```

字段规则：

- **时间**：`YYYYMMDDHH`（同小时多次用 `YYYYMMDDHHmm`）。
- **触发原因**：`实现后自检` / `回归` / `发版前` / `用户报告` / `CI` / `排查 flaky`。
- **范围**：可复制的命令，含过滤条件；写"全量"也要附命令。
- **结果**：只能是 `pass` `fail` `flaky` `skipped` `blocked` 之一。
- **失败链接**：`F-...`；多个用逗号。
- **环境**：`OS/运行时@版本`，必须能在 `matrix.md` 找到对应行。

## 三、失败档案格式

```yaml
---
id: F-2026111503-login-500
kind: failure
title: 改密后旧 token 仍可用
created: 2026-11-15T03:20:00+08:00
status: open            # open | mitigated | fixed | wontfix
feature: auth
links: [S-auth-03, D-2026111502]
severity: high          # low | medium | high | critical
---
```

正文必含七节：**现象 / 复现步骤 / 期望 vs 实际 / 影响面 / 根因 / 修复与回归 / 证据**。
`wontfix` 必须写理由 + 影响 + 用户是否知情（知情则链 `D-...`）。

## 四、稳定性判定

- `flaky` 需要 **≥3 次同环境复跑**的记录（写进档案"复跑记录"表），否则只能 `unknown`。
- 同一 `F-id` 复发：档案内追加 `## 复发 <TS>`，不新建档案（否则历史断裂）；`status` 改回 `open`。
- 同一现象在不同环境结论不同：进 `matrix.md`，把差异写成一行结论，而不是两个谜团。

## 五、月度分卷

月末（或跨月第一次写入时）：

1. 复制当月 `LEDGER.md` 内容到 `history/LEDGER-YYYYMM.md`（含表头）。
2. 活账保留表头 + 一行指针：`> 2026-11 已归档至 history/LEDGER-202611.md（共 42 行，fail 5）`。
3. 这是 `LEDGER.md` **唯一允许的"剪切"**（见 `.gen/AGENTS.md` §6）。

## 六、环境矩阵 `matrix.md`

```markdown
| 代号 | OS | 运行时 | 关键依赖 | 备注 | 上次验证 |
|---|---|---|---|---|---|
| win11/node20 | Windows 11 | Node 20.11 | pnpm 8.15 | 开发机 | 2026111503 |
| linux/ci | Ubuntu 22.04 | Node 20.11 | pnpm 8.15 | CI | 20261114 |
```

新增环境必须先登记再写入台账（避免"这台机器就是怪"这种无法追查的记录）。

## 交付判定

- [ ] 台账新行 9 列齐全，命令可复制
- [ ] 失败都有档案，档案有七节
- [ ] `runs/` 没进 git（`git status` 干净）
- [ ] 跨月已分卷
- [ ] `flaky` 有 ≥3 次证据

## 反模式

- 只记"测试通过"，不记命令和范围（三个月后无法复跑）
- 失败档案只写"修复了"（没有根因，等于没写）
- 把 CI 的 XML 全量塞进 git（仓库膨胀）
- 同一个失败每次新建档案（历史被切碎）
- 用"环境问题"结案却不写是哪个环境、差在哪

## 模板

`templates/test/ledger.md` · `templates/test/failure.md` · `templates/test/matrix.md`
