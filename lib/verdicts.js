// dsh-spec-ponytail · 项目级裁决台账
//
// 解决的问题：本插件的 review / audit 是**一次性**的。同一个项目里，上次被否掉的
// 简化建议，下次 review 还会被重新提一遍；而"这东西不能砍，因为 X"这条项目事实，
// 只活在当时那次对话里，会话一结束就没了。
//
// 于是把裁决沉淀成项目记忆：`<会话工作目录>/.dsh-ponytail/verdicts.md`，
// 在 review/audit 类回合由 pre-step 自动注入（只注入一次，不按 step 重复计费）。
//
// 与 dsh-spec-forge 的模板库是同一套思路（**召回 → 干活 → 沉淀**），但各存各的：
// 它的禁区管"改代码时的约束"，这里管"简化时的裁决"；去读它的内部格式等于强耦合，
// 而且它的禁区写着"不改动 dsh-spec-forge 的任何文件"。
//
// ponytail: 插件**不解析**这个文件，只整段注入（有字符上限）—— 格式给人看，
// 追加由模型用普通文件工具完成，省掉一套 schema、一套校验和一个工具面。
// 上限：台账越长注入越贵，所以有 MAX_VERDICT_CHARS 截断（截断处明说看原文件）。
// 升级触发：真出现"台账长到 2000 字符还嫌不够"，再改成按小节检索。

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { MODE_DIR } from './store.js'

/** 台账文件名。与档位文件同目录，但**根不同**（见 README 的路径表）。 */
export const VERDICTS_FILE = 'verdicts.md'

/** 注入上限：超过就截断。常驻段已经 500+ token 了，这里不能再无限吃。 */
export const MAX_VERDICT_CHARS = 2000

/** 台账路径。`root` = 会话工作目录（每个项目一份，与档位的机器级路径不是一回事）。 */
export function verdictsPath(root) {
  return join(root, MODE_DIR, VERDICTS_FILE)
}

/**
 * 取会话工作目录。
 *
 * 三跳兜底，顺序来自 spec-forge 已验证的 `resolveCwd` 与 dsh-session 的实际结构：
 * session 的 header 里存 cwd（dsh-session 只校验 header.cwd），拿不到就退回
 * 插件进程的 cwd —— 宁可台账落错地方，也不能因为取不到路径就让本轮挂掉。
 *
 * @param {unknown} agent pre-step payload 里注入的 agent
 * @returns {string} 绝对路径
 */
export function sessionCwdOf(agent) {
  const a = /** @type {any} */ (agent)
  const cwd = a?.session?.header?.cwd ?? a?.session?.cwd ?? a?.cwd
  return typeof cwd === 'string' && cwd.length > 0 ? cwd : process.cwd()
}

/**
 * 读台账。
 * @param {string} root 会话工作目录
 * @param {number} [maxChars] 注入上限
 * @returns {{ text: string, total: number, truncated: boolean } | null} 没有文件（或读不出内容）时返回 null
 */
export function readVerdicts(root, maxChars = MAX_VERDICT_CHARS) {
  let raw
  try {
    raw = readFileSync(verdictsPath(root), 'utf8').replace(/^\uFEFF/, '')
  } catch {
    return null
  }
  const text = raw.trim()
  if (text.length === 0) return null
  const truncated = text.length > maxChars
  return {
    text: truncated ? `${text.slice(0, maxChars)}\n…（台账过长已截断，完整内容见 ${verdictsPath(root)}）` : text,
    total: text.length,
    truncated,
  }
}

// ---------- 触发判定 ----------
//
// 只在"这一轮确实是在做简化/评审"时注入，普通编码回合一个 token 都不花。
// 宁可漏触发（少省一点）也不误触发（每轮白付 token）：所以只认明确的评审词
// （review / audit / 审查 / 评审 / 精简 / 能删 …），不认"优化 / 重构"这类语义模糊、
// 日常高频的词。
const REVIEW_TRIGGER =
  /(?:ponytail[-\s]?(?:review|audit|debt)|\breview\b|\baudit\b|over-?engineer|dead\s?code|\bbloat\b|审查|评审|复盘|精简|简化|能删|该删|可以删|砍掉|过度设计)/i

/**
 * 这条用户消息是不是"在做简化/评审"。
 * @param {string} text
 * @returns {boolean}
 */
export function looksLikeReview(text) {
  return typeof text === 'string' && REVIEW_TRIGGER.test(text)
}

/**
 * 显式召回指令：`ponytail verdicts` / `ponytail 裁决` / `ponytail 台账`。
 * 与切档指令同样是**整句锚定**，避免把正文里的词当成命令。
 * @param {string} text
 * @returns {boolean}
 */
export function isVerdictsCommand(text) {
  return typeof text === 'string' && /^[/@]?ponytail[\s:：]+(?:verdicts?|裁决|台账)[.!。！]?$/i.test(text.trim())
}

/**
 * 生成注入正文。
 * @param {{ path: string, text?: string, truncated?: boolean, missing?: boolean }} args
 * @returns {string}
 */
export function renderVerdictsNotice({ path, text, truncated, missing }) {
  const head = `[ponytail] 本项目的简化裁决台账（${path}）`
  const howto =
    '用法：评审前先读它，**已被否掉的建议不要再提**；评审后把新裁决追加进去，' +
    '沿用文件里的两节结构（`## 不可砍（红线）` 写"什么不能砍 + 原因"，`## 可砍套路（已验证）` 写"模式 → 标准改法"）。'
  if (missing || !text) {
    return `${head}\n\n（还是空的。看到值得记住的裁决就建这个文件写进去，格式：两节 —— 不可砍（红线）/ 可砍套路（已验证），每条一行。）\n\n${howto}`
  }
  return `${head}\n\n${text}${truncated ? '' : ''}\n\n${howto}`
}
