import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test, { after, beforeEach } from 'node:test'

import { MODE_DIR, MODE_FILE, modePath, readPersistedMode, writePersistedMode } from '../lib/store.js'

let root
const created = []

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ponytail-store-'))
  created.push(root)
})

after(() => {
  for (const dir of created) rmSync(dir, { recursive: true, force: true })
})

test('modePath：root 下的 .dsh-ponytail/mode', () => {
  assert.equal(modePath('D:\\ws'), join('D:\\ws', MODE_DIR, MODE_FILE))
  assert.equal(MODE_DIR, '.dsh-ponytail')
})

test('写读往返：四个档位都能原样读回', () => {
  for (const mode of ['lite', 'full', 'ultra', 'off']) {
    assert.equal(writePersistedMode(root, mode), true)
    assert.equal(readPersistedMode(root), mode)
  }
  // 落盘内容就是一行档位名，没有 JSON 包装
  assert.equal(readFileSync(modePath(root), 'utf8'), 'off\n')
})

test('写：目录不存在也能自己建出来', () => {
  const nested = join(root, 'a', 'b')
  assert.equal(writePersistedMode(nested, 'ultra'), true)
  assert.equal(readPersistedMode(nested), 'ultra')
})

test('读：文件不存在 / 内容非法 / 空文件 / 父目录不存在，一律返回 null，不抛', () => {
  assert.equal(readPersistedMode(root), null, '文件不存在')
  mkdirSync(join(root, MODE_DIR), { recursive: true })
  writeFileSync(modePath(root), 'lightmode\n', 'utf8')
  assert.equal(readPersistedMode(root), null, '非法档位')
  writeFileSync(modePath(root), '', 'utf8')
  assert.equal(readPersistedMode(root), null, '空文件')
  assert.equal(readPersistedMode(join(root, '不存在的目录')), null, '父目录不存在')
})

test('读：带 BOM 与首尾空白也能识别（上游移植过来的容错）', () => {
  mkdirSync(join(root, MODE_DIR), { recursive: true })
  writeFileSync(modePath(root), '\uFEFF  ULTRA  \n', 'utf8')
  assert.equal(readPersistedMode(root), 'ultra')
})

test('写：非法档位直接拒写，不产生垃圾文件', () => {
  assert.equal(writePersistedMode(root, 'fast'), false)
  assert.equal(readPersistedMode(root), null)
})

test('写：路径被文件占住时返回 false，不抛', () => {
  // 让 `.dsh-ponytail` 这个位置是一个**文件**，mkdirSync 必然失败
  writeFileSync(join(root, MODE_DIR), 'blocker', 'utf8')
  assert.equal(writePersistedMode(root, 'lite'), false)
})

test('读：路径上是目录而非文件时返回 null，不抛', () => {
  mkdirSync(modePath(root), { recursive: true })
  assert.equal(readPersistedMode(root), null)
})
