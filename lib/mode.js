// dsh-spec-ponytail · 档位解析（纯函数，零依赖，可离线单测）
//
// 档位 = 规则集的强度。上游 ponytail 的档位是 lite / full / ultra，外加 off（关闭）。
// 这里只做三件事：归一化、定默认值、识别"用户在用聊天切档"。
//
// ponytail: 档位识别用**锚定整句正则 + 关键词表**，不调模型 —— 判错的代价只是
// "用户说 ponytail ultra 没生效"，而调模型判档要付出每轮延迟与 token。
// 上限：切换语夹在长句里（"帮我把这个改成 ponytail 风格吧"）**不会**被识别，
// 只认独立成句的切换指令（与上游 Cursor 适配器"发一条普通消息切档"的口径一致）。
// 升级触发：真实会话里出现"想切档但没切成功"的抱怨，再考虑放宽成子串匹配
// （那时必须连同"别把正文里的 ponytail 当成指令"一起解决，否则会误吞普通需求）。

/** 三个生效档位，顺序即强度递增。 */
export const LEVELS = ['lite', 'full', 'ultra']

/** 关闭档位：不注入任何规则集。 */
export const OFF = 'off'

/** 默认档位（与上游一致）。 */
export const DEFAULT_MODE = 'full'

const MODES = new Set([...LEVELS, OFF])

/** 切换语的字符上限：超过这个长度一定不是"独立成句的切换指令"，而是正文。 */
const MAX_COMMAND_CHARS = 40

/**
 * 归一化档位字符串。
 * @param {unknown} value 任意输入
 * @returns {'lite'|'full'|'ultra'|'off'|undefined} 合法档位，或 undefined
 */
export function normalizeMode(value) {
  if (typeof value !== 'string') return undefined
  const mode = value.trim().toLowerCase()
  return MODES.has(mode) ? mode : undefined
}

/** 该档位是否处于"生效"状态（off 之外的档位）。 */
export function isActive(mode) {
  return normalizeMode(mode) !== undefined && normalizeMode(mode) !== OFF
}

/**
 * 解析本轮生效的档位。
 * 优先级：**持久化档位 > 环境变量 > 插件配置 > full**。
 *
 * 为什么持久化排第一：这是"重启不丢档"的字面语义 —— 用户手动切过档，就该一直算数，
 * 直到他再切一次。（上游把 env 排在最高，因为它的 flag 文件是"当前状态"、
 * 而 env 被视为运维强制开关；我们这里持久化文件承担的就是"当前状态"，所以它赢。）
 *
 * @param {{ persisted?: unknown, env?: Record<string, string|undefined>, config?: { defaultMode?: unknown } }} sources
 * @returns {'lite'|'full'|'ultra'|'off'}
 */
export function resolveMode(sources = {}) {
  return (
    normalizeMode(sources.persisted) ??
    normalizeMode(sources.env?.PONYTAIL_DEFAULT_MODE) ??
    normalizeMode(sources.config?.defaultMode) ??
    DEFAULT_MODE
  )
}

// 整句锚定：`ponytail`、`/ponytail`、`@ponytail`、`ponytail ultra`、`/ponytail: lite`…
// 注意 `ponytail-review` 这类**技能名**必须不被吞掉：尾部只允许标点，不允许 `-review`。
const SET_PATTERN = /^[/@]?ponytail(?:[\s:：]+(lite|full|ultra|off))?[.!。！]?$/i

// 关闭语。`ponytail off` 已由 SET_PATTERN 覆盖，这里只补英文习惯用法与中文说法。
const OFF_PATTERN = /^(?:stop\s+ponytail|normal\s+mode|普通模式|关闭\s*ponytail|停止\s*ponytail)$/i

/**
 * 判断一条用户消息是不是"切档指令"。
 * @param {unknown} text 用户消息原文
 * @returns {{ kind: 'set'|'report'|'off', mode?: string, command: string }|undefined}
 *   `set` 切档；`off` 关闭；`report` 只报告当前档位（裸 `ponytail`，与上游一致）；非指令返回 undefined
 */
export function parseSwitch(text) {
  if (typeof text !== 'string') return undefined
  const command = text.trim()
  if (command.length === 0 || command.length > MAX_COMMAND_CHARS) return undefined
  if (OFF_PATTERN.test(command)) return { kind: 'off', mode: OFF, command }
  const match = SET_PATTERN.exec(command)
  if (!match) return undefined
  const mode = normalizeMode(match[1])
  return mode === undefined ? { kind: 'report', command } : { kind: 'set', mode, command }
}
