# 通用浏览器表单自动填写框架调研

日期：2026-08-16  
范围：为 OpenJobAutofill 选择可借鉴的浏览器表单扫描、控件写入和站点兜底机制，并解释 JHICC 校园招聘页面的匹配失败。

## 结论先行

目前没有一个可以无改造地覆盖任意招聘网站的“通用填写框架”。最适合 OpenJobAutofill 的路线不是替换现有扫描器，而是组合两层能力：

1. 借鉴 [Universal Form Compiler](https://github.com/kekko-damato/universal-form-compiler)：把控件分成原生控件、框架控件和级联控件，必要时使用 MAIN-world bridge 访问页面框架状态，并在异步选项加载后重试。
2. 借鉴 [Tiwas/AutoFill](https://github.com/Tiwas/AutoFill)：保留按站点/字段保存规则和录制式兜底，让用户记录一次“点击下拉框 → 选择选项 → 输入文本”的动作序列。
3. [Bitwarden autofill 模块](https://github.com/bitwarden/clients/tree/main/apps/browser/src/autofill) 更适合参考模块拆分、异步边界和安全约束，不建议直接移植；[jayzuccarelli/autofill](https://github.com/jayzuccarelli/autofill) 更像基于 browser-use 的外部浏览器代理，不是可直接嵌入 MV3 扩展的控件库。

## JHICC/Layui 失败原因

以下判断来自 [JHICC CampusCVfill 原始页面](https://www.jhicc.com/Recruiting/Campus/CampusCVfill?myposID=73afeed9-8b7c-4222-a0b2-87e2067350f1\&mypostype=005) 的页面结构，以及当前 [OpenJobAutofill `src/content.js`](https://github.com/Anduin9527/OpenJobAutofill/blob/main/src/content.js) 的扫描/写入逻辑。

### 1. Layui 把原生 select 隐藏后再渲染代理控件

JHICC 页面使用 `<form class="layui-form">`；`姓名`、`性别`、`民族` 等字段的原始 `input/select` 带有 `name` 和 `id`，但同一行的 `label` 没有 `for` 关联。Layui 会把 `select` 渲染成可见的 `.layui-form-select`，选项放在 `dl > dd[lay-value]`，并在异步加载后调用 `form.render('select')`。因此“页面上看得到的控件”和“真正保存值的原生控件”不是同一个元素。[JHICC 页面](https://www.jhicc.com/Recruiting/Campus/CampusCVfill?myposID=73afeed9-8b7c-4222-a0b2-87e2067350f1\&mypostype=005)

当前扫描入口只保留 `isVisible` 的控件；隐藏的原生 `select` 会被排除，而可见代理输入没有原始 `name/id`。当前选择器还只识别 `role=option`、`li`、Ant/RC 等选项，不包含 Layui 的 `dd`；原生 setter 也只对 `HTMLSelectElement` 生效。[当前扫描逻辑](https://github.com/Anduin9527/OpenJobAutofill/blob/main/src/content.js#L2013-L2018) · [当前选择器/写入逻辑](https://github.com/Anduin9527/OpenJobAutofill/blob/main/src/content.js#L6265-L6303)

这解释了截图中日期/文本类字段可以被识别，而性别、民族、政治面貌等下拉字段大量进入待处理状态：问题不是资料中没有“男/汉族”等值，而是没有把 Layui 代理控件当作一个带原生字段身份的逻辑控件。

### 2. 同一 `.layui-form-item` 包含多个字段，label 没有显式关联

JHICC 的一行可以并列放置“姓名 / 性别 / 民族”三个字段。当前实现会向上寻找带 `form`、`field`、`item`、`row` 等 class 的容器，并将容器文本作为附近语义；当前 `buildFieldMeta` 优先读取 `label[for]`，但这个页面没有 `for`，所以可能把同一行的多个标签合并给不同控件。[容器/语义提取](https://github.com/Anduin9527/OpenJobAutofill/blob/main/src/content.js#L1285-L1347) · [字段元数据](https://github.com/Anduin9527/OpenJobAutofill/blob/main/src/content.js#L1945-L1982)

这会造成性别/民族字段被误当成“姓名”或得到模糊的共享标签，进而降低匹配置信度。修复应以“字段所在列的兄弟 label + 原生 select 的 name/id”为主，不应继续把整行文本当作一个字段标签。

### 3. 站点适配器存在误判

当前 `智易/智业 ATS` 适配器的 indicators 包含 `[class*='form-item']`；JHICC 的 `.layui-form-item` 会命中这个通用片段，即使域名不是 `zhiye.com`。检测逻辑在 URL 不匹配时仍允许 indicator 加分，所以截图状态显示成“智易/智业 ATS”是误判，会进一步改变容器和 label 选择。[适配器声明](https://github.com/Anduin9527/OpenJobAutofill/blob/main/src/content.js#L51-L64) · [适配器评分](https://github.com/Anduin9527/OpenJobAutofill/blob/main/src/content.js#L479-L520)

适配器选择应优先要求域名/路径命中；通用 class 只能作为低权重提示，不能单独激活某个站点专用规则。

### 4. 异步选项和级联地址是第二个问题

JHICC 通过接口加载配置选项，并在省份改变后异步请求城市，再次渲染下拉框。[JHICC 页面脚本](https://www.jhicc.com/Recruiting/Campus/CampusCVfill?myposID=73afeed9-8b7c-4222-a0b2-87e2067350f1\&mypostype=005) 因此扫描时机、父子字段顺序和等待策略都很重要。即使先修好 Layui `dd` 的点击，省/市仍需要“先选省 → 等待城市选项出现 → 再选市”的重试流程。

照片是另外一类限制，不属于匹配失败：当前实现明确将 `input[type=file]` 返回为“需要手动选择”，这是浏览器安全模型下的合理边界。[文件控件处理](https://github.com/Anduin9527/OpenJobAutofill/blob/main/src/content.js#L5924-L5931)

## 开源实现对比

| 项目 | 一手资料中可确认的能力 | 对 OpenJobAutofill 的可借鉴点 | 不宜直接照搬的部分 |
| --- | --- | --- | --- |
| [Universal Form Compiler](https://github.com/kekko-damato/universal-form-compiler) | MV3 扩展；支持原生 input/select/textarea、Angular Material、Angular Reactive Forms、React/Vue/Svelte；声明支持异步级联 select；`content.js` 与 MAIN-world `page-bridge.js` 分层。 | 最接近当前项目：建立 `native` / `layui` / `react` / `angular` 等明确控件类型；使用 bridge 读取框架内部状态；批量写入后做恢复/级联重试。 | README 自身注明其他框架的自定义 React/Vue 下拉仍可能需要框架专用处理；不能把“原生 setter + change 事件”当成万能方案。[README](https://github.com/kekko-damato/universal-form-compiler/blob/main/README.md) · [扫描器](https://github.com/kekko-damato/universal-form-compiler/blob/main/content/content.js) · [MAIN bridge](https://github.com/kekko-damato/universal-form-compiler/blob/main/content/page-bridge.js) |
| [Tiwas/AutoFill](https://github.com/Tiwas/AutoFill) | 规则可按 hostname/domain/URL/regex 匹配；字段支持 name、id、data-name、data-id、placeholder、CSS selector；支持 iframe、Shadow DOM、MutationObserver；源码包含 MacroRecorder/MacroPlayer。 | 适合作为“站点规则 + 录制动作”兜底：保存稳定 selector、站点范围、字段值和动作间隔；针对 Layui 等非标准控件，录制真实点击事件比猜测 DOM setter 更可靠。 | 规则系统偏确定性，不能替代简历字段语义匹配；selector 需要版本漂移和重复项保护。 [README](https://github.com/Tiwas/AutoFill/blob/main/README.md) · [content.js](https://github.com/Tiwas/AutoFill/blob/main/content.js) |
| [Bitwarden autofill](https://github.com/bitwarden/clients/tree/main/apps/browser/src/autofill) | 官方仓库把 autofill 拆为 background、browser、content、models、services、webmapper 等目录，并单独维护 fill mechanics、lifecycle、性能和异步边界文档。 | 参考“扫描 → 映射 → 执行 → 验证”的模块边界，以及跨 frame、异步和敏感字段的安全审计思路。 | 这是密码管理器的生产级系统，安全边界、凭据模型和兼容性规模远超本项目；不应为了 JHICC 引入整套依赖。 [autofill README](https://github.com/bitwarden/clients/blob/main/apps/browser/src/autofill/README.md) |
| [jayzuccarelli/autofill](https://github.com/jayzuccarelli/autofill) | 基于 browser-use 的表单填写 agent；用持久化浏览器处理登录态，填写后停在人工检查阶段，并记录用户修正。 | 借鉴“填写—人工修正—再次运行”的反馈闭环，以及多步骤表单的可恢复执行。 | 它是 CLI/外部浏览器代理，依赖 LLM provider 和 browser-use，不是可直接装入当前 MV3 content script 的通用控件框架；隐私边界也不同。 [README](https://github.com/jayzuccarelli/autofill/blob/main/README.md) |

## 建议的实现顺序

1. **先做 JHICC/Layui 适配器**：把隐藏原生 `select` 与可见 `.layui-form-select` 合并为一个逻辑字段；标签取同一列的 `.layui-form-label`，身份保留原生 `name/id`；选项识别 `dl > dd[lay-value]`，通过点击 `dd` 触发 Layui 的 change/select 事件。
2. **修正适配器误判**：只有 URL 命中时才启用 `zhiye`；`.layui-form` 单独作为低侵入的通用控件探测，不改变其他站点容器规则。
3. **加入异步/级联重试**：等待 Layui 渲染完成；省份成功后等待城市选项变化；每个选择动作都验证原生 select 的 value 和可见代理文本。
4. **抽象通用控件接口**：`scan()` 返回字段身份、可见代理、选项读取器和写入器；`fill()` 返回事件是否触发、最终值和失败原因。先实现 `native`、`layui`，以后再增加 React/Ant/Element。
5. **最后增加录制式兜底**：参考 Tiwas 保存站点规则和动作序列，但默认只保存 selector/字段映射/延迟，不自动点击提交按钮。

## 采用与否

- **采用思路**：Universal Form Compiler 的显式控件分类、MAIN-world bridge、异步级联重试；Tiwas 的站点规则、录制动作、动态 DOM 观察。
- **暂不采用**：整仓替换为任何一个外部项目；Bitwarden 全量移植；把 browser-use agent 作为扩展运行时依赖。
- **近期目标**：先让 JHICC 基本信息中的姓名、性别、民族、政治面貌、婚姻状况、学历、国籍等字段稳定填写，再把 Layui 适配器抽成可复用的通用控件插件接口。

## 来源与复核边界

- 外部项目事实均来自其 GitHub README、源码或官方模块文档，上文各项目行已给出直链。
- JHICC 控件结构和接口调用来自目标页面本身；页面可能随招聘批次变化，不能把当前页面的字段名假定为所有 JHICC 页面都相同。
- “最适合采用”“不宜直接照搬”等属于基于上述源代码和 OpenJobAutofill 当前架构的工程判断，不是项目作者的声明。
