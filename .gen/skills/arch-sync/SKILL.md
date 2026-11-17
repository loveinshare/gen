---
name: arch-sync
description: 维护两套架构描述：agent 层（结构化单一真源，含模块职责、契约、数据流、不变量、key 链接）与 human 层（生成的中文可读版，五句话讲清一个模块，可批注）。功能变更后自动增量更新 agent 层、重渲染 human 层、做漂移检查并写同步报告。当功能完成、阶段收束、契约或 key 变化、用户说“架构图更新一下”“这个我看不懂”，或新增模块时使用。
license: MIT
metadata:
  version: "4.3.1"
  system: .gen
---

# arch-sync — 两套架构，一个真源

**agent 层是源，human 层是渲染结果。** 手改 human 层正文 = 下次同步被覆盖；要改就批注。

## 触发与不触发

**触发**

| 条件 | 例子 |
|---|---|
| 新增 / 删除 / 重命名模块或契约 | 拆出 `mod-billing` |
| 模块职责、依赖方向、数据流变化 | 支付从同步改成异步 |
| key 变更 | 改打分算法权重 |
| human 层与 agent 层已漂移 | 人读文档说的和代码不一样 |
| 人在 human 层写了 `@note` 待处理 | 批注要回执 |

**不触发**

- 只改了函数内部实现、没动结构 → 记 `progress.md` 即可
- 只补文档措辞 → 直接改，不必走双层同步
- 切片结束但结构没变 → 等有实质变更再同步

## 一、为什么两套

| 层 | 读者 | 关心 | 形态 | 谁能改 |
|---|---|---|---|---|
| `architecture/agent/` | AI / 新 agent / 代码评审 | 边界、契约、不变量、依赖方向、失败模式、key | 结构化 md + YAML frontmatter + 稳定字段名 | agent 增量更新，人可评审 |
| `architecture/human/` | 你 / 新同事 / 未来的你 | 这东西到底在干嘛、哪里可能坏、我看不懂的地方 | 中文叙述 + 图 + 缺陷节 + 批注 | **只由 skill 生成**，人只能批注 |

**单一真源原则**：任何事实（模块职责、依赖、契约字段）只写在 agent 层；human 层由 agent 层 + 决策 + 测试档案**渲染**得到，禁止手写事实。

## 二、agent 层结构

```
architecture/agent/
├── ARCHITECTURE.md          # 总图：系统边界、模块清单、数据流、横切关注点、不变量总表
├── modules/<module>.md      # 每模块一页
├── contracts/<contract>.md  # 接口/schema/事件契约
├── flows/<flow>.md          # 关键流程（时序描述，文字优先，图可选）
├── key/REGISTRY.md          # 关键实现登记（见 key-guard）
├── adr/<TS>-<slug>.md       # 架构决策记录（摘要 + 链到 decisions/thread.md）
└── snapshots/<TS>-<phase>.md# 阶段冻结快照，永不修改
```

模块页必填字段（**字段名固定，便于机器读**）：

```yaml
---
id: mod-auth
kind: arch
title: 认证模块
status: generated          # generated | reviewed
last_synced: 2026-11-15T03:00:00+08:00
source_decision: D-2026111502-token-store
owner: human
paths: ["src/auth/**", "migrations/003_token.sql"]
depends_on: [mod-storage, mod-user]
depended_by: [mod-api, mod-web]
key_refs: [K-token-verify]
---
```

正文固定小节：`职责` / `不负责` / `对外契约` / `内部结构` / `数据与状态` / `失败模式` / `不变量` / `已知限制`。
**不变量**必须写成可断言的句子（"令牌在任何时刻最多一个有效"），否则等于没写。

**ARCHITECTURE.md 总图必含**：系统边界（谁调我们/我们调谁）、模块清单表、主数据流 3–5 条、横切关注点（鉴权/日志/错误处理/配置/迁移）、不变量总表、指向 key 的入口。

## 三、human 层结构（反晦涩规范）

```
architecture/human/
├── ARCHITECTURE.md     # 主文档：能不能三分钟看懂这个系统
├── KEY.md              # 关键算法/关键实现的人话版
├── GLOSSARY.md         # 术语表（每个术语一句人话）
├── KNOWN-ISSUES.md     # 缺陷与限制（产品视角）
└── annotations/        # 你的批注被处理后的回执
```

### 写作硬规则

1. **一个模块五句话**：负责什么 / 不负责什么 / 谁依赖它 / 它依赖谁 / 它坏了会怎样。
2. 每节**首句是结论**，不铺垫背景。
3. 段落 ≤4 行，每节 ≤5 段；超了就拆小节。
4. 术语首次出现给括号解释，或链 `GLOSSARY.md`。
5. **禁止只有图没有文字**；图是辅助，文字必须自足。
6. 代码只出现在 `<details>` 折叠里，首屏不出现。
7. 每个事实段末尾标依据：`（依据：mod-auth @ snapshot-2026111502 / D-2026111502）`。
8. 缺陷**五段式**：你会看到什么 / 什么条件下出现 / 影响谁 / 现在怎么缓解 / 关联决策。
9. 不用"赋能""闭环""抓手"这类词；不用"简单来说"然后说更复杂的话。
10. 全文可朗读（写完念一遍，拗口就改）。

### KNOWN-ISSUES 格式

```markdown
### 改密后旧会话还能用最多 5 分钟
- 你会看到：改完密码，另一台设备的旧登录仍然有效
- 触发条件：改密后 5 分钟内，且旧 token 未过期
- 影响：账号被盗时改密不能立即踢出对方（高危场景）
- 现状：已缓解（缩短 token TTL），根因未除（缺少 token 版本号）
- 关联：D-2026111502 / F-2026111503-login-500
```

## 四、批注回路（你要能写字，且能看到被处理）

### 你怎么批注（三选一）

1. 在 human 层文档里写 HTML 注释：`<!-- @note: 这里没看懂，为什么不用 session？ -->`
2. 在任意位置写 `> @note: ...` 引用块（更显眼）
3. 直接说"批注 architecture/human/ARCHITECTURE.md 第 3 节"——由 agent 代为落盘

### agent 怎么处理（每次 sync 必做）

1. 扫描所有未处理的 `@note` / `@question`。
2. 分类：**事实错误** / **表述不清** / **缺少信息** / **需要决策**。
3. 分别处理：
   - 事实错误 → 修 agent 层 → 重渲染 human
   - 表述不清 → 改 human 层措辞（这是唯一允许改 human 正文的场景，且必须来自批注）
   - 缺少信息 → 从代码/决策补齐 agent 层，再渲染
   - 需要决策 → 开 `decision-page`，批注处标 `@pending: D-...`
4. **原地回执**：把 `<!-- @note: X -->` 改为 `<!-- @note: X --><!-- @resolved: <TS> 因 <改动摘要>，见 <链接> -->`，不删除原话。
5. 汇总到 `architecture/human/annotations/<TS>-批注.md`：哪条批注 → 导致什么改动 → 影响哪些文件。
6. 回复用户时**逐条列出**："你的第 2 条批注我理解为……，已改为……；第 3 条需要你定，已开 D-…"。

**禁止**：静默删批注、把"已处理"写在聊天里但没落盘、把批注当成需求直接改代码（先改文档/决策）。

## 五、同步流程（触发后按序）

1. **收集变更源**：本次 `specs/*/revisions/`、`decisions/*/thread.md` 的最终结论、`tests/failures/` 新增、实际 diff（`git diff --stat`）。
2. **漂移检查（drift check）**：
   - agent 层声明的 `paths` 是否存在；缺失 → 标 `stale`，不擅自删
   - 代码里新增的顶层模块是否在模块清单里；缺失 → 新建模块页（先标 `status: generated`）
   - `depends_on` 是否有指向已删模块的悬空引用（R10）
   - `key_refs` 是否都能解析到 REGISTRY
   - human 层是否有 `@note` 未处理
3. **增量更新 agent 层**：只改受影响模块/契约/流程，写 `last_synced` 与 `source_decision`；**不重写无关页面**。
4. **判断是否冻结快照**：阶段收束 / L3 变更 → 新建 `snapshots/<TS>-<phase>.md`（冻结，不改旧快照）。
5. **重渲染 human 层**：按 §3 规则生成 `ARCHITECTURE.md` / `KEY.md` / `KNOWN-ISSUES.md`；顶部写生成时间与源快照。
6. **处理批注**（§4）。
7. **写同步报告** `reports/<TS>-架构同步.md`（或并入当次阶段报告）：改了什么、漂移修了什么、批注处理了几条。
8. `progress.md` 追加一行；`human/*` 的 `status` 从 `generated` 变 `reviewed` 需用户确认。

## 六、key 的发现（本 skill 必须做，但判定归 `key-guard`）

同步时对每个模块问一遍：

1. 这个模块里**哪段逻辑错了会让产品不成立**（不是"会报错"，是"会算错/会漏/会错权"）？
2. 有没有**不可逆**的操作（迁移、删除、发钱、发券、发通知）？
3. 有没有**精度/一致性/顺序**敏感的计算？
4. 有没有**并发/幂等**假设？
5. 有没有**对外承诺**（API 字段语义、时区、编码、排序）？
6. 有没有**性能主路径**（决定用户体验上限）？
7. 换了语言/框架，这段逻辑是否**必须原样保留**？

命中任一 → 在 `key/REGISTRY.md` 登记为 `candidate`，交 `key-guard` 走确认。

## 交付判定

- [ ] agent 层所有 `paths` 已验证存在，或标 `stale`
- [ ] 本次变更涉及的模块页都有 `last_synced` 与新 `source_decision`
- [ ] human 层五句话规则逐模块满足（抽查 2 个模块）
- [ ] 所有 `@note` 有 `@resolved` 或 `@pending`
- [ ] drift 检查结果写进了同步报告
- [ ] `ARCHITECTURE.md` 总图里的模块清单与实际目录一致
- [ ] 没有手改 human 层的事实段落（除批注驱动的措辞修正）

## 反模式

- 两套文档各写各的（立刻漂移）
- human 层写成"架构师黑话版"（用户看不懂 = 失败）
- 每次全量重写（diff 噪声大，历史丢失）
- 有批注却只在聊天里回答
- 模块页复制一遍代码（代码变了文档就错，违反 R2）

## 模板

`templates/architecture/agent-architecture.md` · `templates/architecture/human-architecture.md` · `templates/architecture/key-registry.md` · `templates/architecture/adr.md`
