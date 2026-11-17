---
id: R-YYYYMMDDHH-slug
kind: report
title: <报告标题>
created: YYYY-MM-DDTHH:MM:00+08:00
status: final           # draft | final
report_type: phase      # phase | weekly | incident | release
period: YYYY-MM-DD ~ YYYY-MM-DD
links: [S-<feature>-NN, D-YYYYMMDDHH-slug]
author: agent
---

# <报告标题>

> 本周期：YYYY-MM-DD ~ YYYY-MM-DD ｜ 类型：阶段 / 周报 / 事故 / 发版

## 1. 一句话结论

<≤40 字，说人话>

## 2. 本周期做了什么

1. <动作> — 证据：`S-...` / 提交 `<sha>` / `D-...`
2. …

## 3. 数字看板

| 指标 | 数值 | 变化 | 来源 |
|---|---|---|---|
| 切片 完成/总数 |  |  | `plan.md` |
| 决策 关闭/开放 |  |  | `decisions/INDEX.md` |
| 测试 通过/执行 |  |  | `tests/LEDGER.md` |
| 未结失败 |  |  | `tests/failures/` |
| 改动 文件/行 |  |  | `git diff --stat` |
| key 变更 |  |  | `key/CHANGELOG.md` |

## 4. 决策与变更

**已关闭**：

- `D-...`：<结论一句>（依据：用户「...」）

**新增/仍开放**：

- `D-...`：<卡在哪>

**已实施但未走决策**（需要补流程）：

- <文件/行为> — 建议：补决策 / 回滚

## 5. 风险与阻塞

| 风险 | 影响 | 触发条件 | 建议怎么办 |
|---|---|---|---|
|  |  |  |  |

## 6. 质量

- 覆盖的验收标准：AC-1..AC-4（pass）、AC-5（unknown，原因：…）
- flaky：无 / `F-...`（3 次证据）
- 未验证项：<列出，并说明谁接受>

## 7. 架构影响

- 模块：`mod-...`（变更了什么）
- 契约：`contract-...`
- key：`K-...`（版本变化 + review 链接）
- 详见 `<同步报告路径>`

## 8. 下一步（≤3 条，可验收）

1. <动作 + 完成判据>
2. …

## 9. 需要你拍板的事（0–3 条）

| # | 要定什么 | 选项 | 不决定的后果 | 决策页 |
|---|---|---|---|---|
| 1 |  |  |  | `decisions/D-.../page.html` |

## 10. 附录

- 命令：`...`
- 日志：`tests/runs/<TS>-<slice>/`
- 环境：`tests/matrix.md#<代号>`

## 勘误（final 后只追加此节）

- YYYYMMDDHH：<更正内容>
