// dsh-spec-ponytail · 档位落盘
//
// ponytail: 只存**一行档位名**，不存 JSON —— 上游用 flag 文件存的就是一个模式名，
// 我们的需求也只是"记住用户最后一次切到哪档"，多存字段属于推测需求。
// 上限：路径由调用方给（实际是 `process.cwd()`），**全机一份、跨工作区共享** ——
// 本机实测那是 `<dsh-start-dir>`（侧栏启动 dsh 的目录），不是会话工作区。
// 升级触发：真出现"这个项目要 lite、那个项目要 ultra"，再把 root 换成 `agent.session.cwd`。
//
// 任何读写失败都返回 null / false，**绝不抛** —— 记不住档位是小事，拖垮本轮是大事。

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { normalizeMode } from './mode.js'

/** 数据目录名 `.dsh-ponytail/`：与档位/台账/配方共用，用户知道去哪找、知道该 gitignore。 */
export const MODE_DIR = '.dsh-ponytail'

/** 档位文件名，内容就是一行档位名。 */
export const MODE_FILE = 'mode'

/** 档位文件路径。`root` 由调用方给（实际是 `process.cwd()`，实测 = dsh 的启动目录 `<dsh-start-dir>`）。 */
export function modePath(root) {
  return join(root, MODE_DIR, MODE_FILE)
}

/**
 * 读持久化档位。
 * @param {string} root 状态目录的根（实际传 `process.cwd()`）
 * @returns {'lite'|'full'|'ultra'|'off'|null} 合法档位，或 null（文件不存在/内容非法/读失败）
 */
export function readPersistedMode(root) {
  try {
    const raw = readFileSync(modePath(root), 'utf8').replace(/^\uFEFF/, '').trim()
    return normalizeMode(raw) ?? null
  } catch {
    return null
  }
}

/**
 * 写持久化档位。
 * @param {string} root 状态目录的根（实际传 `process.cwd()`）
 * @param {string} mode 档位
 * @returns {boolean} 是否写成功（失败只影响"下次重启记住"，不影响本轮切档）
 */
export function writePersistedMode(root, mode) {
  const normalized = normalizeMode(mode)
  if (!normalized) return false
  try {
    mkdirSync(join(root, MODE_DIR), { recursive: true })
    writeFileSync(modePath(root), `${normalized}\n`, 'utf8')
    return true
  } catch {
    return false
  }
}
