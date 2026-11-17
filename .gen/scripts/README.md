# `.gen/scripts/` — 工具链

零依赖，只要 Node ≥ 16。所有命令都可以在**任意子目录**执行（自动向上找 `.gen/`），也可以用 `--root` 指定。

```bash
node .gen/scripts/gen.mjs <命令> [参数]
```

## 命令一览

| 命令 | 作用 | 会不会改文件 |
|---|---|---|
| `lint` | 校验整个 `.gen`：frontmatter、枚举、命名时间戳、决策与 INDEX 一致、台账列数、技能规范、悬空 ID、仓库根卫生 | 否 |
| `status` | 打印状态栈摘要 + **闸门结论**（能不能进 implement） | 否 |
| `serve` | 起本地决策服务，页面里一键把批复写盘 | 只写 `response-rN.md` |
| `new` | 按类型创建带正确时间戳的产物 | 是（新建） |
| `init` | 在项目里初始化 `.gen` 骨架（幂等，只补缺失） | 是 |
| `demo` | 生成一个可跑的示例项目，用来体验/自测 | 是（目标目录） |
| `test` | 跑工具自身的测试套件（`node --test`） | 否（用临时目录） |
| `key-check` | 用 `git diff` ∩ `REGISTRY.md` 的位置，判断有没有碰到 key | 否 |
| `install` | 把 12 个 skill 安装/链接到 `.claude/skills` 等客户端目录 | 是（目标目录） |
| `report` | 从 INDEX/LEDGER/failures/progress 汇总出报告初稿 | 可选 `--write` |
| `decision-diff` | 第 N 轮 vs 第 N-1 轮决策页的差异，输出 HTML | 是（diff 页） |

## 常用示例

```bash
# 每次改完跑一遍
node .gen/scripts/gen.mjs lint

# 开会话先看状态（退出码 1 = 有未关闭决策，不能开工）
node .gen/scripts/gen.mjs status

# 决策页带写盘能力
node .gen/scripts/gen.mjs serve --decision D-2026111503-token-store

# 新建产物
node .gen/scripts/gen.mjs new decision --slug cache-strategy --title "缓存策略"
node .gen/scripts/gen.mjs new report --title "第47周进展" --format html
node .gen/scripts/gen.mjs new failure --slug login-500 --title "登录 500"

# 接入一个已有仓库
node .gen/scripts/gen.mjs init --root /path/to/project

# 想先看看长什么样
node .gen/scripts/gen.mjs demo

# 跑工具自身的测试（56 个用例，~18s）
node .gen/scripts/gen.mjs test
# 等价于：node --test .gen/scripts/gen.test.mjs

# 提交前：有没有碰到 key
node .gen/scripts/gen.mjs key-check
# PR 场景：与目标分支比
node .gen/scripts/gen.mjs key-check --base origin/main --fail-on critical

# 出报告初稿（数字自动算，结论人补）
node .gen/scripts/gen.mjs report --title "第47周进展" --write
node .gen/scripts/gen.mjs report --title "阶段评审" --json

# 决策第 2 轮的变动可视化
node .gen/scripts/gen.mjs decision-diff --decision D-2026111503-token-store

# 把 skills 装到客户端（无 --force 不会覆盖别人的 skill）
node .gen/scripts/gen.mjs install --target claude
node .gen/scripts/gen.mjs install --target cursor --link
```

## 四个"补牙"命令的边界

### `key-check`

- 文件列表来自 `git status`（工作区+暂存）或 `--base <ref>`（分支对比）；不是 git 仓库时用 `--files` 兜底。
- 行号精度来自 `git diff -U0`；只改到 key 区间之外会报"文件被改但行号不在区间"，**不算命中**（提示你去核对位置是否漂移）。
- 拦截阈值：`--fail-on high`（默认，critical/high 命中即失败）/`critical`/`any`/`none`。
- 只读，不改代码；它的价值在于让"key 变更必须人确认"这条从口号变成退出码。

### `install`

- 内置目标：`claude`→`.claude/skills`、`codex`→`.codex/skills`、`cursor`→`.cursor/skills`、`dsh`→`.dsh/skills`；也可直接传路径。
- `--global` 装到用户主目录；`--link` 用 symlink（Windows 用 junction，无需管理员），失败自动退回复制。
- 目标目录已存在但**没有 `.gen-install.json`** → 拒绝，除非 `--force`（防止覆盖你手写的 skill）。
- 清单记录版本与安装时间，便于以后做"过期检测"。

### `report`

- 数字来自 `decisions/INDEX.md`、`tests/LEDGER.md`、`tests/failures/`、`progress.md`、`reports/`。
- 输出是 **draft**：结论、风险、下一步、待拍板四节留 `<!-- 待填写 -->`，`status: draft` 是刻意的——数字对了不代表判断对了。
- `--write` 会同时往 `reports/INDEX.md` 插一行，避免 W60。

### `decision-diff`

- 解析 `page.html` 与 `page-r1.html` 里的 `<script id="gen-data">` JSON（所以页面数据必须是合法 JSON）。
- 比对：新增/删除决策项、选项增删与字段变化（label/how/gain/cost/reversible）、推荐与理由、假设、排除项、状态。
- 输出 `diff-r{from}-r{to}.html`：左旧右新、按决策项分组；`--json` 给机器读。


## 测试覆盖（`gen.test.mjs`）

零依赖，用 Node 内置 `node:test` + `assert/strict`；每个用例自己建临时项目（走真实模板 `init`），跑完删除。

| 分组 | 覆盖 |
|---|---|
| frontmatter 解析 | 行内注释剥离、links 数组、缩进映射、无 frontmatter、引号去壳 |
| lint 基线 | 模板包 0 错误、刚 init 的项目 0 错误、`--json` 结构 |
| lint 负向 | **E20/E21/E23/E25/E26/E30/E32/E33/E34/E35/E41/E13/E01** 每条规则各一个注入缺陷用例；**W20/W70/W90**；`--strict` 把警告升级为失败 |
| status 闸门 | open → 退出码 1；全 resolved → 0；状态表解析 |
| new | 决策自动登记 INDEX、重名拒绝（退出码 2）、report 的 md/html、五种产物落位 |
| init | 幂等（第二次不新增文件）、`--force` 覆盖 |
| demo | 生成物 lint 通过、status 报阻塞、报告与台账齐全 |
| serve | 列表页 / 页面 / POST 落盘 / 非法 ID 与空批复 400 / 404 / 静态读 thread |
| **key-check** | git 命中区间 → 1；只改区间外 → 0；`--fail-on none`；`--files` 手动；非 git → 3 |
| **install** | 12 个 skill + 清单；重复安装幂等；非 gen 目录拒绝/`--force`；`--link` |
| **report** | 数字正确、`--write` 登记 INDEX 且 lint 干净、`--json` |
| **decision-diff** | 新增项/推荐变化/选项字段变化、HTML 旧新对照、缺快照 → 1、demo 自带两轮可 diff |
| 回归 | `copyTree` 复制含中文路径（`fs.cpSync` 崩溃的回归用例） |
| 技能包 | 12 个核心 skill 齐全、name 与目录一致、description 长度 |

**为什么这些测试值得写**：`lint` 的每条规则都是"人容易犯、肉眼难查"的错。测试把它们从"文档说会检查"变成"改了代码立刻知道有没有失效"——尤其是 E32（假关闭）和 E26（时间戳伪造），这两条一旦静默失效，整套体系的可信度就没了。

`serve` 测试会真的起一个子进程、挑空闲端口、用 `fetch` 打接口、再检查磁盘文件，最后 kill——不是 mock。

## `lint` 的检查项

| 码 | 级别 | 检查 |
|---|---|---|
| E01 | error | 找不到 `.gen/AGENTS.md` / `.gen` 不存在 |
| E10–E16 | error | 技能：缺 `SKILL.md`、缺 frontmatter、`name` 与目录不符、`description` 超长 |
| E20–E26 | error | 产物：缺 frontmatter/必填字段、`kind`/`status` 不在枚举、`id` 重复、决策 id 与目录不符、文件名时间戳与 `created` 不一致 |
| E30–E35 | error | 决策：缺 `page.html`/`thread.md`、`resolved` 但结论仍是占位、INDEX 缺行/多行/状态不一致 |
| E40–E41 | error | 台账列数不符 9 列、结果值非法 |
| W16–W18 | warn | description 过短、正文 >500 行、缺核心 skill |
| W20 | warn | frontmatter 的 `id` 还是模板占位（`YYYY…` / `xxx`）或 `title` 里还有 `<...>` |
| W21–W22 | warn | 决策目录名不符合 `D-YYYYMMDDHH-<slug>`；`open` 的决策还没有 Round 1 记录 |
| W40 | warn | 台账结果不是合法枚举 |
| W50–W52 | warn | 人读架构缺 `generated_from`、`reviewed` 却无批注回执 |
| W60 | warn | 报告没登记进 `reports/INDEX.md` |
| W70 | warn | 仓库根出现过程文件（NOTES/TODO/临时/report-*） |
| W80 | warn | 未关闭决策 > 5 个（体系开始变成阻力） |
| W90 | warn | `links` 指向不存在的 D-/F-/R- ID |

退出码：`0` 通过（可有警告）；`1` 有错误（`--strict` 时警告也算失败）；`2` 用法错误。
`--json` 输出机器可读结果，便于接 CI。

## `serve` 的安全边界

- 只绑定 `127.0.0.1`，不对外网暴露。
- 只接受 `POST /api/response`，且只写 `decisions/<合法 D-ID>/response-rN.md`；ID 用正则校验，拒绝路径穿越。
- 请求体上限 2MB。
- 不做鉴权：本机其他程序可以访问，别在共享机器上长开。

## 为什么不用 `fs.cpSync`

在 Windows 上，源路径含中文/非 ASCII 时 `fs.cpSync` 会让 Node 直接崩溃（`0xC0000409`）。脚本里用自己实现的 `copyTree`（`readdir + copyFileSync`），已验证可复制 `D:\code\规范` 这类路径。

## 与 skill 的关系

skill 写"什么时候做、做到什么程度"，脚本只做"确定性的机械检查/搬运"。
二者必须一致：改了目录规范 → 同时改 `.gen/AGENTS.md`、`gen.mjs` 的 `KINDS`/命名正则、以及对应模板。
