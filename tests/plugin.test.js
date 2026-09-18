import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test, { after, beforeEach } from 'node:test'

import { Config, apply, inject, name } from '../index.js'
import { SECTION_NAME, SECTION_ORDER } from '../lib/ruleset.js'
import { MODE_DIR, modePath } from '../lib/store.js'

// 插件把档位写到 process.cwd() 下，所以测试必须跑在临时目录里，绝不能污染仓库。
const repoCwd = process.cwd()
let workdir

beforeEach(() => {
  // 真实进程环境里如果设了 PONYTAIL_DEFAULT_MODE，会把"默认档位"的断言带偏。
  delete process.env.PONYTAIL_DEFAULT_MODE
  workdir = mkdtempSync(join(tmpdir(), 'ponytail-plugin-'))
  process.chdir(workdir)
})

after(() => {
  process.chdir(repoCwd)
  rmSync(workdir, { recursive: true, force: true })
})

/** 当前状态目录里落盘的档位（没写过就是 null） */
function persisted() {
  try {
    return readFileSync(modePath(workdir), 'utf8').trim()
  } catch {
    return null
  }
}

/** 假 ctx：只实现插件真正用到的那几件事（get / on / logger）。 */
function boot(config = {}) {
  const sections = []
  const skills = []
  const handlers = new Map()
  const warnings = []
  const ctx = {
    logger: { info() {}, debug() {}, warn: (message) => warnings.push(String(message)) },
    get(service) {
      if (service === 'systemPrompt') {
        return {
          section: (section) => {
            sections.push(section)
            return () => {}
          },
        }
      }
      if (service === 'skills') {
        return {
          register: (skill) => {
            skills.push(skill)
            return () => {}
          },
        }
      }
      return undefined
    },
    on(event, handler, options) {
      handlers.set(event, [...(handlers.get(event) ?? []), { handler, options }])
    },
  }
  apply(ctx, Config(config))
  return { sections, skills, handlers, warnings }
}

function drive(booted, payload, entering = []) {
  const entry = booted.handlers.get('agent/pre-step')?.[0]
  assert.ok(entry, '必须注册 agent/pre-step 处理器')
  return entry.handler(payload, async () => ({ kind: 'enter', messages: entering }))
}

const userMessage = (text, id = 'u1') => ({
  id,
  role: 'user',
  content: [{ type: 'text', text }],
  source: { kind: 'user' },
})

const withText = (text, turn = 1) => ({
  messages: [userMessage(text)],
  turn,
  step: 1,
  signal: { throwIfAborted() {} },
})

/** 取注入正文（最后一条追加进来的消息） */
function injectedText(decision) {
  const last = decision.messages.at(-1)
  return last?.content?.map((part) => part.text ?? '').join('') ?? ''
}

test('插件身份：name 与空注入面', () => {
  assert.equal(name, 'ponytail')
  assert.deepEqual(inject, [], '没有硬依赖：systemPrompt / skills 都是可选探测')
})

test('Config：空对象也要被填满默认值', () => {
  assert.deepEqual(Config({}), { defaultMode: 'full' })
  assert.deepEqual(Config({ defaultMode: 'ultra' }), { defaultMode: 'ultra' })
})

test('常驻段：注册了规则集，text 是函数（档位一变就跟着变）', () => {
  const booted = boot()
  assert.equal(booted.sections.length, 1)
  const [section] = booted.sections
  assert.equal(section.name, SECTION_NAME)
  assert.equal(section.order, SECTION_ORDER)
  assert.equal(typeof section.text, 'function', 'text 必须是函数，否则档位切换不会反映到常驻段')
  assert.ok(section.text().includes('level: full'))
})

test('常驻段：档位由 PONYTAIL_DEFAULT_MODE 决定', () => {
  process.env.PONYTAIL_DEFAULT_MODE = 'ultra'
  const booted = boot({ defaultMode: 'lite' })
  assert.ok(booted.sections[0].text().includes('level: ultra'), '环境变量优先级高于插件配置')
})

test('常驻段：非法配置回退到 full 并告警', () => {
  const booted = boot({ defaultMode: 'lightmode' })
  assert.ok(booted.sections[0].text().includes('level: full'))
  assert.ok(
    booted.warnings.some((w) => w.includes('defaultMode')),
    '坏配置必须留下告警，不能静默'
  )
})

test('切档：用户发 ponytail ultra → 当步注入新档位规则集，且常驻段随之改变', async () => {
  const booted = boot()
  const decision = await drive(booted, withText('ponytail ultra'))
  const text = injectedText(decision)
  assert.ok(text.includes('Level → **ultra**'), '要回显新档位')
  assert.ok(text.includes('## The ladder'), '切档当步必须自带规则集')
  assert.ok(booted.sections[0].text().includes('level: ultra'), '常驻段应从下一 step 起变成 ultra')
})

test('切档：off 之后常驻段渲染为空串（零 token）', async () => {
  const booted = boot()
  await drive(booted, withText('stop ponytail'))
  assert.equal(booted.sections[0].text(), '', 'off 时规则集必须彻底消失')
})

test('切档：裸 ponytail 只报告档位，不改档', async () => {
  const booted = boot()
  const decision = await drive(booted, withText('ponytail'))
  assert.ok(injectedText(decision).includes('Current level: **full**'))
  assert.ok(booted.sections[0].text().includes('level: full'))
})

test('切档：off 之后裸 ponytail 重新启用（回到默认档位）', async () => {
  const booted = boot()
  await drive(booted, withText('ponytail off', 1))
  assert.equal(booted.sections[0].text(), '')
  const decision = await drive(booted, { ...withText('ponytail', 2) })
  assert.ok(injectedText(decision).includes('Level → **full**'))
  assert.ok(booted.sections[0].text().includes('level: full'))
})

test('切档：同一轮同一句只注入一次（多 step 不重复计费）', async () => {
  const booted = boot()
  const first = await drive(booted, withText('ponytail lite'))
  assert.ok(injectedText(first).includes('lite'))
  const second = await drive(booted, withText('ponytail lite'))
  assert.equal(second.messages.length, 0, '第二次不该再注入')
})

test('切档：会话重放（消息已在上下文里）不重复注入', async () => {
  const booted = boot()
  const first = await drive(booted, withText('ponytail ultra'))
  const replayed = first.messages.at(-1)
  const decision = await drive(booted, withText('ponytail ultra'), [replayed])
  assert.equal(decision.messages.length, 1, '只应保留上游 decision 自带的那些消息')
})

test('切档：普通需求不注入（不该花的 token 一分不花）', async () => {
  const booted = boot()
  for (const text of [
    '给 index.vue 加一个 isMainAdmin 开关字段，默认 0',
    '帮我按 ponytail 的风格改一下这个函数',
    'ponytail-review 一下这次改动',
  ]) {
    const decision = await drive(booted, withText(text))
    assert.equal(decision.messages.length, 0, `${text} 不该触发注入`)
  }
})

test('安全：下游 reject 的决策原样返回', async () => {
  const booted = boot()
  const entry = booted.handlers.get('agent/pre-step')[0]
  const rejected = { kind: 'reject' }
  assert.equal(await entry.handler(withText('ponytail ultra'), async () => rejected), rejected)
})

test('安全：结构异常的消息不抛错，原样放行', async () => {
  const booted = boot()
  const weird = { messages: [{ role: 'user', content: null }, { role: 'tool', content: 'x' }], turn: 1, step: 1 }
  const decision = await drive(booted, weird)
  assert.equal(decision.messages.length, 0)
  assert.equal(booted.warnings.length, 0, '不该靠 catch 兜住，压根不该抛')
})

test('安全：signal 已中止时抛错由外层捕获，不影响决策返回', async () => {
  const booted = boot()
  const entry = booted.handlers.get('agent/pre-step')[0]
  const payload = withText('ponytail ultra')
  payload.signal = {
    throwIfAborted() {
      throw new Error('aborted')
    },
  }
  const decision = await entry.handler(payload, async () => ({ kind: 'enter', messages: [] }))
  assert.equal(decision.kind, 'enter')
  assert.ok(
    booted.warnings.some((w) => w.includes('pre-step')),
    '中止要走告警路径'
  )
})

test('切档：pre-step 用 global 标记注册（否则子代理路径收不到）', () => {
  const booted = boot()
  const entry = booted.handlers.get('agent/pre-step')[0]
  assert.equal(entry.options?.global, true)
})

test('Skill：八个全部注册，名字取自目录，内容非空', () => {
  const booted = boot()
  const names = booted.skills.map((skill) => skill.name).sort()
  assert.deepEqual(names, [
    'ponytail',
    'ponytail-audit',
    'ponytail-debt',
    'ponytail-gain',
    'ponytail-help',
    'ponytail-recall',
    'ponytail-review',
    'ponytail-verdicts',
  ])
  for (const skill of booted.skills) {
    assert.ok(skill.description.length > 30, `${skill.name} 的 description 太短，模型看不出什么时候该用`)
    assert.ok(skill.content.startsWith('---'), `${skill.name} 的正文应保留 frontmatter`)
    assert.equal(skill.source, 'runtime')
    assert.equal(skill.provider, 'dsh-spec-ponytail')
  }
})

test('降级：缺 systemPrompt / skills 服务时不抛错，只告警', () => {
  const warnings = []
  const ctx = {
    logger: { info() {}, debug() {}, warn: (m) => warnings.push(String(m)) },
    get: () => undefined,
    on() {},
  }
  assert.doesNotThrow(() => apply(ctx, Config({})))
  assert.equal(warnings.length, 2, '两个可选服务各告警一次')
})

// ---------- 档位持久化（0.2.0） ----------

test('持久化：切档会落盘到 <状态目录>/.dsh-ponytail/mode', async () => {
  const booted = boot()
  assert.equal(persisted(), null, '没切过档之前不该有文件')
  await drive(booted, withText('ponytail ultra'))
  assert.equal(persisted(), 'ultra')
  await drive(booted, withText('关闭 ponytail', 2))
  assert.equal(persisted(), 'off', '关档也要记住：否则重启又冒出来')
})

test('持久化：重启后按文件里的档位启动（这就是"重启不丢档"）', async () => {
  const first = boot()
  await drive(first, withText('ponytail lite'))
  // 模拟重启：同一个状态目录，重新 apply 一次
  const second = boot()
  assert.ok(second.sections[0].text().includes('level: lite'))
})

test('持久化：持久化档位优先于环境变量与插件配置', () => {
  mkdirSync(join(workdir, MODE_DIR), { recursive: true })
  writeFileSync(modePath(workdir), 'ultra\n', 'utf8')
  process.env.PONYTAIL_DEFAULT_MODE = 'lite'
  const booted = boot({ defaultMode: 'full' })
  assert.ok(booted.sections[0].text().includes('level: ultra'), '持久化档位赢')
})

test('持久化：写不进去也不影响本轮切档，只告警', async () => {
  writeFileSync(join(workdir, MODE_DIR), 'blocker', 'utf8') // 让目录位置被文件占住
  const booted = boot()
  const decision = await drive(booted, withText('ponytail ultra'))
  assert.ok(injectedText(decision).includes('ultra'), '本轮照常生效')
  assert.ok(booted.sections[0].text().includes('level: ultra'))
  assert.ok(
    booted.warnings.some((w) => w.includes('未能写入')),
    '写失败必须告警，不能静默'
  )
})

test('持久化：坏档位文件按"没有持久化"处理，回退到配置', () => {
  mkdirSync(join(workdir, MODE_DIR), { recursive: true })
  writeFileSync(modePath(workdir), 'lightmode\n', 'utf8')
  const booted = boot({ defaultMode: 'lite' })
  assert.ok(booted.sections[0].text().includes('level: lite'))
})

// ---------- 需求配方召回（0.3.0，端到端走真实 apply() + pre-step） ----------

import { recipesPath } from '../lib/recipes.js'

/** 在会话工作目录（无 agent 时回落 process.cwd()=workdir）下造一份配方库 */
function seedRecipe(content) {
  mkdirSync(join(workdir, MODE_DIR), { recursive: true })
  writeFileSync(recipesPath(workdir), content, 'utf8')
}

const RECIPE =
  '# dsh-ponytail 需求配方库（本项目）\n' +
  '\n' +
  '## Spring 分页查询接口\n' +
  '触发：分页 查询接口 列表翻页\n' +
  '做法：\n' +
  '- 四层：Controller → Service → ServiceImpl → Mapper\n' +
  '- 分页参数用 pageNum/pageSize\n' +
  '禁区：\n' +
  '- common/Result.java 是全局契约，别改\n'

test('配方召回：编码需求强命中 → 当步注入命中配方正文', async () => {
  seedRecipe(RECIPE)
  const booted = boot()
  const decision = await drive(booted, withText('帮我新增一个分页查询接口'))
  const text = injectedText(decision)
  assert.ok(text.includes('命中本项目配方'), '要回显"命中"')
  assert.ok(text.includes('Spring 分页查询接口'), '带出配方名')
  assert.ok(text.includes('四层'), '带出做法')
  assert.ok(text.includes('Result.java'), '带出禁区')
  assert.equal(decision.messages.at(-1)?.source?.form, 'recipe', '注入消息要打 recipe 标记')
})

test('配方召回：命不中配方 → 零注入（普通回合不花 token）', async () => {
  seedRecipe(RECIPE)
  const booted = boot()
  for (const text of ['帮我写一个导出 CSV 的功能', '优化一下这个查询的性能']) {
    const decision = await drive(booted, withText(text))
    assert.equal(decision.messages.length, 0, `${text} 不该触发配方注入`)
  }
})

test('配方召回：库为空 / 没配方文件 → 零注入，不打扰', async () => {
  const empty = boot()
  assert.equal((await drive(empty, withText('新增分页接口'))).messages.length, 0, '没有配方文件')
  seedRecipe('# 只有个标题\n')
  assert.equal((await drive(empty, withText('新增分页接口'))).messages.length, 0, '空库')
})

test('配方召回：同一轮同一句只注入一次（多 step 不重复计费）', async () => {
  seedRecipe(RECIPE)
  const booted = boot()
  const first = await drive(booted, withText('新增一个分页查询接口'))
  assert.ok(injectedText(first).includes('命中本项目配方'))
  const second = await drive(booted, withText('新增一个分页查询接口'))
  assert.equal(second.messages.length, 0, '同一轮同一句只注入一次')
})

test('配方召回：显式 ponytail recipes 一定注入（空库也会说明格式）', async () => {
  const booted = boot()
  const decision = await drive(booted, withText('ponytail recipes'))
  const text = injectedText(decision)
  assert.ok(text.includes('还没有内容'), '空库要说明格式')
  assert.ok(text.includes('触发'), '教模型建配方格式')
  assert.equal(decision.messages.at(-1)?.source?.form, 'recipe')
})

test('配方召回：整句指令不等于命中——ponytail recipes 不会当普通编码需求去匹配', async () => {
  seedRecipe(RECIPE)
  const booted = boot()
  const decision = await drive(booted, withText('ponytail recipes'))
  const text = injectedText(decision)
  assert.ok(text.includes('配方库'), '走的是显式列表路径')
  assert.ok(text.includes('Spring 分页查询接口'), '带出整段配方')
})
