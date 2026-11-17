# `.gen/tests/` — 测试账本怎么用

## 一次测试的完整动作

1. 跑测试，把输出存到 `tests/runs/<TS>-<切片>/`（该目录 gitignore）。
2. `LEDGER.md` 追加一行（9 列，命令可复制）。
3. 有失败 → 建 `failures/F-<TS>-<slug>.md`，按七节填（见 `templates/test/failure.md`）。
4. 修复后把档案 `status` 改 `fixed`，并在档案里写回归测试位置。
5. 月末把 `LEDGER.md` 剪切到 `history/LEDGER-YYYYMM.md`，活账留一行指针。

## 目录

| 路径 | 入库 | 用途 |
|---|---|---|
| `LEDGER.md` | 是 | 当月活账，append-only |
| `history/LEDGER-YYYYMM.md` | 是 | 月结卷 |
| `failures/F-*.md` | 是 | 失败档案（结论与证据） |
| `fixtures/<F-id>/` | 是 | 最小复现数据（脱敏、小） |
| `runs/<TS>-<切片>/` | **否** | 原始日志、截图、trace、JUnit XML |
| `matrix.md` | 是 | 环境矩阵 |

## 三条纪律

1. **命令可复制**：不写"跑了测试"，写 `pnpm vitest run tests/auth -t "token"`。
2. **失败必须有档案**：台账里出现 `fail`，就必须有 `F-...` 链接。
3. **`flaky` 要 3 次证据**：同一环境复跑 ≥3 次，记录写进档案；否则只能 `unknown`。

## 追查示例

半年后问"这个接口什么时候开始不稳的"：

```bash
grep -n "auth" .gen/tests/history/LEDGER-*.md        # 找首次 fail 的月份与切片
grep -rn "F-2026" .gen/tests/failures/ | head        # 找档案的复跑记录
```

再对照同期的 `progress.md` 与 `key/CHANGELOG.md`，就能定位"是哪次改动引入的"。
