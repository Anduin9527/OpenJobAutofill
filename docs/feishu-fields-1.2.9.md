# 飞书个人信息与实习字段修复（1.2.9）

针对多点数智飞书招聘页的 ATSX 表单。2026-10-09 的用户调试日志记录了 `1.2.8-moka-awards` 在 20:57 执行填写：姓名和邮箱失败，实习“描述”候选来自“开始时间”。日志中报告的“已填”只说明执行或回读成功，不能证明来源字段正确。

## 原因与修改

- 表单使用 `.atsx-form-item`，标签与 `.atsx-form-item-control` 为兄弟节点。原通用容器规则可先命中内层 control，读不到真正标签；下拉标签被读成“待处理”，其搜索框还被扫描为独立字段。新增 ATSX 文本、下拉适配，读取外层字段的标签并合并搜索框。姓名、邮箱等原生文本通过文本驱动写入，不再因周围的选择提示进入弹层流程。
- 实际分区是 `.createFormSection-container`。新增从本分区 `.createFormSection-left` 读取标题，以及已有 `resumeEditForm` 类型的备用识别；明确标题优先于相邻栏目的关键词。
- 实习和工作中的“描述”映射到本机“工作内容”，匹配时优先使用本字段语义。教育、工作、实习之间禁止借用值。
- 教育、工作和实习先按学校或公司匹配唯一的本机记录，然后约束职位、专业、日期、描述的来源。只有整个栏目全空才按顺序使用本机记录；未知、重复或部分导入但没有身份的记录不猜填。
- 下拉读取正式显示值，忽略搜索输入；支持输入后异步加载菜单，搜索期间不发 change/blur，等待正式选中后才报成功。

日志中的本机实习资料没有非空“结束时间”，基本资料也没有“年龄”。这两类字段仍留空，不借用项目日期或把出生日期直接当年龄。

## 验证

新增 `tests/feishu-personal-internship-smoke.mjs`，用虚构资料复现旧逻辑将描述匹配成教育开始日期的失败，修复后通过。覆盖实习换序、同一条记录的描述与日期、缺失结束日期、空白前缀、部分导入、未知与重复公司、额外卡片，以及教育学校与专业/日期的一致性。

相关 Node 回归 8 份通过：

```text
feishu-personal-internship-smoke.mjs
feishu-records-smoke.mjs
personal-fields-smoke.mjs
mokahr-section-classification-smoke.mjs
education-project-overwrite-smoke.mjs
form-runtime-smoke.mjs
project-field-aliases-smoke.mjs
award-aliases-smoke.mjs
```

浏览器结构样例均使用虚构资料与实际项目脚本：飞书 10 项、通用控件 25 项、Moka/钉钉 17 项，共 52 项。覆盖真实观察到的 ATSX 字段包裹和 createFormSection 分区、文本实际写入、下拉与搜索菜单、重复候选隔离、经历批量填写和月份菜单。运行入口：

```sh
node tests/serve-browser-fixtures.mjs --port=4189
```

对应路径 `/feishu`、`/`、`/dingtalk`。服务仅监听本机，白名单提供测试文件和项目脚本，不提供本机简历资料。

## 本次交付边界

源代码和 manifest 已更新为 1.2.9。用户要求继续后，已在原 OpenJobAutofill 扩展详情页完成重载：Chrome 显示版本 1.2.9，并提示“已重新加载”；扩展 ID 与加载来源未变。返回投递页检查时 Mac 再次锁屏，尚未核对新内容脚本在真实页面的加载。已打开的投递页可保留，下一次打开插件会按新内容脚本版本注入。

真实页面仅做读取与结构检查，没有重新填表或提交申请。

真实页面在旧版本下已经写入的错误描述不会因代码更新自动改正，需要在重载后重新运行并核对。
