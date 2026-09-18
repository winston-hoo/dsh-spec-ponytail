# dsh-spec-ponytail · 懒惰阶梯

一个 DeepSeek Harness（dsh）插件：把 [Ponytail](https://github.com/DietrichGebert/ponytail) 搬进 dsh，
并借鉴 [dsh-spec-forge](https://github.com/winston-hoo/dsh-spec-forge) 的"做法清单召回"让它记住每个项目怎么干活。

> **包名 `dsh-spec-ponytail`，运行时身份仍是 `ponytail`**：命令（`ponytail lite/full/ultra`、`ponytail recipes`）、
> 技能名（`ponytail-review` 等）、常驻段（`ponytail:ruleset`）与数据目录（`<cwd>/.dsh-ponytail/`）全部保持不变，
> 避免破坏已安装版本与既有文档。只有插件包/仓库名改成了 `dsh-spec-ponytail`。

> **Ponytail 管的是「写多少代码」，spec-forge 管的是「问不问清楚 + 记不记得住」。** 两者互补，互不替代 —— 见 [与 spec-forge 的分工](#与-spec-forge-的分工)。

它给每一轮请求装上一套**懒惰阶梯**：最好的代码是你从没写过的代码。

> 实测于 `@deepseek-ai/dsh` 0.1.2-alpha.4（Windows + Web profile）。dsh 仍是 developer preview，
> 插件已锁定其 API 面（`systemPrompt.section` / `skills.register` / `agent/pre-step`）；升级 dsh 后如失效，先看 CHANGELOG。

---

## 它解决什么

| 痛点 | 这个插件的做法 |
| --- | --- |
| Agent 装个日期选择器要引一个库、写两遍包装 | 阶梯第 4 级：`<input type="date">`，原生就有 |
| 「以后可能要扩展」的抽象没人用 | 阶梯第 1/2 级：先问要不要存在，再问能不能复用 |
| 需求是 10 行，回来是 200 行 | 最短可用 diff + 「skipped: X, add when Y」三行交代 |
| 为了少写代码把校验和安全一起砍了 | 安全底线写死在规则里：信任边界校验、防数据丢失、安全、无障碍**永不在砍的范围内** |
| 刻意走的捷径过一阵就没人记得 | `ponytail:` 注释写明上限与升级触发条件，`ponytail-debt` 可随时收割成台账 |

---

## 三层结构（各管一段，互不重复）

```
① 常驻系统提示段   systemPrompt.section（text 是函数 → 每 step 重新渲染，随档位变化）
   规则集一直在上下文里，且**一次都不用重复发送**

② 切档注入         agent/pre-step（只在用户真的切档那一步注入一次）
   系统提示段在 pre-step 之前就组装完了，不补这一次，切档当步读到的还是旧档位

③ 八个 Skill       skills.register（review / audit / debt / gain / verdicts / recall / help 按需加载）
   完整说明不占常驻 token
```

**为什么不用上游那套每轮推送**：Claude Code 只有 `UserPromptSubmit` 一个注入口，所以上游每轮
把规则集重发一遍；dsh 有常驻段（且每 step 重新 assemble），一次注册就一直在，还能吃到
供应商侧的前缀缓存。这是阶梯第 4 级「原生功能优先」的直接应用。

---

## 档位

| 档位 | 行为 |
| --- | --- |
| **lite** | 按需求做，但用一行点出更懒的替代方案，由你选 |
| **full**（默认） | 阶梯强制执行：标准库与原生优先，最短 diff、最短解释 |
| **ultra** | YAGNI 极端派：删除优先，先把一行版交出来，再在同一段话里质疑其余需求 |
| **off** | 常驻段整段消失，零注入 |

### 怎么切换

dsh 没有斜杠命令面，所以切换就是**发一条独立成句的消息** —— 插件在请求发出前就解析并生效，
不经过模型理解，也不会被模型漏读：

| 你发 | 效果 |
| --- | --- |
| `ponytail lite` / `ponytail full` / `ponytail ultra` | 切档 |
| `ponytail` | 报告当前档位（若已 off，则按默认档位重新启用） |
| `ponytail off` · `stop ponytail` · `normal mode` · `关闭 ponytail` | 关掉 |

判据是**整句锚定**：`ponytail ultra` 是切档，`帮我按 ponytail 的风格改一下` 是普通正文，
`ponytail-review`（技能名）也不会被吞成指令 —— 三种情况都有单测守着。

默认档位解析顺序：**持久化档位 > `PONYTAIL_DEFAULT_MODE` 环境变量 > 插件 `defaultMode` 配置 > `full`**。

**切过的档会记住。** 每次切档都会把档位写进 `<dsh 启动目录>/.dsh-ponytail/mode`（一行档位名，
与 `.dsh-spec-forge/` 同一层），所以：

- **重启不丢档** —— 这也是持久化排在优先级第一的原因；
- **全机一份（重要）**：路径取的是插件进程的 `process.cwd()`，**本机实测 = `<dsh-start-dir>`**
  —— 那是侧栏启动 dsh 的目录，**不是会话工作区**。所以它实际是**跨工作区共享**的：
  在 A 项目切 ultra，B 项目也跟着 ultra。（0.2.0 文档里一度写成"按工作区隔离"，是错的，已更正。）
- **想回到配置默认值**，删掉那个文件即可。

---

## 八个 Skill

| Skill | 做什么 |
| --- | --- |
| `ponytail` | 懒模式本体：完整阶梯、Rules、Output、Intensity、安全底线 |
| `ponytail-review` | 只审「过度设计」：一行一条 `L42: yagni: factory, one product. Inline.`，结尾给 `net: -N lines` |
| `ponytail-audit` | 全仓版的 review，按可删体量排序 |
| `ponytail-debt` | 把全仓 `ponytail:` 注释收成债务台账，标出没有升级触发的那些（会静默腐烂的那批） |
| `ponytail-gain` | 上游 agentic 基准的记分板（明确禁止编造「你这个仓库省了多少」） |
| `ponytail-verdicts` | 项目的简化裁决台账：什么不能砍 + 为什么；评审前读、评审后记 |
| `ponytail-recall` | 需求配方召回：把「这类需求上次怎么做的」（做法 + 禁区）沉淀为配方，同类需求自动召回 |
| `ponytail-help` | 速查卡：档位、技能、怎么切、怎么配默认档 |

---

## 需求配方召回（0.3.0 新增）

让**相似需求快速响应**：把「这类需求上次怎么做的」沉淀成一份三要素配方（触发 / 做法 / 禁区），
下次同类需求由插件**自动召回注入**，实现就从已验证的改法开头，而不是从零推导。

- 配方放 **`<会话工作目录>/.dsh-ponytail/recipes.md`**（每个项目一份，与 `verdicts.md` 同构）：
  ```
  ## Spring 分页查询接口
  触发：分页 查询接口 列表翻页
  做法：
  - 四层：Controller → Service → ServiceImpl → Mapper
  禁区：
  - common/Result.java 是全局契约，别改
  ```
- **自动召回**：一条编码需求若覆盖某配方触发词 ≥2 个单元且 ≥50%（CJK 感知），插件注入该配方。
  只认强命中，普通回合零注入、零 token。
- **显式召回**：`ponytail recipes` 注入整个配方库（空库也会说明格式）。
- **沉淀**：任务收敛时若"这次做法下次可照做"，用普通文件工具往 `recipes.md` 追加一条
  （沿用 `## 名称 + 触发：…` 结构）。见 `ponytail-recall` Skill。

> 与 spec-forge 模板库的分工：它管"把模糊需求锻造成规格"（含澄清/分级/提炼全套）；
> 这里只做一件事——命中既有做法清单就复用，省掉重新推导。两者数据目录各自独立，互不强耦合。

---

## 成本（`npm run token-audit` 实测）

| 项 | 字符 | 粗估 token |
| --- | --- | --- |
| 常驻段 · full | 2103 | ≈ 526 |
| 常驻段 · ultra | 2143 | ≈ 536 |
| 常驻段 · off | 0 | **0** |
| 切档注入（只在切档那一步，一次） | 2203 | ≈ 551 |
| 报告档位注入 | 79 | ≈ 20 |

**诚实边界**：526 token/step 是**每个 step** 的固定税，比 spec-forge 的 489（整段）还大一点。
它与 spec-forge 的常驻段并存，两者合计约 1000 token/step。三点缓解：

1. 常驻段进的是**系统提示前缀**，供应商侧通常有前缀缓存，实际计费远低于此；
2. `off` 档下常驻段整段消失，是真正的 0；
3. 阶梯里「输出最多三行」这条，省下的是**回答侧**的 token —— 上游实测同一批任务 tokens −22%。

觉得太贵就 `ponytail lite` 或 `/ponytail off`；要改规则集文本，见 `lib/ruleset.js`（上限由
`tests/ruleset.test.js` 守着，超 2200 字符直接测试失败）。

---

## 安装

**前置**：dsh 可用、Node 22+。

```bash
dsh plugin --profile web add github:winston-hoo/dsh-spec-ponytail
dsh web   # 必须重启，插件才会组合进插件树
```

本地源码调试（`--patch` 加载，注意 Windows 要 `file:///` 形式）：

```bash
node apps/cli/lib/bin.js --profile headless \
  --patch D:/<plugin-src>/dsh-spec-ponytail/dev/ponytail.patch.yml "你的任务"
```

验证装上了（`--dump-config` 只合成插件树、不启动服务，是排障第一招）：

```powershell
pnpm dsh --profile web --dump-config | Select-String ponytail
```

出现 `# == dsh-spec-ponytail` 段即成功。

## 快速验收

1. 随便提个编程需求 → 全程不提「ponytail」也能看到阶梯生效：更短的 diff、`skipped: …` 三行交代
2. 发 `ponytail ultra` → 当步就收到 `Level → **ultra**`，之后行为更激进
3. 发 `ponytail` → 回一句 `[ponytail] Current level: **full**`（**这句话只可能由本插件的 pre-step 处理器产生**，是最省事的一键验收）—— ✅ 已实测通过
4. 发 `关闭 ponytail` → 常驻段消失（行为回到常规）
5. 让模型写个刻意简化的实现 → 代码里应出现 `# ponytail: <上限>, <升级触发>`
6. 跑 `ponytail-debt` → 上面那个标记被收进台账
7. 切完档看一眼 `<dsh 启动目录>/.dsh-ponytail/mode`（本机 = `<dsh-start-dir>\.dsh-ponytail\mode`）→ 里面就是刚才那个档位名；重启 dsh 后档位不变

### 首次安装时实际观察到的

- `pnpm add` 返回 `layers added: dsh-spec-ponytail / activation: applied`，profile 的
  `dsh.profile.bundles` 里出现 `dsh-spec-ponytail`；
- 该 profile 的 `patchReload: live` —— **skill 目录当场就变**（八个 ponytail 技能出现在会话里，无需重启）；
- 常驻规则集：本会话的系统提示里出现 `PONYTAIL MODE ACTIVE — level: full` 段，措辞与本插件
  `lib/ruleset.js` 一致；已排查 app 包、agent presets、DSH home、其它工程，**全机器没有第二个
  `PONYTAIL MODE ACTIVE` 注入源** —— 这一段只能来自本插件。

> ⚠️ `file:` 安装是**复制一份**到 profile（不是软链）。改了源码要重新刷新才生效：
> 在 profile 目录执行 `pnpm update dsh-spec-ponytail`（或再走一次 `dsh plugin add`）。
> 日常开发用 `dev/ponytail.patch.yml` 走 `--patch` 加载，那条路径才是直接读源码。

## 本地跑测试

```bash
npm test        # node --test，85 条
npm run token-audit
```

本地跑测试需要能解析 `@deepseek-ai/schemastery`（宿主在运行时提供）。仓库里用一条
junction 指向 harness checkout 的 `vendor/schemastery` 即可（`node_modules/` 已 gitignore）：

```powershell
New-Item -ItemType Junction -Path node_modules\@deepseek-ai\schemastery `
  -Target D:\<path>\DSH\deepseek-harness\vendor\schemastery
```

> 沙箱内注意：`node --test` 会 spawn 子进程（管道 stdio 会被拒为 EPERM），逐文件跑即可：
> `node tests/mode.test.js; node tests/ruleset.test.js; node tests/store.test.js; node tests/verdicts.test.js; node tests/plugin.test.js; node tests/recipes.test.js`。

## 与 spec-forge 的分工

| | spec-forge | dsh-spec-ponytail |
| --- | --- | --- |
| 管的阶段 | 需求侧 + 记忆侧 | 实现侧（+ 实现做法召回） |
| 核心机制 | 先 `spec_recall` → 分级（implement/confirm/triage）→ 沉淀模板与禁区 | 常驻懒惰阶梯 + 档位 + 八个 Skill + `ponytail-recall` 配方召回 |
| 产出 | 可执行规格、可复用模板库 | 更短、更少依赖、更好守的代码 |

**两者并存时的一条真实冲突**：spec-forge 的保守默认表写着「默认不加业务校验」，而 ponytail
写着「绝不砍信任边界校验」。口径区分如下：

- spec-forge 那条管的是**没人要的业务规则**（需求没提「校验/唯一/必填」就别自作主张）；
- ponytail 那条管的是**信任边界**（外部输入进系统的地方，校验是安全底线，不在可砍范围）。

两条同时成立：**信任边界照加，业务规则不擅自加。**

## 已知边界

1. **dsh 还是开发者预览版。** 锁定的 API 面是 `systemPrompt.section` / `skills.register` / `agent/pre-step`；升级 dsh 后失效先 `--dump-config`。
2. **档位文件是全机一份**：路径 = 插件进程的 `process.cwd()`，本机实测为 `<dsh-start-dir>`（侧栏启动 dsh 的目录），**不是会话工作区** —— 因此跨工作区共享，同一 dsh 进程里的多个会话也共享一个档位。要真按工作区隔离，得改用 `agent.session.cwd` 并在常驻段渲染时按会话解析（多一次磁盘读或一层缓存）；没做。写入失败（目录不可写）只告警，本轮切档照常生效，只是重启后不保留。
3. **切档只认独立成句的指令。** 夹在长句里的 `ponytail` 一律当正文，不会被吞 —— 这是刻意的取舍（宁可漏切，不可误吞需求）。
4. **常驻段与 SKILL.md 是两处文本**，压缩版 + 完整版。改规则必须两边一起改，否则模型读到的两个版本会打架（spec-forge 0.4.7 的漂移事故就是先例）。`tests/ruleset.test.js` 守着压缩版的七级阶梯与安全底线不丢项，但守不住措辞分叉。
5. **子代理继承的是常驻段**（全局作用域段对子代理一并生效），**不是**上游那种专门注入。0.2.0 已派真实子代理实测：它自己的系统提示里确实带该段，档位也对 —— 所以那个 `PONYTAIL_SUBAGENT_MATCHER` 在我们的机制下没有存在必要（阶梯第 1 级）。
6. **`ponytail-gain` 的数字是上游基准**，不是本仓库实测；该 Skill 明确禁止把基准说成「你这个仓库省了多少」。
7. **插件与宿主同进程同权限**：只读自己的 `skills/` 目录、不联网、不执行 shell、不读写你的项目文件。源码公开，装前可自行审查。

## 卸载

```bash
dsh plugin --profile web remove dsh-spec-ponytail
# 若声明了 dsh.bundle.patch，还需清理 profile 的 cordis.patch.yml 对应行
dsh web   # 重启生效
```

卸载会移除插件与常驻段；`<dsh 启动目录>/.dsh-ponytail/mode` 与各项目
`<会话工作目录>/.dsh-ponytail/`（verdicts / recipes）是你自己的记忆文件，留着不影响、删了干净。

---

## 致谢与许可

本插件是 [Ponytail](https://github.com/DietrichGebert/ponytail) 的 DeepSeek Harness 插件化改造，遵循上游的 MIT 开源协议：

- **上游**：[Ponytail](https://github.com/DietrichGebert/ponytail)，Copyright (c) 2026 DietrichGebert，MIT。
- 规则文本与六个 Skill（`ponytail` / `-review` / `-audit` / `-debt` / `-gain` / `-help`）移植自上游；
  逐项差异见 [`NOTICE`](NOTICE)。`ponytail-verdicts` / `ponytail-recall` 为本插件自有能力，未移植。
- **本插件自身**：MIT，见 [`LICENSE`](LICENSE)；MIT 许可文本随 [LICENSE](LICENSE) 一并保留。
- 使用/再分发时请保留上游与本插件的版权声明及许可文本（MIT 要求）。

## 更多文档

- [`CHANGELOG.md`](CHANGELOG.md) —— 逐版本变更记录
- [`docs/design.md`](docs/design.md) —— 三层注入契约、档位模型、改动规则集时要同步的四处
- `lib/ruleset.js` —— 模型看到的**全部**规则文本（唯一事实来源）
