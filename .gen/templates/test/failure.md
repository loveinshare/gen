---
id: F-YYYYMMDDHH-slug
kind: failure
title: <一句话描述现象，不是原因>
created: YYYY-MM-DDTHH:MM:00+08:00
updated: YYYY-MM-DDTHH:MM:00+08:00
status: open            # open | mitigated | fixed | wontfix
severity: high          # low | medium | high | critical
feature: <feature>
links: [S-<feature>-NN, D-YYYYMMDDHH-slug]
author: agent
---

# F-YYYYMMDDHH-slug · <现象>

## 1. 现象

<看到什么：错误信息、错误数值、错误界面。贴关键行，不贴整屏。>

## 2. 复现

```bash
<可复制的最小命令>
```

- 频率：`12/50`
- 环境：`win11/node20`（见 `tests/matrix.md`）
- 前置数据：`tests/fixtures/F-YYYYMMDDHH-slug/`

## 3. 期望 vs 实际

| 输入 | 期望 | 实际 |
|---|---|---|
|  |  |  |

## 4. 影响面

- 影响谁：<用户群 / 内部>
- 严重度理由：<数据错误？不可逆？绕过权限？>
- 是否已有 workaround：<是则写怎么做>

## 5. 根因

> 一句话：`因为 X，在 Y 条件下导致 Z`。找不到就写"未定位"，并列出假设表。

| # | 假设 | 验证方式 | 结果 |
|---|---|---|---|
| H1 |  |  | 排除 / 成立 |

**定位过程**：<二分到哪个文件/提交；`git bisect` 结果>

## 6. 修复与回归

- 修复提交：`<sha>`
- 改动文件：`...`
- 回归测试：`tests/<path>::<case>`（已验证：回退修复后该测试失败）
- 是否触碰 key：是 → `K-...` / review 链接；否

## 7. 证据

- 原始日志：`tests/runs/YYYYMMDDHH-<slice>/<file>`（本地，未入库）
- 截图：<路径>
- 关键输出：

```
...
```

## 复跑记录（flaky 必填，≥3 次）

| # | 时间 | 结果 | 备注 |
|---|---|---|---|
| 1 |  |  |  |
