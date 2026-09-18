---
name: ponytail-recall
description: >
  The project's requirement recipes — a "how we did this kind of task last time"
  playbook (approach + red lines) distilled from finished work. Recall one when a
  new request resembles a stored recipe so the implementation restarts from a proven
  method instead of from scratch; distill a new one when a finished task would be
  done the same way next time. Use for "ponytail recipes", "similar requirements
  should respond fast", "记一下这类需求怎么做", "沉淀做法", or whenever a request
  matches something done before.
---

> 本插件自有能力，不是上游移植（上游 ponytail 没有需求记忆层）。
> 设计目标是**最瘦**的"做法清单"：只留「触发 + 做法 + 禁区」三要素，
> 不要澄清清单与提示词模板。插件独立运行，不需要其它插件配合。

A request that's structurally the same as one you already shipped shouldn't be
solved from first principles again. The recipe library turns "done once" into
"one step away next time".

It lives at:

```
<session cwd>/.dsh-ponytail/recipes.md
```

## Format — keep it to three elements

```markdown
# dsh-ponytail 需求配方库（本项目）

## Spring 分页查询接口
触发：分页 查询接口 列表翻页
做法：
- 四层：Controller → Service → ServiceImpl → Mapper
- 分页参数用 pageNum/pageSize，统一返回 Result<PageResult<XxxVO>>
禁区：
- common/Result.java 是全局契约，别改
- MybatisPlusConfig 的分页插件配置别动
```

- `触发`：**写给未来的你看**的高频词，空格分隔。它决定"下次什么样的需求算同类、会被自动召回"。
- `做法`：这次实际走的步骤，写清可复制的做法，不要废话。
- `禁区`：这类需求别碰什么。这是最有价值的沉淀项，宁可多写给用户看的解释，别留空。

## Recall — happens for you

The plugin injects the best-matching recipe automatically when a **coding** request
covers ≥2 trigger tokens (CJK-aware) at ≥50% coverage — a strong overlap only, so
ordinary turns stay quiet. On `ponytail recipes` it injects the whole library.

When a recipe is injected:
- Follow its 做法 and respect its 禁区; the recipe is a head start, not a straitjacket.
- If reality disagrees with the recipe when you read it, **adjust on the spot** and
  update the recipe afterward so it stays true.
- If no recipe matches but the request clearly resembles one, read `recipes.md`
  directly and mention the closest you found.

## Distill — one append when a task closes

Not after every task. Add a recipe only when all hold (reuse-value gate):
1. Next time a request like this comes up, you'd follow the same steps → approach is reproducible.
2. The steps outlive this one task (a one-off hack, or an environment quirk, doesn't qualify).

Append with the normal file tools; create the file and the `.dsh-ponytail/` directory
if missing. Don't rewrite — it's the project's memory. Keep each 做法/禁区 line one
sentence, actionable.

## Boundary

- **Not** the same as `ponytail-verdicts`: verdicts record **simplification decisions**
  (what we refuse to cut and why); recipes record **implementation playbooks** for a
  *type of requirement* (how we did it + what not to touch). Both are recallable —
  read the verdicts before review/audit, recall recipes when starting a new task.
- Recipes stay deliberately thin — only three elements (trigger / approach / red
  lines) and no clarify checklist or prompt template, so recall is cheap and the
  model reuses a proven method instead of rebuilding it.