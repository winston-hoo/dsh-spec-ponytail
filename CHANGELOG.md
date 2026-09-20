# 变更记录

## 0.3.2 — 2026-09-20

**给规则集加两条"永不偷懒"护栏**（钉死一次真实事故的教训：开票催办被实现成"丢 remark + 点击即发"）。

背景：上游 ponytail 的"懒惰"与"先交简化版再质疑需求"激励，会把"文档标可选的参数"和"不可逆/对外的写操作"也一起砍掉。
本次把这两类**不可偷懒项**写死进常驻规则集 `lib/ruleset.js` 与完整版 `skills/ponytail/SKILL.md`：

- **可选 ≠ 可省**：接口字段即使文档标 `optional`，只要当前流程用它就必须传（如 `remark`/`reason`），
  不得因为 schema 允许空值就把唯一业务参数当装饰砍掉。
- **不可逆/对外写操作必须确认**：通知/发送、作废、红冲、重开、金额等发出去收不回、或影响第三方的
  写动作，必须先弹窗确认 + 可填说明，**禁止 `@click` 直连接口**。判据 = "能撤吗？会波及第三方吗？"沾一条就确认。
- 为把新增内容压回常驻段 2200 字符预算，压缩版里的档位强度行与部分措辞同步精简；
  完整版 SKILL.md 的 Intensity 表与常驻段 `LEVEL_LINE` 措辞保持同口径（不漂移）。
- 单测 85 条全过；常驻段体积 lite/full/ultra ≈ 2191–2195，仍低于 2200 上限。

## 0.3.1 — 2026-09-18

**插件包/仓库名更名：`dsh-ponytail` → `dsh-spec-ponytail`**（仓库 `winston-hoo/dsh-spec-ponytail`）。

- 运行身份保持不变：命令（`ponytail lite/full/ultra`、`ponytail recipes`）、技能名（`ponytail-review` 等）、
  常驻段（`ponytail:ruleset`）与数据目录（`<cwd>/.dsh-ponytail/`）均未变，避免破坏既有安装与文档。
- 变更范围：`package.json name`、插件 `PLUGIN_ID`（注入消息 `source.plugin`）、`cordis.patch.yml`/`dev` 补丁的
  加载名、`skill.provider`、安装/卸载命令、README 包名引用。
- 遵循 MIT：README 增补「致谢与许可」，明确上游 `DietrichGebert/ponytail`（MIT）与本插件的许可归属。

## 0.3.0 — 2026-09-18

**给插件加上"需求做法清单召回"，让相似需求快速响应**（保守选型：轻量召回 Skill + 做法清单）。

### 新增：需求配方召回（`ponytail-recall`）

- 新增 `lib/recipes.js`：配方库读写、解析、**轻量 CJK 召回匹配**（ASCII 词 + CJK 二元组覆盖率打分，
  门槛：≥2 个命中单元 + 覆盖率 ≥50%，宁漏勿误）、`ponytail recipes` 命令判定、注入正文渲染。
- 数据文件：`<会话工作目录>/.dsh-ponytail/recipes.md`（每个项目一份，与 `verdicts.md` 同构）。
- **自动召回**：pre-step 里对编码需求做匹配，强命中才注入该配方（一次/轮）；命不中或库为空就零注入。
- **显式召回**：`ponytail recipes` 注入整个配方库（空库说明格式）。
- **沉淀**：任务收敛时过"复用价值"判断（这次做法下次能否照做），值得记就给 `recipes.md` 追加一条
  （`## 名称` + `触发：` + `做法：` + `禁区：` 三节）。
- 新增第 8 个 Skill `skills/ponytail-recall/SKILL.md`（召回上下文 + 沉淀规则 + 与 verdicts 的边界）。
- `index.js`：SKILLS 数组 + pre-step 配方召回分支（复用 verdicts 同一套 claimOnce 幂等与 sessionCwdOf）。
- 测试：新增 `tests/recipes.test.js` 16 条；`tests/plugin.test.js` 改七→八。全量 **85 条全过**。

### 取舍与边界

- **匹配零依赖**：只用邻域二元组覆盖率（ASCII 词 + CJK 二元组），不引入第三方匹配库，足够区分"同类 vs 不相干"。
- **自动召回只在强命中时注入**：目的就是"相似需求快速响应"，普通回合不花 token，README 已写明。
- **配方正文不逐行校验**：只管 `## 名称` 与 `触发：` 行做匹配，做法/禁区整块原样注入 —— 沿用 verdicts
  "格式给人看、追加靠模型"的做法，省 schema 与一个工具面。
- 插件独立运行：不需要配合其它插件；配方与台账各自独立数据目录。

## 0.2.0 — 2026-09-18

**从同生态的另一份移植 [Wenaixi/dsh-ponytail](https://github.com/Wenaixi/dsh-ponytail) 吸收了它比我们强的两点**，
其余保持本插件的取舍不变（常驻段仍是编译进代码的紧凑版，不改成每轮读盘）。

### 新增：档位持久化

- 每次切档把档位写进 `process.cwd()/.dsh-ponytail/mode`（一行档位名）。**重启不丢档**。
- 新增 `lib/store.js`：`readPersistedMode` / `writePersistedMode` / `modePath`。
  容错照抄上游移植版的做法：BOM、首尾空白、非法内容、文件不存在、路径被文件占住
  —— 一律返回 `null`/`false`，**绝不抛**。
- 优先级改为 **持久化档位 > `PONYTAIL_DEFAULT_MODE` > 插件 `defaultMode` > `full`**
  （原先没有第一项）。持久化排第一是"重启不丢档"的字面语义；上游把 env 放最高，
  是因为它的标记文件语义是"临时覆盖"，我们这里文件就是"当前状态"。
- 写失败只告警，本轮切档照常生效（记不住档位是小事，拖垮本轮是大事）。
- **作用域：全机一份、跨工作区共享。** 路径取 `process.cwd()`；**实测本机那是
  `<dsh-start-dir>`（侧栏启动 dsh 的目录），不是会话工作区** ——
  本版最初写的"工作区级、跨工作区不共享"是错的，同日更正（README / design / Skill 已同步）。
  选 cwd 而不是 `agent.session.cwd` 的原因：`apply()` 与常驻段渲染两处都拿不到 session。
  上限：做不到按项目隔离。升级触发：真出现"这个项目要 lite、那个项目要 ultra"。

### 实测：写路径已在线验证（0.2.0 上线当天）

重启后发 `ponytail full`，`<dsh-start-dir>\.dsh-ponytail\mode` 当场变成 `full`
—— 这同时证明了两件事：**新代码已加载**（0.1.0 没有写文件的代码）与**写路径可用**。

顺带踩到的两个坑，都记下来：

1. **pnpm 的 `file:` 依赖不会跟着目录内容重算**：改完源码 `pnpm add` / `pnpm update` 都只回
   `Already up to date`，profile 里的副本仍是旧版。**必须 remove + add 强制重建**。
2. **DSH 自己会提示**：`an already-loaded package changed: only a restart replaces its code`
   —— 副本刷新 ≠ 进程换代码，还得重启一次。这条提示是真的，别忽略。


### 验证：子代理不需要匹配器（因此不写代码）

上游有 `PONYTAIL_SUBAGENT_MATCHER` 正则做子代理匹配。我们的常驻段是**全局作用域段**，
理论上子代理天然继承 —— 0.1.0 里这只是推断。本轮派了一个真实子代理做实测，
让它只报告自己系统提示的内容，回复：

```
FOUND
PONYTAIL MODE ACTIVE — level: full
You are a lazy senior developer: lazy means efficient, not careless. ...
full
```

**结论：确已继承，档位也对。匹配器没有存在必要（阶梯第 1 级：需求不存在就不写代码）。**
这一条从"推断"升级为"观察"。

### 与 Wenaixi 版的取舍对照（为什么没全盘照搬）

| 维度 | Wenaixi 版 | 本插件 | 谁的成本/收益 |
| --- | --- | --- | --- |
| 常驻段来源 | 每次 assemble 同步读 `SKILL.md` 再按档位裁行 | 编译进 `lib/ruleset.js` 的紧凑版 | 它**永不漂移**；我们省 token |
| 常驻成本 | ≈1400 token/step（按 6630 字节 SKILL.md 推算） | **≈526 token/step**（实测） | 我们约 1/2.6 |
| 每 step 磁盘 I/O | 有 | 无 | 我们少一次同步读盘 |
| 档位持久化 | ✅ 用户级 + `/ponytail default` | ✅ `process.cwd()` 级（0.2.0 起，实测即"全机一份"），无 default 子命令 | 它多一个命令面 |
| `review` 独立档 | ✅ | ❌ 刻意不做 | 它更全 |
| 子代理匹配器 | ✅ 正则 | ❌ 实测不需要 | 我们少一个配置面 |
| 分发 | npm + CI + 版本对齐上游 | 本地 `file:` 安装 | 它更适合对外发布 |

刻意**不吸收**的一条：把常驻段改成"每轮读盘同源"。它能把常驻成本推高约 2.6 倍，
换掉的是"两处文本可能分叉"这个已被 `ponytail:` 注释标注、且有结构测试兜底的风险 —— 不划算。
若哪天分叉真的咬到人，再换。

## 0.1.0 — 2026-09-18

**首版。** 把 [Ponytail](https://github.com/DietrichGebert/ponytail)（MIT）移植成 dsh 插件，
独立运行，不依赖其它插件。

### 覆盖了上游的哪些能力

| 上游能力 | 本插件 | 实现方式 |
| --- | --- | --- |
| 七级懒惰阶梯（常驻、每轮生效） | ✅ | `systemPrompt.section`，text 为函数，随档位动态渲染 |
| 档位 lite / full / ultra / off | ✅ | `lib/mode.js` + 进程内 `state.mode`；默认档位 env > config > full（**0.2.0 起改为落盘 + 优先级调整，见上**） |
| 运行时切档 | ✅ | 一条独立成句的消息（dsh 无斜杠命令面），插件在 `agent/pre-step` 前解析并生效 |
| `/ponytail-review` | ✅ | Skill `ponytail-review` |
| `/ponytail-audit` | ✅ | Skill `ponytail-audit` |
| `/ponytail-debt`（`ponytail:` 台账） | ✅ | Skill `ponytail-debt`（只读扫描，不提供工具，省一份常驻工具定义） |
| `/ponytail-gain` | ✅ | Skill `ponytail-gain` |
| `/ponytail-help` | ✅ | Skill `ponytail-help`（宿主相关段落改写为 dsh 口径） |
| 安全底线（信任边界校验/防数据丢失/安全/无障碍/校准旋钮） | ✅ | 写进常驻段与 SKILL.md，且有单测守着不丢项 |
| 「非平凡逻辑留一个可运行检查」 | ✅ | 同上 |
| `ponytail:` 注释约定（上限 + 升级触发） | ✅ | 规则里要求；本插件自身代码也遵守 |
| 子代理继承规则集 | ✅（换了机制） | 常驻段是全局作用域段，子代理一并继承（**0.2.0 已实测**）；**未**移植专门的 subagent hook 与 `PONYTAIL_SUBAGENT_MATCHER` |
| 状态栏显示当前档位 | ✅（换了机制） | 常驻段首行 `PONYTAIL MODE ACTIVE — level: x` |

### 刻意没做的（阶梯第 1 级：不做没人要的东西）

| 没做 | 理由 |
| --- | --- |
| 20 个宿主的适配层 | dsh 是唯一宿主 |
| MCP 服务（`ponytail-mcp`） | 同进程插件严格优于 MCP 往返 |
| `statusLine` 脚本 | dsh 没有这个面；常驻段首行已经能读回档位 |
| 每轮推送规则集 | dsh 有常驻段，重复推送是纯浪费（上游受限于 `UserPromptSubmit` 才这么做） |
| 标记文件持久化档位 | 上游用它跨进程传状态；同进程不需要 |
| `ponytail:` 台账做成工具 | 一个只读扫描用 Skill 表达即可，工具定义要付**每轮**常驻 token |
| 基准/正确性测试脚本 | 与插件能力无关；`ponytail-gain` 直接引用上游公开数据并注明来源 |
| `review` 独立档（上游 `INDEPENDENT_MODES`，非用户可见档位） | 不是 README 里对用户承诺的档位 |

### 相对上游的两处诚实修正

1. **`ponytail-gain` 的数字换成了 agentic 基准**（LOC 46%、tokens 78%、cost 80%、time 73%、
   safety 100%）。上游 SKILL.md 里那份「80–94% less code」是单发基准，上游自己的 README
   已说明它部分是对照组啰嗦造成的假象，并给出了修正版。移植时同步到修正版，并保留
   「绝不编造每仓库节省数字」这条边界。
2. **`ponytail-help` 的宿主相关段落全部改写**：默认档位的配置方式（`PONYTAIL_DEFAULT_MODE`
   / 插件 `defaultMode`）、切档方式、技能调用方式都换成了 dsh 口径，没有照抄 Claude Code 的
   `/plugin`、`/reload-plugins` 等不存在的路径。

### 实测

| 项 | 数字 |
| --- | --- |
| 测试 | 37 条（`lib/mode.js` 11、`lib/ruleset.js` 8、插件接线 18），全绿 |
| 常驻段 · full | 2103 字符 ≈ 526 token/step |
| 常驻段 · ultra | 2143 字符 ≈ 536 token/step |
| 常驻段 · off | **0** |
| 切档注入（一次性） | 2203 字符 ≈ 551 token |
| 报告档位注入 | 79 字符 ≈ 20 token |

### 验证状态（装进 profile 后的实测）

| 层 | 状态 | 证据 |
| --- | --- | --- |
| 插件加载 | ✅ **已观察** | profile `package.json` 的 `dsh.profile.bundles` 出现 `dsh-ponytail`；`pnpm add` 返回 `layers added: dsh-ponytail / activation: applied` |
| ③ 六个 Skill | ✅ **已观察** | 安装后**本会话**的 skill 目录当场变成 7 条（新增 ponytail ×6），无需重启 —— `patchReload: live` |
| ① 常驻规则集 | ✅ **已观察** | 安装后本会话的系统提示里出现 `PONYTAIL MODE ACTIVE — level: full` 段，含本插件 `lib/ruleset.js` 独有的措辞。全机器排查（app 包、presets、DSH home、其它工程）**没有第二个注入源**，所以这段只能来自本插件 |
| ② 切档注入 | ✅ **已观察** | 会话里发一条 `ponytail`，当步就收到本插件注入的 `[ponytail] Current level: **full**. Switch with "ponytail lite\|full\|ultra\|off".` —— 这句话只可能出自 `lib/ruleset.js` 的 `renderSwitchNotice()` report 分支 |

源码级契约核实（本轮完成，逐条对照 dsh 安装产物）：

- `systemPrompt.section()` 支持 `text` 为函数：`dsh-system-prompt/lib/index.js` 第 319 行 `typeof section.text === "function" ? section.text(context) : section.text`
- 每 step 重新 assemble：`dsh-agent-loop/lib/index.js` 第 499 行（在 `agent/pre-step` 派发**之前**，第 503 行）
- `skills.register()` 字段与 kebab 名约束：`dsh-skill/lib/index.js` 第 193、467 行
- `agent/pre-step` payload 形状：`{ messages, turn, step, signal }`，`agent` 由 dsh-scope 注入

仍未闭环：

- **常驻段与 SKILL.md 的措辞分叉**只能靠人守（测试守得住"不丢项"，守不住"改了一处忘另一处"）。
  这是刻意的取舍：换成上游那种"每次 assemble 现读 SKILL.md"能彻底消除分叉，
  但常驻成本会从 ~526 涨到 ~1400 token/step（见 0.2.0 的对比一节）。
- **切档注入在界面上可见**：注入的是 role=user 的插件消息，GUI 会把它渲染在用户那一侧。
  想让它隐身就得换成别的投递方式（系统提示变量之类），本轮没做 —— 可见本身也是一种状态提示。
- **本地跑测试**需要 `@deepseek-ai/schemastery` 可解析；仓库未带 `node_modules`，
  用指向 harness `vendor/schemastery` 的 junction 解决（见 README）。
- 沙箱内 `node --test` 会 spawn 子进程并因管道 stdio 被拒（EPERM）；逐文件跑即可，
  这不是插件问题（已在此环境下验证 37 条全绿）。

### 安装方式（更正）

pnpm 的 `file:` 依赖是**复制**一份进 profile（实测 `ReparsePoint = 0`，不是软链）。
所以改源码后必须刷新安装副本才生效：在 profile 目录 `pnpm update dsh-ponytail`，或再走一次
`dsh plugin add`。日常开发请走 `dev/ponytail.patch.yml` 的 `--patch` 路径（直接读源码）。
