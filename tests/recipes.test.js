import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test, { after, beforeEach } from 'node:test'

import { MODE_DIR } from '../lib/store.js'
import {
  MATCH_MIN_COVERAGE,
  MATCH_MIN_UNITS,
  MAX_RECIPE_CHARS,
  RECIPES_FILE,
  isRecipesCommand,
  matchRecipe,
  parseRecipes,
  readRecipes,
  recipesPath,
  renderRecipeNotice,
  tokenize,
  triggerCoverage,
} from '../lib/recipes.js'

let root
const created = []

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ponytail-recipes-'))
  created.push(root)
})

after(() => {
  for (const dir of created) rmSync(dir, { recursive: true, force: true })
})

/** 造一份配方库 */
function seed(content) {
  mkdirSync(join(root, MODE_DIR), { recursive: true })
  writeFileSync(recipesPath(root), content, 'utf8')
}

const SAMPLE =
  '# dsh-ponytail 需求配方库（本项目）\n' +
  '\n' +
  '## Spring 分页查询接口\n' +
  '触发：分页 查询接口 列表翻页\n' +
  '做法：\n' +
  '- 四层：Controller → Service → ServiceImpl → Mapper\n' +
  '- 分页参数用 pageNum/pageSize\n' +
  '禁区：\n' +
  '- common/Result.java 是全局契约，别改\n'

// ---------- 路径 ----------

test('recipesPath：与档位文件同目录，不同文件', () => {
  assert.equal(recipesPath('D:\\proj'), join('D:\\proj', MODE_DIR, RECIPES_FILE))
  assert.equal(RECIPES_FILE, 'recipes.md')
})

// ---------- 解析 ----------

test('parseRecipes：按 ## 切块，取 name 与 触发 行，正文整块保留', () => {
  const recipes = parseRecipes(SAMPLE)
  assert.equal(recipes.length, 1)
  assert.equal(recipes[0].name, 'Spring 分页查询接口')
  assert.deepEqual(recipes[0].triggers, ['分页 查询接口 列表翻页'])
  assert.ok(recipes[0].block.includes('做法'), '正文要含做法')
  assert.ok(recipes[0].block.includes('禁区'))
})

test('parseRecipes：多条配方、去 BOM、忽略非 ## 块', () => {
  const recipes = parseRecipes('\uFEFF# 头\n\n## 甲\n触发：a b\n## 乙\n触发：c\n正文\n')
  assert.equal(recipes.length, 2)
  assert.equal(recipes[0].name, '甲')
  assert.equal(recipes[1].name, '乙')
})

test('parseRecipes：没有配方块（只有标题）返回空数组', () => {
  assert.deepEqual(parseRecipes('# 只有头\n'), [])
  assert.deepEqual(parseRecipes(''), [])
  assert.deepEqual(parseRecipes(undefined), [])
})

// ---------- 读 ----------

test('readRecipes：没有文件 / 空 / 只有标题 → null（不打扰空库）', () => {
  assert.equal(readRecipes(root), null, '文件不存在')
  seed('')
  assert.equal(readRecipes(root), null, '空文件')
  seed('# 只有个标题\n')
  assert.equal(readRecipes(root), null, '没配方块')
})

test('readRecipes：正常读取', () => {
  seed(SAMPLE)
  const out = readRecipes(root)
  assert.equal(out.recipes.length, 1)
  assert.ok(out.text.includes('分页'))
  assert.equal(out.truncated, false)
  assert.ok(out.total > 0)
})

test('readRecipes：超上限就截断并自曝原文件路径', () => {
  seed('# 头\n\n## x\n触发：y\n- ' + '一'.repeat(MAX_RECIPE_CHARS) + '\n')
  const out = readRecipes(root)
  assert.equal(out.truncated, true)
  assert.ok(out.text.includes('配方库过长已截断'))
  assert.ok(out.text.includes(recipesPath(root)))
})

// ---------- 分词与覆盖率 ----------

test('tokenize：ASCII 词小写 + CJK 二元组', () => {
  const units = tokenize('Add PageQuery 分页查询')
  assert.ok(units.has('add'))
  assert.ok(units.has('pagequery'))
  assert.ok(units.has('分页'))
  assert.ok(units.has('查询'))
})

test('triggerCoverage：覆盖率=命中单元/触发单元', () => {
  const c = triggerCoverage(tokenize('我要新增一个分页查询接口'), '分页 查询接口')
  // 触发 `分页 查询接口` 的单元 = {分页,查询,询接,接口}，用户文本全覆盖 → matched=4, total=4, coverage=1
  assert.equal(c.matched, 4)
  assert.equal(c.total, 4)
  assert.ok(c.coverage >= MATCH_MIN_COVERAGE, `覆盖率 ${c.coverage} 应过半`)
})

// ---------- 匹配 ----------

test('matchRecipe：同类需求强命中', () => {
  seed(SAMPLE)
  const hit = matchRecipe(root, '帮我新增一个分页查询接口')
  assert.ok(hit, '应命中分页配方')
  assert.equal(hit.recipe.name, 'Spring 分页查询接口')
  assert.ok(hit.matched >= MATCH_MIN_UNITS, '命中单元数需达标')
  assert.ok(hit.coverage >= MATCH_MIN_COVERAGE, '覆盖率需达标')
})

test('matchRecipe：明显不相关不命中（宁漏勿误）', () => {
  seed(SAMPLE)
  assert.equal(matchRecipe(root, '帮我写一个导出 CSV 的功能'), null)
  assert.equal(matchRecipe(root, '优化一下这个查询的性能'), null, '只有一两个重叠字不算')
})

test('matchRecipe：库为空 / 没文件 → null，不抛', () => {
  assert.equal(matchRecipe(root, '新增分页接口'), null, '没文件')
  seed('# 只有标题\n')
  assert.equal(matchRecipe(root, '新增分页接口'), null, '空库')
})

test('matchRecipe：作者拿空串/非字符串不抛', () => {
  seed(SAMPLE)
  assert.equal(matchRecipe(root, ''), null)
  assert.equal(matchRecipe(root, '   '), null)
  assert.equal(matchRecipe(root, undefined), null)
})

// ---------- 命令判定 ----------

test('isRecipesCommand：整句锚定，夹在正文里的不算', () => {
  assert.equal(isRecipesCommand('ponytail recipes'), true)
  assert.equal(isRecipesCommand('ponytail recipe'), true)
  assert.equal(isRecipesCommand('/ponytail recipes'), true)
  assert.equal(isRecipesCommand('ponytail 配方。'), true)
  assert.equal(isRecipesCommand('ponytail 做法'), true)
  assert.equal(isRecipesCommand('用 popper 配方优化一下'), false, '夹在正文里不算')
  assert.equal(isRecipesCommand('ponytail'), false, '裸 ponytail 是切档指令')
  assert.equal(isRecipesCommand('ponytail ultra'), false, '切档指令不是召回')
  assert.equal(isRecipesCommand('ponytail verdicts'), false, '台账指令不是配方召回')
  assert.equal(isRecipesCommand(undefined), false)
})

// ---------- 注入正文 ----------

test('renderRecipeNotice：命中配方时带正文与用法', () => {
  const out = renderRecipeNotice({
    path: recipesPath(root),
    recipe: { name: 'Spring 分页查询接口', block: '## Spring 分页查询接口\n触发：分页\n做法：…' },
  })
  assert.ok(out.includes('命中本项目配方'))
  assert.ok(out.includes('Spring 分页查询接口'))
  assert.ok(out.includes(recipesPath(root)))
  assert.ok(out.includes('顺手更新该配方'), '要教模型对照组事实更新配方')
})

test('renderRecipeNotice：显式列表（库非空）带判断，空库说明怎么建', () => {
  const listed = renderRecipeNotice({ path: recipesPath(root), listText: '# 库\n## 甲\n触发：a' })
  assert.ok(listed.includes('配方库'))
  assert.ok(listed.includes('甲'))

  const missing = renderRecipeNotice({ path: recipesPath(root), missing: true })
  assert.ok(missing.includes('还没有内容'))
  assert.ok(missing.includes('触发'), '空库时告诉模型格式')
  assert.ok(missing.includes('做法'))
  assert.ok(missing.includes('禁区'))
})