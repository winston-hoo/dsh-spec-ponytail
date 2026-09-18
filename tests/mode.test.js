import assert from 'node:assert/strict'
import test from 'node:test'

import { DEFAULT_MODE, isActive, normalizeMode, parseSwitch, resolveMode } from '../lib/mode.js'

test('normalizeMode：只认四个档位，大小写与空格无关', () => {
  for (const mode of ['lite', 'full', 'ultra', 'off']) {
    assert.equal(normalizeMode(mode), mode)
    assert.equal(normalizeMode(`  ${mode.toUpperCase()} `), mode === 'off' ? 'off' : mode)
  }
})

test('normalizeMode：非法输入返回 undefined，不抛错', () => {
  for (const value of ['fast', '', '  ', 'lite mode', 'FULLL', undefined, null, 42, {}, []]) {
    assert.equal(normalizeMode(value), undefined)
  }
})

test('isActive：只有 off 与非法值是"未生效"', () => {
  assert.equal(isActive('lite'), true)
  assert.equal(isActive('full'), true)
  assert.equal(isActive('ultra'), true)
  assert.equal(isActive('off'), false)
  assert.equal(isActive(undefined), false)
})

test('resolveMode：持久化档位 > 环境变量 > 插件配置 > full', () => {
  // 持久化排第一 = "重启不丢档"：用户手动切过档，就该一直算数
  assert.equal(resolveMode({ persisted: 'lite', env: { PONYTAIL_DEFAULT_MODE: 'ultra' }, config: { defaultMode: 'full' } }), 'lite')
  assert.equal(resolveMode({ env: { PONYTAIL_DEFAULT_MODE: 'ultra' }, config: { defaultMode: 'lite' } }), 'ultra')
  assert.equal(resolveMode({ config: { defaultMode: 'lite' } }), 'lite')
  assert.equal(resolveMode({}), DEFAULT_MODE)
  assert.equal(resolveMode(), DEFAULT_MODE)
  assert.equal(resolveMode({ env: {}, config: {} }), DEFAULT_MODE)
})

test('resolveMode：坏值逐级回退，不把脏数据当档位用', () => {
  assert.equal(resolveMode({ persisted: 'nope', env: { PONYTAIL_DEFAULT_MODE: 'ultra' } }), 'ultra')
  assert.equal(resolveMode({ persisted: 'nope', env: { PONYTAIL_DEFAULT_MODE: 'nope' }, config: { defaultMode: 'lite' } }), 'lite')
  assert.equal(resolveMode({ persisted: 'nope', env: { PONYTAIL_DEFAULT_MODE: 'nope' }, config: { defaultMode: 'nope' } }), DEFAULT_MODE)
  // 持久化的 off 是合法档位，必须生效（关掉后重启仍然关着）
  assert.equal(resolveMode({ persisted: 'off', env: { PONYTAIL_DEFAULT_MODE: 'ultra' } }), 'off')
})

test('parseSwitch：裸 ponytail 只报告档位，不改档', () => {
  for (const text of ['ponytail', '/ponytail', '@ponytail', '  PONYTAIL  ', 'ponytail.']) {
    const command = parseSwitch(text)
    assert.equal(command?.kind, 'report', `${text} 应判为 report`)
    assert.equal(command?.mode, undefined)
  }
})

test('parseSwitch：带档位的写法判为切档', () => {
  const cases = [
    ['ponytail lite', 'lite'],
    ['/ponytail full', 'full'],
    ['@ponytail ultra', 'ultra'],
    ['ponytail off', 'off'],
    ['/ponytail: lite', 'lite'],
    ['ponytail：ultra', 'ultra'],
    ['PONYTAIL ULTRA', 'ultra'],
    ['ponytail ultra!', 'ultra'],
  ]
  for (const [text, mode] of cases) {
    const command = parseSwitch(text)
    assert.equal(command?.kind, 'set', `${text} 应判为 set`)
    assert.equal(command?.mode, mode, `${text} 应切到 ${mode}`)
  }
})

test('parseSwitch：关闭语判为 off', () => {
  for (const text of ['stop ponytail', 'Stop Ponytail', 'normal mode', '普通模式', '关闭 ponytail', '停止ponytail']) {
    const command = parseSwitch(text)
    assert.equal(command?.kind, 'off', `${text} 应判为 off`)
    assert.equal(command?.mode, 'off')
  }
})

test('parseSwitch：技能名绝不能被当成切档指令', () => {
  for (const text of ['ponytail-review', '/ponytail-review', 'ponytail-audit', 'ponytail-debt', 'ponytail-gain', 'ponytail-help']) {
    assert.equal(parseSwitch(text), undefined, `${text} 是技能名，不是切档指令`)
  }
})

test('parseSwitch：夹在正文里的 ponytail 不算指令', () => {
  const texts = [
    '帮我按 ponytail 的风格改一下这个函数',
    '这个需求你能不能 ponytail ultra 一点',
    'ponytail ultra 之后记得把测试也补上，另外这里还有个 bug 要看看是什么原因导致的',
    '请解释一下 ponytail 是什么',
  ]
  for (const text of texts) assert.equal(parseSwitch(text), undefined, `${text} 不该被吞成指令`)
})

test('parseSwitch：空值与非字符串安全返回 undefined', () => {
  for (const value of ['', '   ', '\n', undefined, null, 42, {}, []]) {
    assert.equal(parseSwitch(value), undefined)
  }
})

test('parseSwitch：带 command 原文，供注入正文回显', () => {
  assert.equal(parseSwitch('  ponytail ultra ').command, 'ponytail ultra')
})
