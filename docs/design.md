# 设计说明

## 一、三层注入契约

| 层 | 挂载点 | 触发频率 | 内容 |
| --- | --- | --- | --- |
| ① 常驻规则集 | `systemPrompt.section({ name: 'ponytail:ruleset', order: 100, text: () => renderRuleset(state.mode) })` | **每个 step**（dsh 每 step 重新 `assemble`） | `lib/ruleset.js` 的压缩版规则集；`off` 档返回空串，被 dsh 丢弃 |
| ② 切档注入 | `ctx.on('agent/pre-step', handler, { global: true })` | **只在用户切档那一步** | `renderSwitchNotice()`：确认语 + **新档位的完整规则集** |
| ③ 八个 Skill | `skills.register({ name, description, content, source, provider })` | 按需（模型加载或用户显式调用） | `skills/*/SKILL.md` 的完整正文 |
| ④ 记忆召回（两级） | `agent/pre-step` 内分支：`form:'verdicts'`（评审回合）+ `form:'recipe'`（配方强命中） | **只在对应回合命中一次** | `<会话工作目录>/.dsh-ponytail/{verdicts,recipes}.md` 的相关段 |

### 为什么 ② 必须自带规则集

`dsh-agent-loop` 的 `preStep()` 顺序是：**先** `systemPrompt.assemble()`（第 499 行），**再** 派发
`agent/pre-step` 瀑布（第 503 行）。也就是说，切档这一 step 的系统提示是用**旧档位**渲染出来的。
只注入一句「已切到 ultra」而不同时带上新规则集，模型这一步读到的仍是旧档位。

### 为什么 ② 只在切档时注入

常驻段已经把规则集放进上下文了，再每轮推一遍纯属重复计费 —— 上游之所以每轮推，是因为
Claude Code 只有 `UserPromptSubmit` 一个注入口。dsh 有常驻段，这是阶梯第 4 级的直接应用。

## 二、档位模型

```
process.cwd()/.dsh-ponytail/mode  >  PONYTAIL_DEFAULT_MODE (env)  >  config.defaultMode  >  'full'
                    ↓ 只决定进程启动时的初始档位
             state.mode（进程内存，用户切档时改写 + 同时写回文件）
                    ↓ 每个 step 被 ① 读取
             renderRuleset(state.mode)
```

- **落盘在 `process.cwd()`**：只存一行档位名 —— **全机一份，跨工作区共享**。
  实测本机 `process.cwd()` = `<dsh-start-dir>`，即**侧栏启动 dsh 的目录**，
  不是会话工作区。（0.2.0 上线当天按"工作区级"写的文档是错的，此处更正。）
  选 `process.cwd()` 而不是 `agent.session.cwd` 的原因很实在：`apply()` 与常驻段渲染
  两处都拿不到 session，只有 cwd 是两边都一致的值。
  **持久化排在优先级第一**，因为它是"用户最后选的那个档"，而 env / config 只在
  「从没切过档」时才有话语权；上游把 env 放最高是因为它的标记文件代表"当前状态"被
  当成临时覆盖，语义不同。
- **上限：做不到按项目隔离**。要做得改用 `agent.session.cwd`，并在常驻段渲染时按会话
  解析（多一次磁盘读，或加一层按 cwd 的缓存）。升级触发：真出现"这个项目要 lite、
  那个项目要 ultra"的抱怨再改。
- **写失败只告警**：目录不可写时本轮切档照常生效，只是重启后不保留 ——
  记不住档位是小事，拖垮本轮是大事。
- **不按会话分桶**：同一进程多个会话共享档位。真出现「两个会话要跑不同档位」，
  再按 `agent.session.id` 分桶。
- **`off` 是 0 成本**：`renderRuleset('off') === ''`，空段在 `renderContextSections` 里被过滤，
  一个 token 都不花。这是「关掉」与「规则里写一句别管我」的区别。

## 三、切档识别的判据

`lib/mode.js` 的 `parseSwitch()` 用**整句锚定正则**，不调模型：

| 输入 | 判定 |
| --- | --- |
| `ponytail` / `/ponytail` / `@ponytail` | report（只报告，不改档） |
| `ponytail ultra` / `/ponytail: lite` / `PONYTAIL FULL` | set |
| `ponytail off` / `stop ponytail` / `normal mode` / `普通模式` / `关闭 ponytail` | off |
| `ponytail-review`（技能名） | 不是指令 |
| `帮我按 ponytail 的风格改一下这个函数` | 不是指令 |
| 超过 40 字符的任何文本 | 不是指令 |

取舍：**宁可漏切，不可误吞需求**。真需求被当成指令吞掉，用户会莫名其妙地失去一次提问；
切档没生效，用户再说一遍就行。升级路径写在 `lib/mode.js` 顶部的 `ponytail:` 注释里。

## 四、改规则集时要同步的四处

规则文本是**两处存放**（压缩版 + 完整版），改一处漏一处就是「模型读到两个自相矛盾的版本」
（spec-forge 0.4.7 的 SKILL.md 漂移事故）：

| # | 位置 | 说明 |
| --- | --- | --- |
| 1 | `lib/ruleset.js` → `renderRuleset()` | 常驻压缩版：七级阶梯、Rules、安全底线、Output、档位行 |
| 2 | `lib/ruleset.js` → `LEVEL_LINE` | 三个档位的强度说明，与 SKILL.md 的 Intensity 表必须同口径 |
| 3 | `skills/ponytail/SKILL.md` | 完整版（含例子、Boundaries、切档表） |
| 4 | `README.md` + `skills/ponytail-help/SKILL.md` | 用户可见的档位说明与切换方式 |

护栏：`tests/ruleset.test.js` 守着压缩版的**结构不丢项**（七级阶梯齐全、安全底线齐全、
`ponytail:` 标记要求还在、体量不超 2200 字符），但它守不住**措辞分叉** —— 那条只能靠人。

## 五、与 spec-forge 并存

两个插件互不调用、互不依赖，唯一的交互是都往系统提示里写一段。已核对的冲突点：

| 冲突 | 裁决 |
| --- | --- |
| spec-forge「默认不加业务校验」 vs ponytail「绝不砍信任边界校验」 | 两回事：前者管**没人要的业务规则**，后者管**外部输入进系统的地方**。结论：信任边界照加，业务规则不擅自加 |
| spec-forge 要求「改完先报告再沉淀」 vs ponytail 要求「输出最多三行」 | spec-forge 的流程性输出属于「用户明确要求的解释」，不适用三行限制 |
| 两段常驻提示的 token 叠加 | 约 1000 token/step；用 `ponytail lite`/`off` 或调 spec-forge 配置各自收敛 |

## 六、排障

| 现象 | 先看 |
| --- | --- |
| 插件没生效 | `pnpm dsh --profile web --dump-config \| Select-String ponytail`，确认 `# == dsh-ponytail` 段在 |
| 规则集没进上下文 | `ctx.get('systemPrompt')` 是否拿到服务 → 加载日志里有「未发现 systemPrompt 服务」告警就是没拿到 |
| 八个 Skill 不见 | `ctx.get('skills')` 是否拿到服务；日志里 `Skill x/8` 的数字 |
| 切档没反应 | 消息是否**独立成句**；`defaultMode` 是否被 profile patch 里的 `off` 覆盖 |
| 切档当步没生效 | 看注入正文是否含 `## The ladder`；不含就是 `renderSwitchNotice` 走错分支 |

## 七、需求配方召回（做法清单）

spec-forge 的模板库管"需求侧 + 沉淀复用"，但它带全套 clarify/triage/distill。本插件只要
**"同类需求直接照上次做法做"那一段**，于是砍到只有「触发 / 做法 / 禁区」三要素，
不带澄清清单与提示词模板。

- **文件**：`<会话工作目录>/.dsh-ponytail/recipes.md`（与 verdicts 同构）。按工作区、不跨项目共享。

### 匹配策略（轻量，零依赖）

`lib/recipes.js` 不搬 spec-forge 的 `fingerprint.js`（CJK 切词 + 技术词表 + 加权），
只用**邻域二元组覆盖率**：

1. `tokenize(text)`：ASCII 词（小写）+ 每个 CJK 连续段的相邻二元组。
2. 对每条配方的 `触发：` 行算覆盖率 = 用户命中的单元数 / 触发词单元数。
3. 门槛：命中单元数 ≥2 **且** 覆盖率 ≥0.5 —— 二者都满足才算命中，**宁漏勿误**。

只凭 ≤2 个短语重叠就召回，会误注入"用户没要"的正文；所以阈值设在明显同类之上。

### 注入时机与幂等

在 `agent/pre-step` 里跑，先切档分支、再配方、再台账。复用 verdicts 的同一套 `claimOnce`（
按 `${turn}:${digest}:${form}`），同一轮同一句只注入一次；会话回放也不重发。命中条件不满足
（库空 / 阈值不到）就**零注入** —— 召回不该花的 token 一分不花。

### 沉淀

任务收敛时，若"这次做法下次可照做"，用普通文件工具给 `recipes.md` 追加一条（`## 名称` +
`触发：` + `做法：` + `禁区：`）。配方正文插件不逐行校验、整块原样注入 —— 与 verdicts
"格式给人看、追加靠模型"同一口径，省 schema 与一个工具面。
