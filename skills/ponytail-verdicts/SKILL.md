---
name: ponytail-verdicts
description: >
  The project's simplification verdict ledger — what must NOT be cut here and why,
  plus the cut patterns already accepted. Read it BEFORE a review or audit so a
  rejected suggestion is never re-proposed; append new verdicts AFTER one. Use for
  "ponytail verdicts", "what did we decide not to cut", "why can't this be cut",
  "为什么这个不能砍", or whenever a review is about to re-litigate an old call.
---

> 本插件自有能力，不是上游移植（上游 ponytail 没有记忆层）。
> 与 `ponytail-recall` 是同一套**召回 → 干活 → 沉淀**记忆机制，这里记"简化裁决"。

Ponytail's reviews are one-shot by nature. Without a ledger, every review of the
same repo re-proposes the same cuts that were already rejected for project-specific
reasons, and the reason itself ("this wrapper exists for the test harness") is
re-derived or simply lost.

The ledger fixes that. It lives at:

```
<session cwd>/.dsh-ponytail/verdicts.md
```

**Read it before reviewing, append to it after.**

## Format

Two sections, one line per verdict, newest first. Keep each line a single
sentence with the *reason* — a verdict without a reason gets re-litigated.

```markdown
# ponytail 裁决台账（本项目）

## 不可砍（红线）
- `src/legacy/wrapper.js` 的转发层 — 原因：给 e2e 测试注入 sleep 用，删了测试会 flake

## 可砍套路（已验证）
- `useMemo` 包廉价计算 → 直接内联 — 已在本仓 3 处验证，收益 ~40 行
```

Rules of the ledger:

- **红线（不可砍）**：记"什么 + 为什么"。原因必须具体到可以被检验（谁在用、替代是什么），
  不写"感觉需要"。
- **可砍套路（已验证）**：记"模式 → 标准改法"，附上验证过的地方，让下次同类改动直接照做。
- 只记**裁决**：如果一轮 review 没有产生新的否决或新的确认套路，就什么都不写 ——
  台账不是变更日志。

## Read

The plugin injects this file automatically on review/audit-shaped turns (and on
`ponytail verdicts`). If you need it outside those, read the file directly.

When a proposed cut collides with a 红线, **do not propose it**; if you think the
red line is now stale, say so explicitly and ask, rather than silently re-proposing.

## Append

Use the normal file tools. Create the file (and the `.dsh-ponytail/` directory) if
it does not exist. Append, don't rewrite — the ledger is the project's memory.

Do it right after a review/audit where the user accepted or rejected something
non-obvious, not on every review.

## Boundary

- Not the same as `ponytail-debt`: the ledger records **decisions** (what we
  refuse to cut, and why), while `ponytail-debt` harvests **deferred shortcuts**
  (`ponytail:` comments in code).
- Not the same as `ponytail-recall`: the ledger records **simplification decisions**,
  while recipes record **implementation playbooks** for a type of requirement. Both
  are project memory, read in different situations.
