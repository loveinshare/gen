---
name: implement
description: 在决策闸门通过后执行有界代码改动：先过闸门、再按 touch list 改、只做静态检查、不声称运行时通过、边改边记。当计划就绪、决策全部关闭、需要真正写代码时使用。任何“先写了再说”的冲动都应被本 skill 拦下。
license: MIT
metadata:
  version: "4.2.0"
  system: .gen
---

# implement — 有界地改

**三条底线：闸门不放行不改、超出 touch list 不改、没跑过不说通过。**

## 触发

- `plan` 已产出当前切片，且切片无 `blocked_by` 未关闭项
- 用户说"开始做""按计划改"

**不触发**：需求还没定（回 `analyze`）；决策未关闭（回 `decision-page`）。

---

## 步骤

### 0. 闸门（硬性，不可绕过）

1. 读 `.gen/decisions/INDEX.md`，过滤出与当前 feature/slice 相关的决策（`links` 命中切片 ID / `feature` 字段一致 / 标题明显相关）。
2. 对每个相关决策，检查：
   - `INDEX.md` 状态是否 `resolved`
   - `thread.md` 是否有 `## 最终结论` 段
3. 任一不满足 → **停止**，输出未关闭清单（见 `decision-page` §6），并把本次尝试记入 `progress.md`（`blocked-by-decision`）。
4. 匹配依据要写出来（哪条 links / 哪个 feature），避免"看起来相关"就拦。

### 1. 绑定切片

- 从 `plan.md` 抄出本切片：ID、验收、`touch`、回滚、停止规则。
- 写 `current-phase.md`：`doing` + 切片 ID + 开始时间。
- 若发现 touch list 不够用：**先停**，改计划并记录原因（R9），不要静默扩大。

### 2. 改动

- 一次一个切片；不做顺手重构、不格式化无关文件、不升级无关依赖。
- 小步提交：每个可独立解释的改动一个 commit，message 用 `type(scope): 描述` + 正文写"为什么"（可参考 Conventional Commits，但不强制工具链）。
- 每完成一个可验证子步，立即在 `progress.md` 追加一行（时间 | 切片 | 改了什么 | 证据 | 未决项）。
- 遇到以下情况立即停手并转出：
  | 情况 | 转向 |
  |---|---|
  | 发现隐藏假设影响行为 | `decision-page` |
  | 需要改契约/数据结构 | `decision-page` + `key-guard` |
  | 触碰 key 登记位置 | `key-guard`（禁止静默合并） |
  | 测试失败且原因不明 | `repair` |
  | 同一处连续 2 次修不好 | 停，回 `analyze` 补证据 |

### 3. 静态检查（必须真跑）

按项目实际可用的命令依次跑，**记录命令与输出摘要**（不是"应该没问题"）：

- 类型检查 / 编译：`tsc --noEmit`、`mypy`、`go build`、`cargo check`…
- Lint / 格式化检查：`eslint`、`ruff`、`golangci-lint`…
- 单测中与改动直接相关的子集（全量留给 `validate`）

### 4. 收尾

- 更新 `progress.md`：`<= done` 或 `<= blocked`，附证据链接。
- 若改动触碰架构 → 标记 `arch-sync` 待办（不要自己改 human 层文档）。
- 若改了 key → 标记 `key-guard` 待办。
- 向用户汇报：**改了什么文件、为什么、跑了什么、结果如何、还没验证什么**。

---

## 语言红线（说清楚"通过"的含义）

| 你说 | 意味着 |
|---|---|
| `编译通过` | 真跑了编译命令 |
| `单测通过（子集）` | 真跑了，且说明跑了哪些 |
| `静态检查通过` | 真跑了 lint/类型检查 |
| `运行时待验证` | 没跑起来，不声称可用 |
| **禁止** | `应该可以了`、`逻辑上没问题`、`我已经实现完成` |

## 交付判定

- [ ] 闸门检查有记录（通过或拒绝原因）
- [ ] diff 未超出 touch list（超出则有计划修订记录）
- [ ] 至少跑过一条静态检查并贴了输出摘要
- [ ] `progress.md` 有本次追加行
- [ ] 没有修改 `architecture/human/`（那是生成物）
- [ ] 没有声称未验证的运行时结果

## 反模式

- 先写代码，事后补决策（导致闸门形同虚设）
- 顺手把整个文件重排格式，diff 无法 review
- 把"跑了 3 个单测"说成"测试通过"
- 改了 key 但没走 `key-guard`（这是最贵的错误）
