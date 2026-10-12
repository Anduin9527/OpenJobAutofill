# OpenJobAutofill 表单自动填写中间件调研

日期：2026-09-28。范围：GitHub 公开仓库、官方文档和关键源码的静态调研；为原生 JavaScript / Manifest V3 的 OpenJobAutofill 改进 Zhiye 与复杂控件操作寻找参考。本次没有运行这些项目、安装依赖或验证真实招聘页面，也没有修改插件功能代码。

**结论：找到了值得参考的通用浏览器执行层，以及较完整的表单扫描和执行生命周期设计；本次没有找到可以直接替换现有代码、且已经证明覆盖 Zhiye/Phoenix 复杂控件的现成中间件。** 最有价值的组合是：参考 Stagehand 新运行层的定位/动作接口，参考 Bitwarden 的分帧生命周期、串行填写和失败分类，保留招聘平台适配层；Automa 提供确定性工作流兜底，Midscene 可作为后续可选的视觉兜底。这个排序是结合当前扩展形态作出的工程判断，不是项目作者的兼容性承诺。

已有 [2026-08-16 调研](./form-autofill-framework-research-2026-08-16.md) 推荐了显式控件适配器。既然 `CONTROL_ADAPTERS` 已在本地落地，本次的增量应是把适配器变成拥有“控件身份、弹层归属、动作、等待和验收”的执行单元，而不只是继续增加识别规则。

## 中国招聘平台候选：哪些真正涉及 Zhiye

### ResumeFiller：适合借鉴字段边界和案例，不适合作为控件中间件

核查分支为 `v2-refactor`，读取到提交 `20e5e335bdd33bd2577aea87a603ce87af870d17`，提交日期 2026-09-15；许可证为 MIT。其 README 明确列出北森的 `zhiye.com` / `form-item--phoenix` 形态。仓库元数据接口的缓存日期与分支提交不一致，此处采用分支提交日期，不用搜索爬取时间或 star 数推断成熟度。[分支提交](https://github.com/JuanHoi1996/ResumeFiller/commit/20e5e335bdd33bd2577aea87a603ce87af870d17) · [README](https://github.com/JuanHoi1996/ResumeFiller/blob/20e5e335bdd33bd2577aea87a603ce87af870d17/README.zh-CN.md) · [LICENSE](https://github.com/JuanHoi1996/ResumeFiller/blob/20e5e335bdd33bd2577aea87a603ce87af870d17/LICENSE)

值得借鉴的是主字段标签与周围上下文分别处理、Scoped Fill 的经历边界，以及中金 `cicc.zhiye.com` 等字段映射案例。更新日志记录了“专业名称被同组 GPA 干扰”“项目职责被项目名称干扰”等问题，和当前插件需要防止的串填很接近。[更新日志](https://github.com/JuanHoi1996/ResumeFiller/blob/20e5e335bdd33bd2577aea87a603ce87af870d17/CHANGELOG.zh-CN.md)

但它的已知问题明确写出复杂自定义下拉不稳定、日期默认不自动填写。源码 `tryFillSingleChoiceDropdown` 会查找全页可见选项，兜底向输入框写值并发 Enter 后返回成功；不能据此认定已解决 Phoenix 弹层提交与读回问题。其测试说明也明确：现有夹具只测关键词识别，不覆盖 DOM 向上定位和作用域选择。[已知问题](https://github.com/JuanHoi1996/ResumeFiller/blob/20e5e335bdd33bd2577aea87a603ce87af870d17/KNOWN_ISSUES.zh-CN.md) · [源码](https://github.com/JuanHoi1996/ResumeFiller/blob/20e5e335bdd33bd2577aea87a603ce87af870d17/content.js) · [测试范围](https://github.com/JuanHoi1996/ResumeFiller/blob/20e5e335bdd33bd2577aea87a603ce87af870d17/tests/README.md)

### 其他国内候选的筛选结果

| 项目 | 核查到的价值 | 不作为主要替换方案的原因 |
| --- | --- | --- |
| [happy-q123/auto-ws](https://github.com/happy-q123/auto-ws) | 已将 domParser、matcher、filler 分文件；filler 有 Element/Ant 控件处理、MutationObserver 等待、同源 iframe 遍历。 | Ant 下拉仍全页找选项、包含匹配后点击即成功；`waitCascade` 只是定时循环，没有检查具体下级选项就绪；未在所读 filler 中发现 Phoenix 专用实现。仓库树未列 LICENSE，GitHub license 元数据为空，因此仅列为设计参考。[filler 源码](https://github.com/happy-q123/auto-ws/blob/master/content/filler.js) · [仓库树](https://api.github.com/repos/happy-q123/auto-ws/git/trees/master?recursive=1) |
| [cloud-oc/resume-bridge](https://github.com/cloud-oc/resume-bridge) | 有独立 ATSProfile、匹配引擎和填写编排器，模块划分可参考。 | 所读 BEISEN_PROFILE 主要是 Ant/Vue 选择器与固定 loadDelay，没有列出 `zhiye.com` 或 Phoenix 专用规则。不能把“支持北森”的 README 宣传当作已经解决目标页面的证据。[ATS 配置](https://github.com/cloud-oc/resume-bridge/blob/main/src/core/engine/atsProfiles.ts) · [编排器](https://github.com/cloud-oc/resume-bridge/blob/main/src/core/engine/fillOrchestrator.ts) |
| [funnyjacy/HelpResume](https://github.com/funnyjacy/HelpResume) | 明确面向北森/Moka 的简历字段匹配。 | FAQ 仍把复杂级联选择器列为手动处理；其模型流程发送简历文本和字段列表，与当前 OpenJobAutofill 仅发送字段目录的边界不同。本轮只核查 README，未深入源码，不用于证明控件能力。[README](https://github.com/funnyjacy/HelpResume#readme) |
| [23aaaa/jobfill](https://github.com/23aaaa/jobfill) | 逐字段点填与焦点定位交互可参考。 | README 的 FAQ 明确当前逐字段操作、自定义下拉手选；一键全填和下拉匹配列在后续计划。不是现成的批量填写中间件。[README](https://github.com/23aaaa/jobfill#readme) |

## 当前 OpenJobAutofill：已有基础与真正的重构切口

以下为 2026-09-28 **本地工作区**静态核查，包含用户已有的未提交改动；不代表远端 main 的相同状态。本轮没有修改插件源码，也没有操作在线简历。入口 `src/content.js` 共 9,695 行，manifest 版本为 1.1.31。

| 观察 | 本地证据 | 对重构的意义 |
| --- | --- | --- |
| 已有站点与控件两个适配表 | `src/content.js:69` 的 SITE_ADAPTERS；`:242` 的 CONTROL_ADAPTERS。Phoenix 日期、单选、autocomplete 和 Moka SD 已存在。 | 不重复把“增加 adapter”当作新方案；重点是让写入生命周期也由适配器承担。 |
| 适配表主要描述识别/读值，写入仍集中分支 | `fillElementSmart`（`:8206`）按站点和类型转发，`tryFillCustomChoiceField`（`:8661`）继续混合 Phoenix、Moka 和通用流程。 | 抽离完整 driver，而不只是搬动选择器常量。 |
| Phoenix 弹层定位依赖全页唯一可见层 | `getVisiblePhoenixSelector`（`:8574`）查找全页 `.common-unmodeled-layer`，多个可见候选时返回 null；日历也用全页唯一面板判断。 | 当前拒绝歧义是有效保护，但尚未建立“该字段打开的弹层”归属；应增加明确归属和打开前后变化证据。 |
| 通用选项查找会扩大到 document | `findVisibleChoiceOptions`（`:8867`）搜索容器后再搜索 document，包含 `li`、`[aria-selected]`、模糊 class；Layui 有部分额外过滤。 | 跨字段撞选项的结构性风险；应按控件关联的 listbox/popup 限定作用域。此路径与已有专用 Phoenix/HotJob 路径需分别处理。 |
| 成功判定不统一 | 通用级联 `:8814` 在只匹配部分层级后仍返回 `ok: true`；通用 combobox 写内部输入框、原生 select 未匹配时仍可返回成功（`:8294` 起）；`applyAutofillPlan` 按 ok 着色（`:7848` 起）。 | 统一“动作已执行”和“目标值已确认”两种状态，避免仅有警告却显示为已填写。 |
| Phoenix 已有校验，不应推倒重来 | `tryFillPhoenixSelector` 会区分进入下级、点击选择图标、确认、读回；普通下拉也做读回。日期已处理年月/完整日期/至今。 | 保留这些能力；提升弹层定位、节点重新获取、远程搜索及读回可信度。搜索框文字和正式选中状态应分开表达。 |
| 等待与测试尚未统一到执行层 | Phoenix 有固定 sleep 和局部轮询；所读 Phoenix/Moka smoke tests 使用 VM 与模拟节点；`src/popup.js:277` 注入目标只有 tabId，扫描器未实现 frame/shadow 树遍历。 | 引入有期限的条件等待和真实浏览器 DOM 夹具；跨 frame/shadow 属于能力边界，尚无证据表明它们导致本次 Zhiye 问题，应后排处理。 |

本地来源：[content.js](../src/content.js) · [popup.js](../src/popup.js) · [manifest.json](../manifest.json) · [Phoenix 选择测试](../tests/phoenix-choice-smoke.mjs) · [Phoenix 日期测试](../tests/phoenix-date-smoke.mjs) · [Moka 条目边界测试](../tests/mokahr-record-boundaries-smoke.mjs)。

以上能证明代码存在这些分支和边界，**不能证明用户目前某个 Zhiye 页面失败的具体原因**。本轮没有目标页面 DOM、交互轨迹或错误日志，也未运行这些测试；不据此报告线上复现或回归通过。

## 五个值得重点比较的项目

| 项目 | 最值得借鉴的部分 | 与现有 MV3 扩展的距离 | 本轮明确的能力边界 |
| --- | --- | --- | --- |
| [Stagehand](https://github.com/browserbase/stagehand) | `Locator`、frame/shadow 定位、动作与读回接口；`observe()` 将语义定位和实际填值分开 | **最新 main 已含 MV3 runtime**，不是只有外部 Playwright 脚本；但扩展包标记 `private`，SDK/JSON-RPC/CDP 是一整套运行时，不能视为独立表单库 | `selectOption` 底层只处理原生 `<select>`；没有据此证明 Phoenix 自定义下拉、级联、日期面板已覆盖。[运行层](https://github.com/browserbase/stagehand/tree/34edfa38d6c33b30b07b4dd813f9c943f8e6689f/packages/extension) · [原生选项执行](https://github.com/browserbase/stagehand/blob/34edfa38d6c33b30b07b4dd813f9c943f8e6689f/packages/extension/dom/locatorScripts/scripts.ts#L367) |
| [Bitwarden autofill](https://github.com/bitwarden/clients/tree/main/apps/browser/src/autofill) | 扫描/写入拆分、字段操作 ID、动态页面监听、每 frame 串行填写、过期目标取消、可重试/终止结果 | 直接工作在浏览器扩展中，运行形态接近；模块与账户、凭据、RxJS、扩展后台等耦合，适合借鉴设计 | 是密码/身份资料填写系统；现有源码不能当成通用招聘表单的下拉、日期与级联组件库。[设计](https://github.com/bitwarden/clients/blob/45eb0013dc413dab78932c418d209d89371febf6/apps/browser/src/autofill/autofill.design.md) · [写入器](https://github.com/bitwarden/clients/blob/45eb0013dc413dab78932c418d209d89371febf6/apps/browser/src/autofill/services/insert-autofill-content.service.ts) |
| [Automa](https://github.com/AutomaApp/automa) | 元素选择器、明确步骤、等待目标出现、frame 路径、录制/工作流思路 | 本身是 MV3 扩展；普通 DOM 执行不要求模型或外部服务，调试模式可走 `chrome.debugger` | Forms block 的 select 分支读 `<option>` 并设 `value`；自定义下拉仍需显式点击步骤，不会自动理解所有组件。[Forms](https://github.com/AutomaApp/automa/blob/a4cbe34a60c92873c48c2470ca8ab1d96c22c7a0/src/utils/handleFormElement.js#L129) · [执行入口](https://github.com/AutomaApp/automa/blob/a4cbe34a60c92873c48c2470ca8ab1d96c22c7a0/src/content/blocksHandler/handlerForms.js) |
| [browser-use](https://github.com/browser-use/browser-use) | 显式枚举选项再选择；ARIA combobox 的 `aria-controls` 弹层关联；独立 Actor API 与交互回归夹具 | Python / CDP 运行时；确定性 Actor 原语不必使用 LLM，Agent/语义寻找需要模型；不能直接导入原生 JS content script | 当前实现包含原生 select、ARIA menu/listbox/combobox、部分 Semantic UI 逻辑，但也有固定等待、直接改 `aria-selected`/class 的分支，不能将返回成功等同站点业务值保存成功。[Actor](https://github.com/browser-use/browser-use/blob/4cbe921673b48a488f5415d9159249afd12a625b/browser_use/actor/README.md) · [下拉实现](https://github.com/browser-use/browser-use/blob/4cbe921673b48a488f5415d9159249afd12a625b/browser_use/browser/watchdogs/default_action_watchdog.py#L2824) |
| [Midscene](https://github.com/web-infra-dev/midscene) | MV3 中的视觉操作、动作与断言分开、规划/定位缓存及失效回退 | 有真实 Chrome 扩展及 `ChromeExtensionProxyPage`，不是必需另开无头浏览器；视觉能力需多模态模型及 `debugger` 权限；Bridge 模式另需 Node 端 | 视觉操作可能覆盖 DOM 难处理的控件，但不是现成 Phoenix adapter；XPath 缓存明确不适用于跨域 iframe 和 closed Shadow DOM，失效时回模型定位。[扩展源码](https://github.com/web-infra-dev/midscene/blob/1ccfa1277914d2d90217e6f4bc8c409278b067bd/packages/web-integration/src/chrome-extension/page.ts) · [缓存边界](https://github.com/web-infra-dev/midscene/blob/1ccfa1277914d2d90217e6f4bc8c409278b067bd/apps/site/docs/en/caching.mdx) |

## Stagehand：当前最值得读的执行层，但必须区分版本

这次审阅的是 `main` 的 `34edfa38…`，其 TypeScript SDK `package.json` 写的是 **4.1.0**。同次 GitHub `/releases/latest` 查询返回的正式 release 却是 **3.7.3，发布时间 2026-08-28，prerelease=false**。因此下述 v4 能力只归属于已审阅的源码快照；不能声称执行 `npm install` 就能获得相同版本，本轮未查询 npm dist-tag 或验证发布包。[SDK 版本](https://github.com/browserbase/stagehand/blob/34edfa38d6c33b30b07b4dd813f9c943f8e6689f/packages/sdk-ts/package.json) · [正式 release](https://github.com/browserbase/stagehand/releases/tag/%40browserbasehq/stagehand%403.7.3)

v4 的 `packages/extension` 是实际 Chrome MV3 扩展：后台 service worker、`all_frames` content script，权限包含 `debugger`、`offscreen`、`scripting` 和 `tabs`。运行层组合 Chrome binding、JSON-RPC 和 application runtime；扩展包自身为 `private: true`。所以它对本项目的参考价值比“外部 Node 脚本”更近，但直接嵌入仍意味着处理后台协议、CDP 会话、构建系统与依赖，而不是复制一个 `fillForm()`。[manifest](https://github.com/browserbase/stagehand/blob/34edfa38d6c33b30b07b4dd813f9c943f8e6689f/packages/extension/manifest.json) · [运行层说明](https://github.com/browserbase/stagehand/blob/34edfa38d6c33b30b07b4dd813f9c943f8e6689f/packages/extension/README.md) · [包依赖](https://github.com/browserbase/stagehand/blob/34edfa38d6c33b30b07b4dd813f9c943f8e6689f/packages/extension/package.json)

适合借鉴三个接口边界：

1. `observe()` 返回定位结果，再由 `locator.fill(value)` 传入值；字段语义识别与实际动作可以独立检查、缓存和替换。源码示例也用这个分离避免将填写值放进定位提示。[README 示例](https://github.com/browserbase/stagehand/blob/34edfa38d6c33b30b07b4dd813f9c943f8e6689f/README.md#L53)
2. 同一个 `Locator` 提供动作和读回：`fill`、`selectOption`、`inputValue`、`isChecked`、`isVisible`。`selectOption` 返回实际选中的值；但调用方仍需定义业务验收，不能把 `click()` 返回当成完成。[Locator 源码](https://github.com/browserbase/stagehand/blob/34edfa38d6c33b30b07b4dd813f9c943f8e6689f/packages/extension/understudy/locator.ts#L580)
3. v4 locator 文档明确说明跨 iframe 多跳与 open/closed Shadow DOM 定位，并注明 iframe/closed root 依赖特权 API，`about:blank`、`data:` 页面有边界。此能力不应被简化成 content script 中的 `document.querySelector`。[v4 locator 文档](https://github.com/browserbase/stagehand/blob/34edfa38d6c33b30b07b4dd813f9c943f8e6689f/packages/docs/v4/reference/locator.mdx#L7)

它的 `fillElementValue` 有原生 date 等输入类型分支，`selectElementOptions` 则明确检查 `HTMLSelectElement`。这是“基础操作覆盖较好”的证据，不是所有自定义日期面板、异步级联、远程搜索下拉均已解决的证据。[基础输入与选择实现](https://github.com/browserbase/stagehand/blob/34edfa38d6c33b30b07b4dd813f9c943f8e6689f/packages/extension/dom/locatorScripts/scripts.ts#L217)

## Bitwarden：比再加识别规则更有价值的是生命周期和执行结果

Bitwarden 把“什么时候监控页面”与“是否/如何填写”分开。监听器有可重复、幂等的 `startMonitoring()` / `stopMonitoring()`；停止时释放 observer 并清空缓存；销毁再处理终止资源。它也考虑了 SPA、frame 消失和 MV3 service worker 重启。这些约束可以缩减为本项目的小型执行会话，无需引入其账户体系。[生命周期设计](https://github.com/bitwarden/clients/blob/45eb0013dc413dab78932c418d209d89371febf6/apps/browser/src/autofill/lifecycle.design.md#L16)

更直接的参考是：**每个 frame 串行完成 collect→fill；执行前重新确认目标 frame 的实时身份；区分可重试结果与终止结果。** “表单还没渲染、没有字段接收值”可以短暂等待；frame 已变、站点不匹配、已成功等不能进入无差别重试。这比统一追加 `sleep` 更能约束动态表单的状态。[填写设计](https://github.com/bitwarden/clients/blob/45eb0013dc413dab78932c418d209d89371febf6/apps/browser/src/autofill/autofill.design.md#L42)

源码以 `opid` 定位扫描后的字段，通过 `fill_by_opid`、`click_on_opid`、`focus_by_opid` 执行动作；`DomQueryService` 单独处理 shadow root 发现、缓存和脱离 DOM 后的清理。它说明“字段引用和监听资源必须有生命周期”，并不证明选择器永久稳定或所有跨域 frame 都能由父文档直接访问。[写入脚本](https://github.com/bitwarden/clients/blob/45eb0013dc413dab78932c418d209d89371febf6/apps/browser/src/autofill/services/insert-autofill-content.service.ts#L20) · [DOM 查询](https://github.com/bitwarden/clients/blob/45eb0013dc413dab78932c418d209d89371febf6/apps/browser/src/autofill/services/dom-query.service.ts#L160)

## Automa 与 browser-use：只借已经解决的问题

Automa 的 `FindElement` 把 CSS/XPath 与 Shadow DOM 查询集中，文档提供 `iframe-selector |> element-selector`、`shadow-selector >> element-selector`。`queryElements` 是有超时的 200ms 轮询；`getDocumentCtx` 读取 `contentDocument`，其本身并不绕过跨域限制。其 manifest 的 `all_frames` 与后台路由是另外一层。因此可以借鉴“选择器解析、等待、frame 路由、表单操作分离”，不能宣称一个 selector helper 解决所有 iframe。[官方选择器文档](https://github.com/AutomaApp/documentation/blob/main/docs/zh/workflow/element-selector.md) · [FindElement](https://github.com/AutomaApp/automa/blob/a4cbe34a60c92873c48c2470ca8ab1d96c22c7a0/src/utils/FindElement.js) · [等待与 frame 查询](https://github.com/AutomaApp/automa/blob/a4cbe34a60c92873c48c2470ca8ab1d96c22c7a0/src/content/handleSelector.js)

Automa 的表单分支主要处理原生输入、contenteditable、checkbox/radio 和 `<select>`。复杂日期、级联地址、远程搜索可以编排为多个步骤，但没有看到自动推导这些步骤的通用控件接口；也不能因支持自定义工作流，就断言已有 Zhiye 能力。[表单代码](https://github.com/AutomaApp/automa/blob/a4cbe34a60c92873c48c2470ca8ab1d96c22c7a0/src/utils/handleFormElement.js)

browser-use 值得重点读 `_handle_aria_combobox_options`：它通过 `aria-controls` 找到关联 listbox，展开后枚举该 listbox 内的选项。这是“把候选选项限制在当前控件的弹层内”的具体参考。与此同时，该实现保留固定 0.5s 等待，某些选择分支直接修改 class/ARIA 后返回成功；本项目应借其弹层关联思路，另行定义站点真实值与显示值的验收，不能原样照搬成功判定。[ARIA 选项发现](https://github.com/browser-use/browser-use/blob/4cbe921673b48a488f5415d9159249afd12a625b/browser_use/browser/watchdogs/default_action_watchdog.py#L3100) · [选项执行](https://github.com/browser-use/browser-use/blob/4cbe921673b48a488f5415d9159249afd12a625b/browser_use/browser/watchdogs/default_action_watchdog.py#L3300)

仓库有 native dropdown 和 ARIA menu 的交互测试，适合参考用例结构；本次未执行测试，也未据此宣称自定义日期、级联、iframe 或 Shadow DOM 端到端覆盖通过。[native 测试](https://github.com/browser-use/browser-use/blob/4cbe921673b48a488f5415d9159249afd12a625b/tests/ci/interactions/test_dropdown_native.py) · [ARIA 测试](https://github.com/browser-use/browser-use/blob/4cbe921673b48a488f5415d9159249afd12a625b/tests/ci/interactions/test_dropdown_aria_menus.py)

## Midscene：适合留一个可选视觉入口

Midscene 官方 quick start 允许直接在 Chrome 扩展中配置多模态模型并操作当前页面；MV3 manifest 声明 `debugger`，`ChromeExtensionProxyPage` 懒加载附着 debugger 并处理导航失联。Bridge 模式则由 Node 端控制桌面 Chrome，可复用用户登录态。这两种形态应分开评估：只研究扩展内视觉兜底时，不必把 Node bridge 一并引入。[快速开始](https://github.com/web-infra-dev/midscene/blob/1ccfa1277914d2d90217e6f4bc8c409278b067bd/apps/site/docs/en/quick-start.mdx) · [manifest](https://github.com/web-infra-dev/midscene/blob/1ccfa1277914d2d90217e6f4bc8c409278b067bd/apps/chrome-extension/static/manifest.json) · [Bridge 模式](https://github.com/web-infra-dev/midscene/blob/1ccfa1277914d2d90217e6f4bc8c409278b067bd/apps/site/docs/en/bridge-mode.mdx)

缓存设计也值得借鉴：规划和定位分别缓存，断言/查询结果不缓存，过期规划失败后重新规划；尤其不会把“已执行一半后生成的剩余步骤”错误覆盖成从初始状态可重放的完整计划。这比录制动作后永远重放更适合动态招聘表单。[缓存设计](https://github.com/web-infra-dev/midscene/blob/1ccfa1277914d2d90217e6f4bc8c409278b067bd/apps/site/docs/en/caching.mdx#L17)

建议把视觉能力放在明确失败类型之后作为可选策略，而不作为所有字段的默认路径。理由是它会引入模型配置、视觉上下文传递与额外调用；本轮也没有 Zhiye 上的正确率、成本和时延实测。该建议是本项目的工程取舍。

## 对旧候选的复核与其他排除项

- **Universal Form Compiler**：仍能参考旧 `content/page-bridge.js` 的 Angular MAIN-world bridge 和 README 声明的级联策略；但本次默认分支最后提交仍是 2026-05-04，并没有旧调研之后的新提交。仓库同时保留旧 `content/` 与 `src/`：新 `widget-detector.ts` 仅识别 native input/textarea/select，`form-filler.ts` 只用 `document.querySelector` 并按原生元素分派；根 manifest 仍指向 `background.js`。不能把这些并存代码的能力合并成一个已验证的通用库。针对已落地 adapters 的 OpenJobAutofill，本次没有发现值得整仓替换的新价值。[提交](https://github.com/kekko-damato/universal-form-compiler/commit/a58b02b5f82746f902198b921b6129984a0cc371) · [旧 bridge](https://github.com/kekko-damato/universal-form-compiler/blob/a58b02b5f82746f902198b921b6129984a0cc371/content/page-bridge.js) · [新检测器](https://github.com/kekko-damato/universal-form-compiler/blob/a58b02b5f82746f902198b921b6129984a0cc371/src/content/widget-detector.ts) · [新填写器](https://github.com/kekko-damato/universal-form-compiler/blob/a58b02b5f82746f902198b921b6129984a0cc371/src/content/form-filler.ts) · [manifest](https://github.com/kekko-damato/universal-form-compiler/blob/a58b02b5f82746f902198b921b6129984a0cc371/manifest.json)
- **Tiwas/AutoFill**：默认分支最后提交为 2025-12-10。录制器确实保存 click/type/key、selector 与 delay，但 `MacroPlayer` 回放仍是固定等待后 `document.querySelector(step.selector)`；“扫描支持 Shadow DOM/iframe”不等于“宏能可靠跨越这些边界”。适合参考人工绑定、规则保存，不足以作为可靠复杂控件执行器。[提交](https://github.com/Tiwas/AutoFill/commit/d79937ed3e438a69d2514467e686cc18f3661273) · [录制和回放源码](https://github.com/Tiwas/AutoFill/blob/d79937ed3e438a69d2514467e686cc18f3661273/content.js#L149)
- **jayzuccarelli/autofill**：默认分支最后提交为 2026-07-22（v0.2.5）；旧调研中“外部 agent、人工复核与反馈”的定位仍可保留，没有证据表明变成了 MV3 控件中间件。本轮不重复将它列为核心候选。[提交](https://github.com/jayzuccarelli/autofill/commit/a6115e4b74e5dd645bee643a1dda0d604c793c73) · [README](https://github.com/jayzuccarelli/autofill/blob/a6115e4b74e5dd645bee643a1dda0d604c793c73/README.md)
- **Skyvern**：当前官方形态是模型/视觉驱动的浏览器工作流和 Playwright-compatible SDK；本地路径包含 Python 与服务端，另有云端 API。可研究其多步任务思路，但相对当前 MV3 插件引入范围过大，不列为首选。不能因其宣传通用网页自动化，就推断 Phoenix、级联日期等具体控件已验证。[README](https://github.com/Skyvern-AI/skyvern/blob/9f32da7bd62446c262b49d99e71d451a80008ed8/README.md#L26)

## 维护与许可证快照

下表日期是本次 GitHub API 读取到的**默认分支末次提交的 committer 时间（UTC 日期）**，不是抓取时间、仓库 `updated_at`、全部分支最新活动或“仍有维护”的保证。所查仓库均返回 `archived=false`。许可证只记录仓库明示内容，不评价具体复用方式的法律后果。

| 仓库 | 默认分支提交日期 / SHA | 仓库明示许可证 |
| --- | --- | --- |
| Stagehand | [2026-09-27 / `34edfa38`](https://github.com/browserbase/stagehand/commit/34edfa38d6c33b30b07b4dd813f9c943f8e6689f) | [MIT](https://github.com/browserbase/stagehand/blob/34edfa38d6c33b30b07b4dd813f9c943f8e6689f/LICENSE)；v4 main 与上文正式 release 分开记录 |
| Bitwarden clients | [2026-09-25 / `45eb0013`](https://github.com/bitwarden/clients/commit/45eb0013dc413dab78932c418d209d89371febf6) | [默认 GPL v3；`bitwarden_license` 目录另用 Bitwarden License v1.0](https://github.com/bitwarden/clients/blob/45eb0013dc413dab78932c418d209d89371febf6/LICENSE.txt) |
| Automa | [2026-02-11 / `a4cbe34a`](https://github.com/AutomaApp/automa/commit/a4cbe34a60c92873c48c2470ca8ab1d96c22c7a0) | [非顶层 `business` 目录为 AGPL；`business` 目录另有商业许可](https://github.com/AutomaApp/automa/blob/a4cbe34a60c92873c48c2470ca8ab1d96c22c7a0/LICENSE.txt) |
| browser-use | [2026-09-26 / `4cbe9216`](https://github.com/browser-use/browser-use/commit/4cbe921673b48a488f5415d9159249afd12a625b) | [MIT](https://github.com/browser-use/browser-use/blob/4cbe921673b48a488f5415d9159249afd12a625b/LICENSE) |
| Midscene | [2026-09-27 / `1ccfa127`](https://github.com/web-infra-dev/midscene/commit/1ccfa1277914d2d90217e6f4bc8c409278b067bd) | [MIT](https://github.com/web-infra-dev/midscene/blob/1ccfa1277914d2d90217e6f4bc8c409278b067bd/LICENSE) |
| Universal Form Compiler | [2026-05-04 / `a58b02b5`](https://github.com/kekko-damato/universal-form-compiler/commit/a58b02b5f82746f902198b921b6129984a0cc371) | [MIT](https://github.com/kekko-damato/universal-form-compiler/blob/a58b02b5f82746f902198b921b6129984a0cc371/LICENSE) |
| Tiwas/AutoFill | [2025-12-10 / `d79937ed`](https://github.com/Tiwas/AutoFill/commit/d79937ed3e438a69d2514467e686cc18f3661273) | [README 声明 Apache-2.0](https://github.com/Tiwas/AutoFill/blob/d79937ed3e438a69d2514467e686cc18f3661273/README.md#license)；本次 API `license` 为空、根目录未列独立 LICENSE，保留这一差异 |
| jayzuccarelli/autofill | [2026-07-22 / `a6115e4b`](https://github.com/jayzuccarelli/autofill/commit/a6115e4b74e5dd645bee643a1dda0d604c793c73) | [MIT](https://github.com/jayzuccarelli/autofill/blob/a6115e4b74e5dd645bee643a1dda0d604c793c73/LICENSE) |
| Skyvern | [2026-09-27 / `9f32da7b`](https://github.com/Skyvern-AI/skyvern/commit/9f32da7bd62446c262b49d99e71d451a80008ed8) | [AGPL-3.0](https://github.com/Skyvern-AI/skyvern/blob/9f32da7bd62446c262b49d99e71d451a80008ed8/LICENSE) |

## 建议怎样把调研转成重构

这部分是结合外部资料与本地源码的工程建议，不是外部项目的能力声明。

1. **先固定 Moka 基线，并收集 Zhiye 失败样本。** 保留已有的重复经历绑定、年月拆分和字段语义规则。Zhiye 至少覆盖普通下拉、学校/专业搜索、地区逐级选择并确认、年月/完整日期/至今、重复经历；把实际失败 DOM 和交互轨迹脱敏后做成可重现夹具。
2. **抽出控件执行层。** 每个字段保留 section/record 身份；控件同时表达逻辑字段、可见触发器、搜索输入、关联弹层与正式选中值。DOM 被 React 替换后依据句柄重新定位，不能一直沿用最初抓到的节点。
3. **统一交互与结果协议。** 建议生命周期为 `resolve → open → waitReady → search/choose → commit → verify → cleanup`。一个页面同一时刻只操作一个选择弹层；等待依据目标状态、有超时与取消。未找到唯一选项、层级只走一半、搜索词未正式选中，均不能计入已填写。
4. **渐进迁移。** 先实现 Phoenix driver 并迁移 Moka driver；通用、Ant、Layui 后续逐一迁移。复杂方案如 Stagehand/Midscene 先作独立技术验证，评估运行时、权限和资料处理边界，不在第一步整体替换现有扩展。
5. **把模型限定在它能帮助的环节。** 字段语义、资料键映射和低置信度候选解释可以使用模型；选择哪个 DOM、等哪个状态、是否真正选中，应由可校验的执行层决定。视觉兜底单独评估，不能默认为沿用当前“只发送字段名称”的数据处理方式。

可评审的最小接口草案，先不限定是否引入 TypeScript 或构建工具：

```js
driver.detect(element, context)
driver.describe(handle)           // logical field, trigger, query input, scope
driver.readCommitted(handle)      // query text is not committed value
driver.open(handle, session)
driver.waitReady(handle, session)
driver.choose(handle, target, session)
driver.commit(handle, session)
driver.verify(handle, target, session)
driver.cleanup(handle, session)
```

统一结果至少区分 `filled`、`unchanged`、`needs-review`、`failed`，记录失败阶段与原因，不把阶段动作完成当作字段成功。对有选择 ID 的控件核对 ID 与标签；没有可读 ID 时，核对可观察的选中态、显示值和失焦/重渲染后的结果。

后续验证应回答四个问题：字段有没有填对；是否真正进入选中状态；是否误操作相邻字段/经历；Moka 原本可用的案例是否保持。浏览器夹具补充 portal 脱离字段、重复选项文本、延迟加载、节点替换、提交被拒绝这几类情况。无需在调研阶段扩大成全平台重写。
