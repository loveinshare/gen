---
name: gen-init
description: 在一个仓库里初始化 .gen 过程骨架：创建目录、状态栈、决策看板、测试总账、双架构文档和 gitignore，并把项目快照填到可用状态。当用户说“给这个项目装 .gen”“初始化流程规范”“接入这套体系”，或仓库里还没有 .gen 目录时使用。
license: MIT
metadata:
  version: "4.2.0"
  system: .gen
---

# gen-init — 初始化 `.gen` 骨架

**目标**：让下一个接手的 agent 只读 `.gen/` 就能开始工作，不需要问人"这个项目是干什么的"。

## 触发

- 仓库没有 `.gen/`，用户要启用这套流程
- 已有 `.gen/` 但缺关键目录（如 `decisions/`、`tests/`）
- 用户说"接入规范""初始化一下"

## 前置检查

1. 确认仓库根目录：`git rev-parse --show-toplevel`（没有 git 就用当前工作目录，并在快照里注明"未纳入版本控制"）。
2. 若 `.gen/` 已存在：**不要覆盖**，只补缺失项，并在 `progress.md` 追加一行说明补了什么。
3. 读根 `README.md`、`package.json` / `pyproject.toml` / `go.mod` 等，提取技术栈——用于填快照，不要猜。

## 步骤

1. **建目录**（严格按 `.gen/AGENTS.md` §2；缺失的父目录一并建）。
   > 快路径：`node .gen/scripts/gen.mjs init --root <项目>`，等价且幂等（只补缺失，`--force` 才覆盖）。跑完仍要人工填 `project-snapshot.md`。
2. **拷模板**：从 `.gen/templates/` 复制到对应位置，替换占位符：
   - `state/*` → `workflow/state/`
   - `decision/INDEX.md` → `decisions/INDEX.md`
   - `test/ledger.md` → `tests/LEDGER.md`
   - `test/matrix.md` → `tests/matrix.md`
   - `architecture/agent-architecture.md` → `architecture/agent/ARCHITECTURE.md`
   - `architecture/human-architecture.md` → `architecture/human/ARCHITECTURE.md`
   - `architecture/key-registry.md` → `architecture/agent/key/REGISTRY.md`
   - `gitignore.template` → `.gen/.gitignore`
3. **填 `project-snapshot.md`**（最重要，宁可留空也不要编）：
   - 项目一句话是什么、给谁用
   - 技术栈与版本（从锁文件读，不猜）
   - 运行/构建/测试命令（**实际跑通一条再写**，跑不通写"未验证"）
   - 目录地图：只列"改了会影响别人"的目录，≤ 15 条
   - 外部依赖与凭证需求（只写变量名，不写值）
4. **填 `current-phase.md`**：阶段名（`bootstrap`）、当前切片、下一步、负责人。
5. **建首个快照**：`architecture/agent/snapshots/<TS>-bootstrap.md`，内容就是当前骨架状态（可以很薄，目的是建立时间零点）。
6. **登记候选 key**（只登记候选，不判定）：读入口文件与核心算法文件，按 `key-guard` 的七问列出 `candidate`，全部标 `confirmed_by: pending`。
7. **写 `progress.md` 首行** + 更新 `decisions/INDEX.md` 的表头。
8. **向用户汇报**：建了什么、哪些字段仍为空、建议先确认哪 3 件事（通常：目标、验收标准、key 候选）。

## 产物

```
.gen/ 完整骨架 + project-snapshot.md 可用 + 首份快照 + key 候选清单 + progress 首行
```

## 交付判定

- [ ] `workflow/state/` 五件套存在且非模板占位（快照至少 6 个字段有真实内容）
- [ ] `decisions/INDEX.md` 可被 `implement` 解析（表头正确）
- [ ] `tests/LEDGER.md` 有表头
- [ ] 至少一条命令**实际执行过**并记录输出摘要
- [ ] `.gen/.gitignore` 存在
- [ ] 没有把源码复制进 `.gen/`

## 反模式

- 把 `README.md` 内容整段抄进快照（重复即漂移，违反 R2）
- 编造测试命令"应该是 `npm test`"——没跑过就写"未验证"
- 一次性建 30 个空文件却不填状态栈（留下一堆占位符比没有更糟）
- 顺手改代码（初始化只读代码，不改）

## 模板

`templates/state/project-snapshot.md`、`templates/state/current-phase.md`、`templates/gitignore.template`
