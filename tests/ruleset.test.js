import assert from 'node:assert/strict'
import test from 'node:test'

import { SECTION_NAME, SECTION_ORDER, renderRuleset, renderSwitchNotice } from '../lib/ruleset.js'

const LEVELS = ['lite', 'full', 'ultra']

test('renderRuleset：off 与非法档位返回空串（dsh 会丢弃空段，零 token）', () => {
  for (const mode of ['off', undefined, null, '', 'FAST', 42]) {
    assert.equal(renderRuleset(mode), '')
  }
})

test('renderRuleset：三个档位都带自己的一行，且逐级说明不同', () => {
  const lines = LEVELS.map((mode) => renderRuleset(mode).split('\n').at(-1))
  assert.equal(new Set(lines).size, 3, '三个档位的强度说明必须互不相同')
  for (const [index, mode] of LEVELS.entries()) {
    const text = renderRuleset(mode)
    assert.ok(text.startsWith(`PONYTAIL MODE ACTIVE — level: ${mode}`), `${mode} 首行要报档位`)
    assert.ok(text.includes(lines[index]), `${mode} 要包含自己的强度说明`)
  }
})

test('renderRuleset：七级阶梯一级不少', () => {
  const text = renderRuleset('full')
  const rungs = [
    'Does this need to exist at all?',
    'Already in this codebase?',
    'Standard library does it?',
    'Native platform feature covers it?',
    'Already-installed dependency solves it?',
    'Can it be one line?',
    'the minimum code that works',
  ]
  for (const rung of rungs) assert.ok(text.includes(rung), `缺了阶梯：${rung}`)
  for (const n of ['1.', '2.', '3.', '4.', '5.', '6.', '7.']) assert.ok(text.includes(`\n${n} `), `缺了序号 ${n}`)
})

test('renderRuleset：安全底线与 ponytail: 标记必须写明', () => {
  const text = renderRuleset('ultra')
  for (const guard of ['trust boundaries', 'data loss', 'security', 'accessibility', 'Understanding the problem']) {
    assert.ok(text.includes(guard), `安全底线缺了：${guard}`)
  }
  assert.ok(text.includes('`ponytail:`'), '必须要求用 ponytail: 注释标记刻意简化')
  assert.ok(text.includes('ONE runnable check'), '必须要求非平凡逻辑留一个可运行的检查')
})

test('renderRuleset：常驻段有体量上限（它每个 step 都计费）', () => {
  for (const mode of LEVELS) {
    const size = renderRuleset(mode).length
    assert.ok(size < 2200, `${mode} 的规则集 ${size} 字符，超出常驻预算`)
    assert.ok(size > 800, `${mode} 的规则集只有 ${size} 字符，规则可能被裁过头`)
  }
})

test('renderSwitchNotice：切档当步要带上新档位的完整规则集', () => {
  const notice = renderSwitchNotice({ kind: 'set', mode: 'ultra', command: 'ponytail ultra' })
  assert.ok(notice.includes('Level → **ultra**'), '要明确回显新档位')
  assert.ok(notice.includes('ponytail ultra'), '要回显用户原话')
  assert.ok(notice.includes(renderRuleset('ultra')), '必须自带规则集：系统提示段在 pre-step 之前就组装完了')
})

test('renderSwitchNotice：关闭与报告两种情形都不重复塞规则集', () => {
  const off = renderSwitchNotice({ kind: 'off', command: 'stop ponytail' })
  assert.ok(off.includes('off'))
  assert.equal(off.includes('## The ladder'), false, '关闭时不该再带阶梯')

  const report = renderSwitchNotice({ kind: 'report', mode: 'lite', command: 'ponytail' })
  assert.ok(report.includes('lite'), '报告要给出当前档位')
  assert.equal(report.includes('## The ladder'), false, '档位没变，常驻段已经带着规则集了')
})

test('段名与 order 稳定：改动会影响与其它常驻段的顺序，必须显式', () => {
  assert.equal(SECTION_NAME, 'ponytail:ruleset')
  assert.equal(SECTION_ORDER, 100)
  // 首位人设是 0、计划策略是 500，规则集夹在中间
  assert.ok(SECTION_ORDER > 0 && SECTION_ORDER < 500)
})
