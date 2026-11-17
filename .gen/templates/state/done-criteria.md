---
id: state-done-criteria
kind: state
title: 完成定义
created: YYYY-MM-DDTHH:MM:00+08:00
updated: YYYY-MM-DDTHH:MM:00+08:00
status: generated
---

# 本项目的"做完"

> 这是项目级的判据，不是切片级的。切片级验收在 `spec.md`。

## 功能完成

- [ ] 所有 P0 验收标准有 `pass` 证据
- [ ] 关键失败路径有明确行为（不是 500 或静默）
- [ ] 空数据 / 超长输入 / 并发 / 权限不足 四类边界已验证
- [ ] 已知限制写入 `architecture/human/KNOWN-ISSUES.md`

## 质量

- [ ] 测试覆盖所有 key 的不变量（见 `REGISTRY.md`）
- [ ] 无 `flaky` 未处理项
- [ ] 静态检查全绿（类型 + lint）
- [ ] `unknown` 项全部列出并有人签字接受

## 可运维

- [ ] 有启动/部署说明，且新人能在 30 分钟内跑起来
- [ ] 有错误日志与关键路径的可观测信号
- [ ] 数据迁移可回滚（或有备份与验证脚本）

## 可理解

- [ ] `architecture/human/ARCHITECTURE.md` 你读完能讲给别人听
- [ ] 每个 key 在 `human/KEY.md` 有真实例子
- [ ] 无未处理的 `@note` 批注

## 流程

- [ ] 所有相关决策 `resolved`
- [ ] 最近一份阶段报告存在且为 `final`
- [ ] `tests/LEDGER.md` 跨月已分卷
