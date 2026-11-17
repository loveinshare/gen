---
id: human-architecture
kind: arch
title: 这个系统是怎么工作的（人读版）
created: YYYY-MM-DDTHH:MM:00+08:00
status: generated
last_synced: YYYY-MM-DDTHH:MM:00+08:00
generated_from: architecture/agent/ARCHITECTURE.md @ snapshots/<TS>-<phase>.md
---

# 这个系统是怎么工作的

> 这份文档由 `arch-sync` 生成，**请不要直接改正文**。看不懂的地方就写批注：
> `<!-- @note: 这里没看懂…… -->` 或 `> @note: ……`，下次同步会被处理并回执。

## 30 秒版本

<三句话：它是干什么的、由哪几块组成、你现在最该知道的一个风险。>

## 全景图

```
（文字优先；图可选，但图不能替代文字）
浏览器 ──HTTP──► API ──► 认证 ──► 存储
                   └────► 用户
```

## 模块（每个五句话）

### 认证（mod-auth）

1. **负责**：判断"你是谁"，签发和校验登录凭证。
2. **不负责**：不判断"你能做什么"（那是权限模块的事）。
3. **谁依赖它**：所有需要登录的接口、Web 端。
4. **它依赖谁**：用户模块（读凭证）、存储（存令牌）。
5. **它坏了会怎样**：所有人登录失败；或更糟——未登录也能进（静默越权）。

依据：`mod-auth` @ `snapshots/<TS>-<phase>.md`

## 已知缺陷与限制

见 [KNOWN-ISSUES.md](KNOWN-ISSUES.md)。每条按五段式：你会看到什么 / 什么条件出现 / 影响谁 / 现在怎么缓解 / 关联决策。

## 术语

见 [GLOSSARY.md](GLOSSARY.md)。

## 关键实现

见 [KEY.md](KEY.md)。那些"算错了产品就不成立"的地方都在那里，用真实例子讲。

## 批注区

> 想说什么直接写，格式见顶部说明。同步后这里会出现回执。

<!-- @note: 示例：为什么不用 session？ -->
