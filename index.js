// dsh-spec-ponytail —— 把 ponytail 搬进 DeepSeek Harness
//
// ponytail 的原文（MIT，https://github.com/DietrichGebert/ponytail）：让 agent 像屋里最懒的
// 资深开发那样工作 —— 最好的代码是你从没写过的代码。七级阶梯：
// 要不要存在 → 复用既有 → 标准库 → 原生平台 → 已装依赖 → 一行 → 最小实现。
//
// 本插件把上游的**多宿主 hook 体系**换成了 dsh 的原生面，只保留三层：
//
//   ① 常驻系统提示段（systemPrompt.section，text 是函数 → 每 step 重新渲染，随档位变化）
//      —— 规则集始终在上下文里，且**一次都不用重复发送**（上游每轮用 UserPromptSubmit 推一遍，
//      这里靠平台特性省掉了那份重复计费：阶梯第 4 级「原生功能优先」）。
//   ② 切档注入（agent/pre-step）—— 只在用户**真的切档**那一步注入一次，因为系统提示段在
//      pre-step 之前就已组装完毕，不补这一次，切档当步读到的还是旧档位。其余情形零注入。
//   ③ 八个 Skill（skills.register）—— review / audit / debt / gain / verdicts / recall / help 的完整说明按需加载。
//
// 上游那套「20 个宿主适配 + MCP + 状态栏 + 基准脚本」**一律没搬**：dsh 是唯一宿主（阶梯第 1 级，
// 不做没人要的东西）；状态栏用常驻段第一行的 `PONYTAIL MODE ACTIVE — level: x` 替代。
//
// 依赖 dsh 的服务：systemPrompt / skills 都是**可选**的，用 ctx.get 探测，缺失也能跑
// （缺 systemPrompt 时规则集不注入、缺 skills 时只剩常驻段，两者都不报错）。

import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import Schema from '@deepseek-ai/schemastery'

import { DEFAULT_MODE, LEVELS, OFF, isActive, normalizeMode, parseSwitch, resolveMode } from './lib/mode.js'
import { SECTION_NAME, SECTION_ORDER, renderRuleset, renderSwitchNotice } from './lib/ruleset.js'
import { modePath, readPersistedMode, writePersistedMode } from './lib/store.js'
import {
  isRecipesCommand,
  matchRecipe,
  readRecipes,
  recipesPath,
  renderRecipeNotice,
} from './lib/recipes.js'
import {
  isVerdictsCommand,
  looksLikeReview,
  readVerdicts,
  renderVerdictsNotice,
  sessionCwdOf,
  verdictsPath,
} from './lib/verdicts.js'

const HERE = dirname(fileURLToPath(import.meta.url))

/** 插件身份：注入消息的 `source.plugin`（字段约定同内置插件 dsh-repeat-tool-reminder）。 */
const PLUGIN_ID = 'dsh-spec-ponytail'

export const name = 'ponytail'

// 没有硬依赖：systemPrompt / skills 都按可选探测，缺了也只是少一层能力。
export const inject = []

export const Config = Schema.object({
  defaultMode: Schema.string()
    .default(DEFAULT_MODE)
    .description(
      `默认档位，取值 ${[...LEVELS, OFF].join(' / ')}。off = 不注入任何规则。环境变量 PONYTAIL_DEFAULT_MODE 优先级更高`
    ),
})

// 兼容旧写法：cordis 只认 `Config` 做校验与默认值填充，`schema` 只是别名。
export const schema = Config

/**
 * 七个 Skill：目录名即 dsh 里的 skill 名（必须 kebab-case）。
 * description 面向模型，写清"什么时候该用它"，与上游 frontmatter 的触发语对齐。
 */
const SKILLS = [
  {
    dir: 'ponytail',
    description:
      'The laziest solution that works: YAGNI, standard library and native platform features before custom code, one line before fifty. Use on ANY coding task — writing, adding, refactoring, fixing, reviewing, or choosing a library.',
  },
  {
    dir: 'ponytail-review',
    description:
      "Over-engineering review of the current diff: one line per finding — what to cut and what replaces it, ranked, ending in a net line count. Use for 'review for over-engineering', 'what can we delete', 'is this over-engineered', 'simplify review'.",
  },
  {
    dir: 'ponytail-audit',
    description:
      "Whole-repo over-engineering audit: like ponytail-review but scans the entire codebase and ranks the biggest cut first. One-shot report, applies nothing. Use for 'audit this codebase', 'find bloat', 'what can I delete from this repo'.",
  },
  {
    dir: 'ponytail-debt',
    description:
      "Harvest every `ponytail:` shortcut comment into a debt ledger so a deferred simplification cannot quietly become permanent. Use for 'ponytail debt', 'what did ponytail defer', 'list the shortcuts'.",
  },
  {
    dir: 'ponytail-gain',
    description:
      "Ponytail's measured impact as a scoreboard — less code, less cost, more speed — from the published benchmark medians. One-shot display, never a per-repo number. Use for 'ponytail gain', 'what does ponytail save'.",
  },
  {
    dir: 'ponytail-verdicts',
    description:
      "The project's simplification verdict ledger: what must NOT be cut here and why, plus the cut patterns already accepted. Read it BEFORE any review/audit so a rejected suggestion is never re-proposed; append new verdicts AFTER one. Use for 'ponytail verdicts', 'what did we decide not to cut', '为什么这个不能砍'.",
  },
  {
    dir: 'ponytail-recall',
    description:
      "The project's requirement recipes — a 'how we did this kind of task last time' playbook (approach + red lines) distilled from finished work. Recall one when a new request resembles a stored recipe so implementation restarts from a proven method instead of from scratch; distill a new one when a finished task would be done the same way next time. Use for 'ponytail recipes', 'similar requirements should respond fast', '记一下这类需求怎么做', '沉淀做法'.",
  },
  {
    dir: 'ponytail-help',
    description:
      "Quick-reference card for the ponytail levels, skills, and how to switch level or turn it off. Use for 'ponytail help', 'what ponytail commands', 'how do I use ponytail'.",
  },
]

export function apply(ctx, config) {
  // ---------- 档位状态 ----------
  //
  // 优先级：持久化档位 > PONYTAIL_DEFAULT_MODE > config.defaultMode > full。
  // 持久化文件是 `process.cwd()/.dsh-ponytail/mode`，一行档位名。
  //
  // ponytail: 用文件而不是内存，是为了"重启不丢档"；路径取 `process.cwd()` 而不是
  // 会话工作区，是因为 apply() 与常驻段渲染时都拿不到 session，只有 cwd 是两处一致的。
  //
  // ⚠️ 实测（0.2.0 上线当天）：本机 `process.cwd()` = `<dsh-start-dir>`，
  // 也就是**侧栏启动 dsh 的目录**，不是会话工作区、更不是当前项目。所以这个文件是
  // **全机一份、跨工作区共享**的，不要按"每个项目一份"去描述它。
  // 上限：做不到按工作区隔离（要做得改用 agent.session.cwd，并在常驻段渲染时按会话
  // 解析 —— 多一次磁盘读或一层缓存）。升级触发：真出现"这个项目要 lite、那个项目要 ultra"
  // 的抱怨，再照上面那条改。
  const root = process.cwd()
  const persisted = readPersistedMode(root)
  const configured = config?.defaultMode
  if (typeof configured === 'string' && normalizeMode(configured) === undefined) {
    ctx.logger?.warn?.(`[ponytail] 配置 defaultMode="${configured}" 不是合法档位，已回退到 ${DEFAULT_MODE}`)
  }
  const state = { mode: resolveMode({ persisted, env: process.env, config }) }

  /** 切档即落盘；写失败只影响"下次重启记住"，本轮照常生效，绝不抛。 */
  const persist = (mode) => {
    if (!writePersistedMode(root, mode)) {
      ctx.logger?.warn?.(
        `[ponytail] 档位 ${mode} 未能写入 ${modePath(root)}：本轮有效，重启后不保留（目录不可写？）`
      )
    }
  }

  // ---------- 第 1 层：常驻规则集 ----------
  //
  // text 传函数而不是字符串：dsh 每个 step 都重新 assemble 系统提示，
  // 于是档位一变，下一 step 的常驻段就跟着变，不需要重发规则集。
  const systemPrompt = ctx.get('systemPrompt')
  if (systemPrompt?.section) {
    systemPrompt.section({
      name: SECTION_NAME,
      order: SECTION_ORDER,
      text: () => renderRuleset(state.mode),
    })
  } else {
    ctx.logger?.warn?.('[ponytail] 未发现 systemPrompt 服务，规则集不注入（Skill 与切档仍可用）')
  }

  // ---------- 第 2 层：pre-step 注入（切档 + 台账召回） ----------
  //
  // dsh 没有 slash command 面，所以切档走"用户发一条独立成句的消息"（上游 Cursor 适配器同款），
  // 由插件在请求发出前**自己**解析并生效，不依赖模型理解、也不依赖模型自觉。
  // 四条安全设计沿用 spec-forge 已验证的范式：判定与执行同源、幂等（同一轮同一句只注入一次）、
  // 任何异常原样放行、按需注入（不该花的 token 一分不花）。
  if (typeof ctx.on === 'function') {
    const injected = new Set()
    const preStep = async (payload, next) => {
      const decision = await next()
      try {
        if (!decision || decision.kind === 'reject') return decision
        payload?.signal?.throwIfAborted?.()
        const claimed = Array.isArray(payload?.messages) ? payload.messages : []
        const entering = Array.isArray(decision.messages) ? decision.messages : []
        const text = messageTextOf(pickUserMessage(claimed.length > 0 ? claimed : entering))
        const digest = shortDigest(text)
        const turn = payload?.turn
        const all = [...claimed, ...entering]

        /** 同一轮同一句、同一种注入只发一次；会话回放（消息已进上下文）时也不重发。 */
        const claimOnce = (form) => {
          const key = `${turn}:${digest}:${form}`
          if (injected.has(key)) return false
          const replayed = all.some(
            (m) =>
              m?.source?.plugin === PLUGIN_ID &&
              m?.source?.form === form &&
              m?.source?.digest === digest &&
              (turn === undefined || m?.source?.turn === turn)
          )
          if (replayed) return false
          injected.add(key)
          return true
        }

        const command = parseSwitch(text)
        if (command) {
          if (!claimOnce('notice')) return decision
          let notice
          if (command.kind === 'report') {
            // 裸 `ponytail`：生效中则报告档位；已 off 则按上游"resume anytime with /ponytail"重新启用
            if (state.mode === OFF) {
              state.mode = normalizeMode(config?.defaultMode) ?? DEFAULT_MODE
              persist(state.mode)
              notice = renderSwitchNotice({ kind: 'set', mode: state.mode, command: command.command })
            } else {
              notice = renderSwitchNotice({ ...command, mode: state.mode })
            }
          } else {
            state.mode = command.kind === 'off' ? OFF : command.mode
            persist(state.mode)
            notice = renderSwitchNotice(command)
          }
          return {
            ...decision,
            messages: [...entering, createNoticeMessage(notice, { digest, turn, mode: state.mode })],
          }
        }

        // ---------- 配方召回 ----------
        //
        // 命中即注入，普通回合零成本：用户需求命不中任何配方就不注入。
        // 显式 `ponytail recipes` 一定注入（库为空时报告"还是空的"）。
        // 放在台账召回之前，二者触发面不同（配方=编码需求，台账=评审），不会抢同一轮。
        if (isActive(state.mode)) {
          const cwd = sessionCwdOf(payload?.agent)
          const explicitRecipes = isRecipesCommand(text)
          const matched = explicitRecipes ? null : matchRecipe(cwd, text)
          if (explicitRecipes || matched) {
            if (!claimOnce('recipe')) return decision
            const lib = explicitRecipes ? readRecipes(cwd) : null
            const recipeNotice = renderRecipeNotice({
              path: recipesPath(cwd),
              recipe: matched ? { name: matched.recipe.name, block: matched.recipe.block } : undefined,
              listText: lib?.text,
              missing: explicitRecipes && !lib,
            })
            return {
              ...decision,
              messages: [
                ...entering,
                createNoticeMessage(recipeNotice, {
                  digest,
                  turn,
                  mode: state.mode,
                  form: 'recipe',
                  summary: matched ? `ponytail recall: ${matched.recipe.name}` : 'ponytail recipes',
                }),
              ],
            }
          }
        }

        // ---------- 台账召回 ----------
        //
        // 只在"这一轮确实在做简化/评审"时注入，普通编码回合零成本。
        // 自动触发**不打扰空台账**（没内容就不注入），显式 `ponytail verdicts` 才报告"还是空的"。
        if (!isActive(state.mode)) return decision
        const explicit = isVerdictsCommand(text)
        if (!explicit && !looksLikeReview(text)) return decision
        const cwd = sessionCwdOf(payload?.agent)
        const ledger = readVerdicts(cwd)
        if (!ledger && !explicit) return decision
        if (!claimOnce('verdicts')) return decision
        const body = renderVerdictsNotice({
          path: verdictsPath(cwd),
          text: ledger?.text,
          truncated: ledger?.truncated,
          missing: !ledger,
        })
        return {
          ...decision,
          messages: [
            ...entering,
            createNoticeMessage(body, {
              digest,
              turn,
              mode: state.mode,
              form: 'verdicts',
              summary: 'ponytail verdicts',
            }),
          ],
        }
      } catch (err) {
        ctx.logger?.warn?.(`[ponytail] pre-step 注入失败，已忽略（本轮不受影响）: ${err.message}`)
        return decision
      }
    }
    // `{ global: true }`：`agent/*` 是作用域过滤事件，Cordis 派发时按监听器 ctx 的 scope 标签筛，
    // 不加这个标记，子代理与部分路径上的 pre-step 会收不到。
    ctx.on('agent/pre-step', preStep, { global: true })
  }

  // ---------- 第 3 层：八个 Skill ----------
  const skills = ctx.get('skills')
  let registered = 0
  if (skills?.register) {
    for (const skill of SKILLS) {
      try {
        const content = readFileSync(join(HERE, 'skills', skill.dir, 'SKILL.md'), 'utf8')
        skills.register({
          name: skill.dir,
          description: skill.description,
          content,
          source: 'runtime',
          provider: PLUGIN_ID,
        })
        registered += 1
      } catch (err) {
        ctx.logger?.warn?.(`[ponytail] Skill ${skill.dir} 注册失败，其余功能不受影响: ${err.message}`)
      }
    }
  } else {
    ctx.logger?.warn?.('[ponytail] 未发现 skills 服务，八个 Skill 不可用（规则集与切档仍可用）')
  }

  ctx.logger?.info?.(
    `[ponytail] 已加载，档位 ${state.mode}（${persisted ? '来自持久化' : '来自配置/环境'}），` +
      `档位文件 ${modePath(root)}，Skill ${registered}/${SKILLS.length}`
  )
}

// ---------- 辅助函数 ----------

/** 取出消息的纯文本（content 可能是字符串、也可能是 [{type:'text',text}] 数组）。 */
function messageTextOf(message) {
  const content = message?.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((part) => (typeof part === 'string' ? part : part?.type === 'text' ? (part.text ?? '') : ''))
    .join('\n')
}

/**
 * 挑出"用户真的敲进来的那句话"。
 * 优先 `source.kind === 'user'`（真实用户输入的标记，内置插件也用它判断）；
 * 拿不到时退回"最后一条非插件注入、且不含 system-reminder 的用户角色消息" ——
 * **必须排除插件注入**（runtime-context / 技能目录 / 政策快照都是 role=user），
 * 否则会把运行时上下文当成用户消息去做切档判定。
 */
function pickUserMessage(messages) {
  const users = messages.filter((m) => m?.role === 'user')
  const real = users.find((m) => m?.source?.kind === 'user')
  if (real) return real
  return users.find((m) => !m?.source?.plugin && !/<system-reminder>/.test(messageTextOf(m))) ?? null
}

function shortDigest(text) {
  return createHash('sha256').update(String(text ?? '').trim()).digest('hex').slice(0, 12)
}

/**
 * 注入消息：与内置插件 `createUserMessage` 同形（稳定 id + 不可变内容）。
 * source 里带 `plugin` / `digest` / `turn`，供幂等判定与会话回放去重。
 */
function createNoticeMessage(text, { digest, turn, mode, form = 'notice', summary }) {
  return Object.freeze({
    id: randomUUID(),
    role: 'user',
    content: Object.freeze([Object.freeze({ type: 'text', text })]),
    source: Object.freeze({
      kind: 'plugin',
      plugin: PLUGIN_ID,
      form,
      digest,
      turn,
      summary: summary ?? `ponytail ${mode}`,
    }),
  })
}
