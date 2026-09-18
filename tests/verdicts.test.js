import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test, { after, beforeEach } from 'node:test'

import { MODE_DIR } from '../lib/store.js'
import {
  MAX_VERDICT_CHARS,
  VERDICTS_FILE,
  isVerdictsCommand,
  looksLikeReview,
  readVerdicts,
  renderVerdictsNotice,
  sessionCwdOf,
  verdictsPath,
} from '../lib/verdicts.js'

let root
const created = []

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ponytail-verdicts-'))
  created.push(root)
})

after(() => {
  for (const dir of created) rmSync(dir, { recursive: true, force: true })
})

/** 造一份台账 */
function seed(content) {
  mkdirSync(join(root, MODE_DIR), { recursive: true })
  writeFileSync(verdictsPath(root), content, 'utf8')
}

// ---------- 路径 ----------

test('verdictsPath：与档位文件同目录，不同文件', () => {
  assert.equal(verdictsPath('D:\\proj'), join('D:\\proj', MODE_DIR, VERDICTS_FILE))
  assert.equal(VERDICTS_FILE, 'verdicts.md')
})

test('sessionCwdOf：优先 session.header.cwd（dsh-session 只认 header 里的 cwd）', () => {
  assert.equal(sessionCwdOf({ session: { header: { cwd: 'D:\\proj' } } }), 'D:\\proj')
  assert.equal(sessionCwdOf({ session: { cwd: 'D:\\via-session' } }), 'D:\\via-session')
  assert.equal(sessionCwdOf({ cwd: 'D:\\via-agent' }), 'D:\\via-agent')
})

test('sessionCwdOf：拿不到就退回进程 cwd，绝不返回空值', () => {
  assert.equal(sessionCwdOf(undefined), process.cwd())
  assert.equal(sessionCwdOf({}), process.cwd())
  assert.equal(sessionCwdOf({ session: { header: { cwd: '' } } }), process.cwd())
  assert.equal(sessionCwdOf({ session: { header: { cwd: 42 } } }), process.cwd())
})

// ---------- 读 ----------

test('readVerdicts：没有文件 / 空文件 / 只有空白 → null（不注入空台账）', () => {
  assert.equal(readVerdicts(root), null, '文件不存在')
  seed('')
  assert.equal(readVerdicts(root), null, '空文件')
  seed('   \n\n  \n')
  assert.equal(readVerdicts(root), null, '只有空白')
})

test('readVerdicts：正常读取，去掉 BOM 与首尾空白', () => {
  seed('\uFEFF# 台账\n\n## 不可砍（红线）\n- wrapper — 原因：e2e 注入用\n')
  const out = readVerdicts(root)
  assert.ok(out.text.startsWith('# 台账'))
  assert.ok(out.text.includes('e2e 注入用'))
  assert.equal(out.truncated, false)
  assert.ok(out.total > 0)
})

test('readVerdicts：超上限就截断，并明说完整内容在哪', () => {
  seed('# 台账\n' + '- 一条很长的裁决'.repeat(400) + '\n')
  const out = readVerdicts(root)
  assert.equal(out.truncated, true)
  assert.ok(out.text.length < out.total, '截断后必须比原文短')
  assert.ok(out.text.includes('台账过长已截断'), '截断必须自曝，否则模型以为看到的就是全部')
  assert.ok(out.text.includes(verdictsPath(root)), '要给出原文件路径')
  assert.ok(out.text.length <= MAX_VERDICT_CHARS + 120, '截断后的正文不能远超上限')
})

test('readVerdicts：路径上是目录时返回 null，不抛', () => {
  mkdirSync(verdictsPath(root), { recursive: true })
  assert.equal(readVerdicts(root), null)
})

// ---------- 触发判定 ----------

test('looksLikeReview：评审语义命中（中英文都要）', () => {
  for (const text of [
    'ponytail-review 一下这个 diff',
    '帮我 review 这个改动',
    'review this diff please',
    'code review',
    'is this over-engineered?',
    'find dead code',
    '全仓审计一下，看哪里能删',
    '这模块是不是过度设计了',
    '评审一下我的改动',
    '看看哪些能删',
  ]) {
    assert.equal(looksLikeReview(text), true, `应命中: ${text}`)
  }
})

test('looksLikeReview：普通编码需求不命中（不能每轮白付 token）', () => {
  for (const text of [
    '加一个登录接口',
    '优化一下这个查询的性能',
    '重构一下这个模块的结构',
    '写个导出 CSV 的功能',
    '把这段文案改一下',
    '这个 bug 怎么修',
    '',
  ]) {
    assert.equal(looksLikeReview(text), false, `不该命中: ${text}`)
  }
  assert.equal(looksLikeReview(undefined), false)
  assert.equal(looksLikeReview(42), false)
})

test('isVerdictsCommand：整句锚定，夹在正文里的不算', () => {
  assert.equal(isVerdictsCommand('ponytail verdicts'), true)
  assert.equal(isVerdictsCommand('ponytail verdict'), true)
  assert.equal(isVerdictsCommand('/ponytail verdicts'), true)
  assert.equal(isVerdictsCommand('ponytail 裁决'), true)
  assert.equal(isVerdictsCommand('ponytail 台账。'), true)
  assert.equal(isVerdictsCommand('ponytail verdicts 是什么'), false)
  assert.equal(isVerdictsCommand('ponytail verdicts 帮我看看'), false)
  assert.equal(isVerdictsCommand('ponytail'), false, '裸 ponytail 是切档指令，不是召回')
  assert.equal(isVerdictsCommand('ponytail ultra'), false)
  assert.equal(isVerdictsCommand(undefined), false)
})

// ---------- 注入正文 ----------

test('renderVerdictsNotice：有台账时带正文，并写明怎么用', () => {
  const out = renderVerdictsNotice({ path: 'D:\\proj\\.dsh-ponytail\\verdicts.md', text: '# 台账\n- 一行' })
  assert.ok(out.includes('D:\\proj\\.dsh-ponytail\\verdicts.md'))
  assert.ok(out.includes('# 台账'))
  assert.ok(out.includes('已被否掉的建议不要再提'), '召回的目的必须说清楚')
  assert.ok(out.includes('追加'), '还要告诉模型怎么沉淀回去')
})

test('renderVerdictsNotice：空台账时说明"还是空的"，显式召回不至于让人以为坏了', () => {
  const out = renderVerdictsNotice({ path: 'p', missing: true })
  assert.ok(out.includes('还是空的'))
  assert.ok(out.includes('不可砍'))
  assert.ok(out.includes('可砍套路'))
})
