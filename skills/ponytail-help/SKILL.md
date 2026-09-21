---
name: ponytail-help
description: >
  Quick-reference card for all ponytail levels, skills, and switches,
  as they exist in DeepSeek Harness. One-shot display, not a persistent mode.
  Use when the user says "ponytail help", "what ponytail commands",
  "how do I use ponytail".
---

> Adapted from [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) (MIT).
> Host-specific sections were rewritten for DeepSeek Harness; the levels and
> skills are upstream's.

# Ponytail Help

Display this reference card when invoked. One-shot, do NOT change the level,
write flag files, or persist anything.

## Levels

| Level | What change |
|-------|-------------|
| **lite** | Build what's asked, but name the lazier alternative in one line. |
| **full** | The ladder enforced: YAGNI → stdlib → native → one line → minimum. Default. |
| **ultra** | YAGNI extremist. Deletion before addition. Challenges the requirement before building. |

The level sticks until it is changed (process-wide). The active level is
printed at the top of the resident ruleset every request, so it is always
readable from context.

## Skills

| Skill | What it does |
|-------|--------------|
| **ponytail** | Lazy mode itself. Simplest solution that works. |
| **ponytail-review** | Over-engineering review of the diff: `L42: yagni: factory, one product. Inline.` |
| **ponytail-audit** | Whole-repo over-engineering audit: ranked list of what to delete. |
| **ponytail-debt** | Harvest `ponytail:` shortcut comments into a tracked ledger. |
| **ponytail-verdicts** | The project's ledger of cut verdicts: what must not be cut, and the patterns already accepted. |
| **ponytail-gain** | Measured-impact scoreboard: less code, less cost, more speed. |
| **ponytail-help** | This card. |

## Switching (DeepSeek Harness)

There is no slash-command surface in DSH, so switching is a **plain standalone
message**, and the plugin parses it before the model ever sees it — the switch
cannot be misread:

| Message | Effect |
|---------|--------|
| `ponytail lite` / `ponytail full` / `ponytail ultra` | Set the level |
| `ponytail` | Report the current level; re-enable at the default level if it was off |
| `ponytail off` · `stop ponytail` · `normal mode` · `关闭 ponytail` | Turn it off |
| `ponytail verdicts` (or `ponytail 裁决` / `ponytail 台账`) | Recall this project's cut verdict ledger |

The message must stand alone (`ponytail ultra`), not be buried in a sentence
("可以按 ponytail 风格改一下") — a buried mention is treated as ordinary prose,
never as a switch.

## Where the level lives

A switch is **written to disk** at `<dsh-start-dir>/.dsh-ponytail/mode` — the
plugin resolves that as its own `process.cwd()`, i.e. the directory dsh was
launched from, **not the session workspace**. So:

- the level **survives a restart** — that is the point of the file;
- it is **machine-wide, not per project**: switching in one project changes the
  level for every other project too;
- to reset to the configured default, delete that file.

## Configure the default level

Resolution order: **persisted file > environment variable > plugin config > `full`**.

The persisted file wins because it records what the user last chose — the env var
and config only decide the level when nothing was ever switched.

```bash
export PONYTAIL_DEFAULT_MODE=ultra     # highest priority
```

```yaml
# profile 的 cordis.patch.yml（id 定向补丁会整体替换 config，要写全字段）
- id: ponytail
  config:
    defaultMode: lite
```

`off` as the default keeps ponytail dormant until you say `ponytail`.

## More

Upstream docs and examples: https://github.com/DietrichGebert/ponytail
DSH port: see this plugin's README.
