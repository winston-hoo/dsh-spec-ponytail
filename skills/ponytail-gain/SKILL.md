---
name: ponytail-gain
description: >
  Show ponytail's measured impact as a compact scoreboard: less code, less
  cost, more speed, from the benchmark medians. One-shot display, not a
  persistent mode, and not a per-repo number. Use when the user says
  "ponytail gain", "what does ponytail save", "show ponytail impact",
  "ponytail scoreboard".
---

> Ported from [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) (MIT).

Display this scoreboard when invoked. One-shot: do NOT change the level, write
flag files, or persist anything.

The figures are the published **agentic** benchmark medians: a headless Claude
Code session editing a real open-source repo (FastAPI + React), twelve feature
tickets, the same agent with and without the skill, n=4, Haiku 4.5. They are
measured, not computed from the current repo. Source: upstream
`benchmarks/results/2026-06-18-agentic.md` and its README.

## Scoreboard

Render plain ASCII bars. The bar length shows the measured figure; the label
carries the exact number:

```
  ponytail gain            agentic benchmark · 12 tasks · vs no-skill baseline

  Lines of code   █████████▌··········  46%   ▼ 54%   (up to 94% where an agent over-builds)
  Tokens          ███████████████▌····  78%   ▼ 22%
  Cost            ████████████████····  80%   ▼ 20%
  Time            ██████████████▌·····  73%   ▼ 27%
  Safety          ████████████████████ 100%   (adversarial tier, same as no-skill)

  median cut per task is ~54%; it approaches zero where the code was already minimal.

  This repo:  ponytail-debt  (shortcuts you deferred)
              ponytail-audit (what's still cuttable)
```

If the user quotes the older "80–94% less code" figure: that was the
single-shot benchmark against a bare-model baseline, where the baseline padded
its answer with prose and options. Upstream's own README calls the agentic
numbers the corrected, defensible version.

## Honesty boundary

These are benchmark medians, not this repo. NEVER print a per-repo savings
number ("you saved X lines/tokens here"): the unbuilt version was never
written, so there is no real baseline to subtract from in a live repo. The
only real per-repo figures come from `ponytail-debt` (a counted ledger), and
this card points there instead of inventing one.

## Boundaries

One-shot display. Edits nothing, changes no level.
