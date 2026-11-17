---
id: mod-example
kind: arch
title: <模块名>
created: YYYY-MM-DDTHH:MM:00+08:00
status: generated
last_synced: YYYY-MM-DDTHH:MM:00+08:00
source_decision: <D-...>
owner: agent
paths: ["src/<module>/**"]
depends_on: []
depended_by: []
key_refs: []
---

# <模块名>

## 职责

- <一句话；不超过 3 条>

## 不负责

- <明确划出去的事，防止职责蔓延>

## 对外契约

| 能力 | 形式 | 输入 | 输出 | 失败 |
|---|---|---|---|---|
|  | 函数/HTTP/事件 |  |  |  |

详见 `contracts/<name>.md`。

## 内部结构

| 文件 | 职责 |
|---|---|
|  |  |

## 数据与状态

- 持久化：<表/文件/缓存>
- 生命周期：<谁创建、谁删除、何时过期>

## 失败模式

| 场景 | 表现 | 影响 | 当前处理 |
|---|---|---|---|
|  |  |  |  |

## 不变量

- INV-x：<可断言的一句话>（验证：`tests/...`）

## 已知限制

- <...>（链到 `human/KNOWN-ISSUES.md` 对应条目）
