// 常驻成本实测：规则集每 step 都进请求，是唯一一项"每轮都付"的固定税。
//
// ponytail: 只报**字符数 + 粗估 token**，不接真 tokenizer —— 目标是看住量级与回归
// （改规则时数字有没有突然翻倍），不是精确账单。上限：中英混排时估算会偏 ±20%。
// 升级触发：真需要拿它对账成本时，接入 dsh-token-meter 的正式编码器。
// 用法：node scripts/token-audit.js

import { LEVELS } from '../lib/mode.js'
import { renderRuleset, renderSwitchNotice } from '../lib/ruleset.js'

/** 粗估 token：英文约 4 字符/token，中文约 1.5 字符/token。规则集是英文，取 4。 */
const CHARS_PER_TOKEN = 4

function row(label, text) {
  const chars = text.length
  const tokens = Math.ceil(chars / CHARS_PER_TOKEN)
  return { label, chars, tokens, text }
}

const rows = []

for (const mode of LEVELS) {
  rows.push(row(`常驻段 · ${mode}`, renderRuleset(mode)))
}
rows.push(row('常驻段 · off（不注入）', renderRuleset('off')))
rows.push(row('切档注入 · 最多一次（ultra）', renderSwitchNotice({ kind: 'set', mode: 'ultra', command: 'ponytail ultra' })))
rows.push(row('切档注入 · 报告档位', renderSwitchNotice({ kind: 'report', mode: 'full', command: 'ponytail' })))

const pad = Math.max(...rows.map((r) => r.label.length))
console.log('\ndsh-spec-ponytail 常驻成本（粗估，4 字符 ≈ 1 token）\n')
for (const r of rows) {
  console.log(`  ${r.label.padEnd(pad)}  ${String(r.chars).padStart(5)} 字符  ≈ ${String(r.tokens).padStart(4)} token`)
}

const active = rows.find((r) => r.label.endsWith('full'))
const off = rows.find((r) => r.label.includes('off'))
console.log(
  `\n  full 档固定税 ≈ ${active.tokens} token/step；off 档 ≈ ${off.tokens} token/step（常驻段整段消失）。`
)
console.log('  切档注入只在用户真的切档那一步发生一次，其余轮次为 0。\n')

// 回归护栏：常驻段体量翻倍时这里要报错（与 tests/ruleset.test.js 的上限同源）
// 0.5.0：2200 → 2700，容纳新增的两条「交付自检」护栏。
const LIMIT = 2700
const over = LEVELS.filter((mode) => renderRuleset(mode).length > LIMIT)
if (over.length > 0) {
  console.error(`  ✗ 常驻段超出预算：${over.join(', ')} 超过 ${LIMIT} 字符`)
  process.exitCode = 1
}
