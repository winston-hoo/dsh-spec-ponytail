// dsh-spec-ponytail · 需求配方库（做法清单召回）
//
// 解决的问题：同类需求每次都要从头推导改法。按**召回 → 干活 → 沉淀**的思路，把做法清单
// **砍到最瘦**——模板只保留「触发 + 做法 + 禁区」三要素，不要澄清清单、不要提示词模板。
// 它服务的是"下次同类需求快速照做"，不是需求分层。
//
// 存哪：`<会话工作目录>/.dsh-ponytail/recipes.md`，每个项目一份（与 verdicts 同构）。
// 为什么按工作区而不是机器级：做法清单是"这个项目/这类技术栈的改法"，没有跨项目共享价值。
//
// 匹配策略（轻量）：把用户需求文本切成 CJK 二元组 + ASCII 词，与每条配方的「触发」行做
// 覆盖率打分。只认强命中（≥2 个单元 + 覆盖率 ≥0.5），**宁可漏命中也不误命中**——
// 误命中会在每轮白白注入一段用户没要的正文。
//
// 注入上限：与 verdicts 一样有 MAX_RECIPE_CHARS 截断，截断处明说看原文件。
//
// 任何读写/解析失败都返回 null，**绝不抛**。

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { MODE_DIR } from './store.js'

/** 配方文件名。与档位文件同目录，但根不同（每个项目一份，见 README 的路径表）。 */
export const RECIPES_FILE = 'recipes.md'

/** 注入上限：超过就截断。常驻段已 500+ token，显式 `ponytail recipes` 列表再长也不能无限吃。 */
export const MAX_RECIPE_CHARS = 2500

/** 自动召回的最低门槛：至少命中这么多个独立单元，才算"像同一类需求"。 */
export const MATCH_MIN_UNITS = 2

/** 覆盖率门槛：用户文本要覆盖触发词的其它比例（0.5 = 一半以上触发词出现在需求里）。 */
export const MATCH_MIN_COVERAGE = 0.5

/** 自动召回最多注入第一条命中的配方；列表走显式 `ponytail recipes`。 */
export const AUTO_RECALL_LIMIT = 1

// 多行模式：`^`/`$` 按行匹配，否则 `## 名称` 后还有触发/做法等行，单行锚定会整个失败。
const BLOCK_HEAD_RE = /^##\s+(.+)$/m
// `g` 是 matchAll 的硬性要求（非 global 正则传给 matchAll 会直接抛）。
const TRIGGER_LINE_RE = /^\s*触发[:：]\s*(.+)$/gm

/**
 * 配方文件路径。`root` = 会话工作目录（每个项目一份）。
 * @param {string} root
 * @returns {string}
 */
export function recipesPath(root) {
  return join(root, MODE_DIR, RECIPES_FILE)
}

/**
 * 从整段 markdown 里解析出配方块。
 *
 * 格式约定（人也看得懂、也能用手改）：
 * ```
 * # dsh-ponytail 需求配方库（本项目）
 *
 * ## Spring 分页查询接口
 * 触发：分页 查询接口 列表翻页
 * 做法：
 * - 四层：Controller → Service → ServiceImpl → Mapper
 * - 分页参数用 pageNum/pageSize，统一返回 Result<PageResult<XxxVO>>
 * 禁区：
 * - common/Result.java 是全局契约，别改
 * - MybatisPlusConfig 的分页插件配置别动
 * ```
 *
 * 插件只解析「## 名称」与「触发：…」两行做匹配；做法/禁区正文**整块原样注入**，
 * 不逐行校验（格式给人看，追加靠模型用普通文件工具）。
 *
 * @param {string} content
 * @returns {Array<{name: string, triggers: string[], block: string}>}
 */
export function parseRecipes(content) {
  const out = []
  const stripped = String(content ?? '').replace(/^\uFEFF/, '')
  const sections = stripped.split(/\n(?=##\s)/)
  for (const section of sections) {
    if (!BLOCK_HEAD_RE.test(section)) continue
    const name = BLOCK_HEAD_RE.exec(section)[1].trim()
    const triggers = [...section.matchAll(TRIGGER_LINE_RE)].map((m) => m[1].trim()).filter(Boolean)
    if (!name) continue
    out.push({ name, triggers, block: section.trim() })
  }
  return out
}

/**
 * 读配方库。
 * @param {string} root 会话工作目录
 * @returns {{ text: string, recipes: Array<{name:string,triggers:string[],block:string}>, total: number, truncated: boolean } | null}
 *   没有文件（或内容为空/只有标题）时返回 null。
 */
export function readRecipes(root) {
  let raw
  try {
    raw = readFileSync(recipesPath(root), 'utf8').replace(/^\uFEFF/, '')
  } catch {
    return null
  }
  const text = raw.trim()
  // 只有空文件 / 只有文件头（# 标题）但没有任何配方块，都算"空台账"，不召回。
  const recipes = parseRecipes(raw)
  if (text.length === 0 || recipes.length === 0) return null
  const truncated = text.length > MAX_RECIPE_CHARS
  return {
    text: truncated ? `${text.slice(0, MAX_RECIPE_CHARS)}\n…（配方库过长已截断，完整内容见 ${recipesPath(root)}）` : text,
    recipes,
    total: text.length,
    truncated,
  }
}

// ---------- 匹配（轻量 CJK 捕获，零依赖） ----------

const ASCII_WORD_RE = /[a-zA-Z][a-zA-Z0-9_.-]*/g
const CJK_RUN_RE = /[\u4e00-\u9fa5]{2,}/g

/**
 * 把一段文本切成匹配单元：ASCII 词（小写）+ CJK 段内的相邻二元组。
 * 二元组让中文短语可以部分匹配（"分页查询" 与 "查询接口" 共享 "查询"）。
 * @param {string} text
 * @returns {Set<string>}
 */
export function tokenize(text) {
  const units = new Set()
  const s = String(text ?? '')
  for (const m of s.matchAll(ASCII_WORD_RE)) units.add(m[0].toLowerCase())
  for (const run of s.matchAll(CJK_RUN_RE)) {
    const str = run[0]
    for (let i = 0; i + 1 < str.length; i += 1) {
      units.add(str.slice(i, i + 2))
    }
  }
  return units
}

/**
 * 单条触发词的覆盖率：用户原命中的单元数 / 触发词单元数。
 * @param {Set<string>} userUnits
 * @param {string} trigger
 * @returns {{ matched: number, total: number, coverage: number }}
 */
export function triggerCoverage(userUnits, trigger) {
  const t = tokenize(trigger)
  if (t.size === 0) return { matched: 0, total: 0, coverage: 0 }
  let matched = 0
  for (const u of t) if (userUnits.has(u)) matched += 1
  return { matched, total: t.size, coverage: matched / t.size }
}

/**
 * 用用户需求文本匹配配方库，返回覆盖最高的那条（含分值）。
 * 门槛：命中单元数 ≥ MATCH_MIN_UNITS 且覆盖率 ≥ MATCH_MIN_COVERAGE，二者都满足才算命中。
 * 优先级：(matched, coverage) 双维，先比命中数，再比覆盖率。
 *
 * @param {string} root 会话工作目录
 * @param {string} userText 用户需求原文
 * @returns {{ recipe: {name:string,triggers:string[],block:string}, matched: number, total: number, coverage: number } | null}
 */
export function matchRecipe(root, userText) {
  const text = String(userText ?? '').trim()
  if (text.length === 0) return null
  const lib = readRecipes(root)
  if (!lib) return null
  const userUnits = tokenize(text)
  let best = null
  for (const recipe of lib.recipes) {
    if (recipe.triggers.length === 0) continue
    for (const trigger of recipe.triggers) {
      const { matched, total, coverage } = triggerCoverage(userUnits, trigger)
      if (matched < MATCH_MIN_UNITS || coverage < MATCH_MIN_COVERAGE) continue
      if (
        !best ||
        matched > best.matched ||
        (matched === best.matched && coverage > best.coverage)
      ) {
        best = { recipe, matched, total, coverage }
      }
    }
  }
  return best
}

// ---------- 触发判定 ----------

/**
 * 显式召回指令：`ponytail recipes` / `ponytail recipe` / `ponytail 配方` / `ponytail 做法`。
 * 与切档/台账指令一样**整句锚定**，夹在正文里的不算。
 * @param {string} text
 * @returns {boolean}
 */
export function isRecipesCommand(text) {
  return (
    typeof text === 'string' &&
    /^[/@]?ponytail[\s:：]+(?:recipes?|配方|做法|记住)[.!。！]?$/i.test(text.trim())
  )
}

// ---------- 注入正文 ----------

/**
 * 生成召回注入正文。
 * @param {{ path: string, recipe?: {name:string,block:string}, matchText?: string, listText?: string, missing?: boolean, truncated?: boolean }} args
 *   recipe = 自动命中单条；listText = 显式 `ponytail recipes` 返回的整段；missing = 库为空。
 * @returns {string}
 */
export function renderRecipeNotice({ path, recipe, listText, missing }) {
  const head = `[ponytail] ${
    recipe
      ? `命中本项目配方「${recipe.name}」（${path}）`
      : missing
        ? `本项目的需求配方库还没有内容（${path}）`
        : `本项目的需求配方库（${path}）`
  }`
  const howto =
    '用法：照下面的做法与禁区执行。做完若发现做法/禁区与真实情况不符，顺手更新该配方；' +
    '若出现"又一种同类需求值得记"，用 `## 名称 + 触发：…` 追加一条。'
  if (missing) {
    return (
      `${head}\n\n` +
      '（还是空的。看到"这次做完，下次同类可直接照做"的做法就建文件追加，' +
      '格式：每个配方用 "## 名称" 起头，下面写 "触发："、"做法："、"禁区：" 三节，每条一行。）\n\n' +
      howto
    )
  }
  const body = recipe ? recipe.block : listText ?? ''
  return `${head}\n\n${body}${body ? '\n\n' + howto : ''}`
}