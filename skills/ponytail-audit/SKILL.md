---
name: ponytail-audit
description: >
  Whole-repo audit for over-engineering. Like ponytail-review, but scans the
  entire codebase instead of a diff: a ranked list of what to delete, simplify,
  or replace with stdlib/native equivalents. Use when the user says "audit this
  codebase", "audit for over-engineering", "what can I delete from this repo",
  "find bloat", "ponytail-audit".
---

> Ported from [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) (MIT).

ponytail-review, repo-wide. Scan the whole tree instead of a diff. Rank
findings biggest cut first.

**Before you start:** if a verdict ledger was injected (`.dsh-ponytail/verdicts.md`),
honour it — never re-propose a cut listed under 红线（不可砍）, and reuse the accepted
patterns under 可砍套路 instead of re-deriving them. **After you finish:** append the
new verdicts (see `ponytail-verdicts`).

## Tags

Same as ponytail-review:

- `delete:` dead code, unused flexibility, speculative feature. Replacement: nothing.
- `stdlib:` hand-rolled thing the standard library ships. Name the function.
- `native:` dependency or code doing what the platform already does. Name the feature.
- `yagni:` abstraction with one implementation, config nobody sets, layer with one caller.
- `shrink:` same logic, fewer lines. Show the shorter form.

## Hunt

Deps the stdlib or platform already ships, single-implementation interfaces,
factories with one product, wrappers that only delegate, files exporting one
thing, dead flags and config, hand-rolled stdlib.

Skip `node_modules`, `.git`, vendored trees, and build output. Read
selectively — a whole-repo audit is not a licence to read every file whole.

## Output

One line per finding, ranked: `<tag> <what to cut>. <replacement>. [path]`.
End with `net: -<N> lines, -<M> deps possible.` Nothing to cut: `Lean already. Ship.`

## Boundaries

Scope: over-engineering and complexity only. Correctness bugs, security holes,
and performance are explicitly out of scope. Route them to a normal review
pass. Lists findings, applies nothing. One-shot: changes no level, persists
nothing.
