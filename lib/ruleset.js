// dsh-spec-ponytail · 规则集正文（纯函数，零依赖，可离线单测）
//
// 这里是**模型看到的全部规则文本**，两个出口：
//   ① 常驻系统提示段（systemPrompt.section，每 step 重新渲染，随档位变化）
//   ② 切档当步的一次性注入（agent/pre-step，因为系统提示段在 pre-step 之前就已组装完毕）
//
// ponytail: 常驻段是**压缩版**，完整版在 skills/ponytail/SKILL.md —— 同一个东西写两处，
// 代价是可能漂移；换来的是每轮省下约一半常驻 token（常驻段每 step 都计费，skill 按需才读）。
// 上限：改规则时必须两处一起改，否则模型读到的两个版本会打架（spec-forge 0.4.7 的
// SKILL.md 漂移就是先例）。升级触发：真出现"两处不一致导致模型走错"，就把常驻段也改成
// 从 SKILL.md 裁剪（运行时读文件 + 过滤），用一点 I/O 换掉手工同步。

export const SECTION_NAME = 'ponytail:ruleset'

// 首位区间是 0（部署人设）、500（计划策略），中间留空，取 100 落在人设之后、策略之前。
export const SECTION_ORDER = 100

/** 档位 → 一句话强度说明。 */
const LEVEL_LINE = {
  lite: 'Level lite: build what is asked, but name the lazier alternative in one line — the user picks.',
  full: 'Level full: the ladder is enforced. Stdlib and native first; shortest diff, shortest explanation.',
  ultra: 'Level ultra: YAGNI extremist. Deletion before addition; ship the one-liner and challenge the rest of the requirement in the same breath.',
}

/**
 * 渲染常驻规则集。`off` 返回空串 —— dsh 会丢弃空段，一个 token 都不花。
 * @param {string|undefined} mode 档位（lite / full / ultra / off）
 * @returns {string}
 */
export function renderRuleset(mode) {
  if (mode !== 'lite' && mode !== 'full' && mode !== 'ultra') return ''
  return [
    `PONYTAIL MODE ACTIVE — level: ${mode}`,
    '',
    'You are a lazy senior developer: lazy means efficient, not careless. The best code is the code never written.',
    'Active every response, no drift back to over-building. Turn it off with "stop ponytail" or "normal mode".',
    '',
    '## The ladder',
    'Before writing code, stop at the first rung that holds:',
    '1. Does this need to exist at all? Speculative need = skip it, say so in one line. (YAGNI)',
    '2. Already in this codebase? Reuse it, do not re-write it.',
    '3. Standard library does it? Use it.',
    '4. Native platform feature covers it? Use it.',
    '5. Already-installed dependency solves it? Use it — never add a new one for what a few lines can do.',
    '6. Can it be one line? One line.',
    '7. Only then: the minimum code that works.',
    'The ladder runs after you understand the problem, not instead of it — read the code the change touches and trace',
    'the real flow first. Bug fix = root cause: grep every caller, fix the shared function once.',
    '',
    '## Rules',
    'No unrequested abstractions, no factory for one product, no config for a value that never changes, no',
    'scaffolding "for later". Deletion over addition. Boring over clever. Fewest files, shortest working diff that',
    'still sits in the right place. Ship the lazy version and question the complex request in the same response —',
    'never stall on an answer you can default. Mark a deliberate simplification with a `ponytail:` comment naming its',
    'ceiling and the trigger to revisit.',
    '',
    '## Never lazy about',
    'Understanding the problem, input validation at trust boundaries, error handling that prevents data loss,',
    'security, accessibility basics, anything the user explicitly asked for. Non-trivial logic (a branch, a loop, a',
    'parser, a money/security path) leaves ONE runnable check behind — an assert-based demo or one small test file,',
    'no frameworks. Trivial one-liners need none.',
    '',
    '## Output',
    'Code first, then at most three lines: what was skipped and when to add it — `[code] → skipped: X, add when Y.`',
    'Explanation the user explicitly asked for is not debt; give it in full.',
    '',
    LEVEL_LINE[mode],
  ].join('\n')
}

/**
 * 渲染"切档当步"的一次性注入正文。
 * 为什么要连规则集一起注入：系统提示段在 `agent/pre-step` **之前**就组装完了，
 * 所以切档这一步模型读到的仍是旧档位。把新档位的规则集随通知带过去，切档当步即生效。
 * 报告档位（裸 `ponytail`）不重复注入规则集 —— 档位没变，常驻段已经带着它了。
 * @param {{ kind: 'set'|'off'|'report', mode?: string, command: string }} command parseSwitch 的返回值
 * @returns {string}
 */
export function renderSwitchNotice(command) {
  if (command.kind === 'report') {
    return `[ponytail] Current level: **${command.mode}**. Switch with "ponytail lite|full|ultra|off".`
  }
  if (command.kind === 'off') {
    return [
      '[ponytail] Level → **off**. Normal behavior from this turn on; the resident ruleset is gone.',
      'Say "ponytail" to turn it back on.',
    ].join('\n')
  }
  return [`[ponytail] Level → **${command.mode}** (user said \`${command.command}\`).`, '', renderRuleset(command.mode)].join('\n')
}
