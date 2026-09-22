(() => {
  const SCRIPT_VERSION = "1.1.28-phoenix-footer";

  if (window.__OJAF_AUTOFILL_VERSION__ === SCRIPT_VERSION) {
    return;
  }

  window.__OJAF_AUTOFILL_VERSION__ = SCRIPT_VERSION;
  window.__OJAF_AUTOFILL_LOADED__ = true;

  const FIELD_ATTR = "data-ojaf-field-id";
  const MARK_ATTR = "data-ojaf-mark";
  const EDIT_ATTEMPT_ATTR = "data-ojaf-edit-attempted";
  const STYLE_ID = "ojaf-autofill-style";
  const PANEL_ID = "ojaf-profile-panel";
  const FLOAT_ID = "ojaf-floating-status";
  const PANEL_HIDDEN_ATTR = "data-ojaf-hidden";
  const PANEL_COLLAPSED_ATTR = "data-ojaf-collapsed";
  const MAX_EDIT_EXPANSIONS = 20;
  const PROFILE_PANEL_STATE_DEBOUNCE_MS = 300;
  let fieldCounter = 0;
  let profilePanelVisible = false;
  let profilePanelCollapsed = false;
  let profilePanel = null;
  let profilePanelStateSaveTimer = null;
  let profilePanelStateRestored = false;
  let currentProfileV2 = null;
  let currentProfileLoadPromise = null;
  let currentSiteAdapter = null;
  let sidebarFilter = "";
  let activeProfileCategory = "";
  let autofillInProgress = false;
  let autofillProgress = { active: false, stage: "", percent: 0, detail: "" };
  let autofillSummary = null;
  let lastAutofillDebug = null;
  let autofillDebugPersistPromise = Promise.resolve();
  let autofillRunId = 0;
  let autofillProgressTimer = null;
  let autofillAiState = createAutofillAiState();

  const CONTROL_SELECTOR = [
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"])',
    ".atsx-date-picker-period-month-label",
    "textarea",
    "select",
    '[contenteditable="true"]',
    '[role="textbox"]',
    '[role="combobox"]',
    '[role="radio"]',
    '[role="checkbox"]',
    ".ant-select",
    ".ant-cascader-picker",
    ".el-select",
    ".el-cascader",
    ".arco-select",
    ".arco-cascader",
    ".t-select",
    ".t-cascader",
    // 智易/北森 Phoenix 控件把真正的 input 放在这些自定义容器里。
    // 同时收集容器，便于在 input 属性不完整时仍能找到对应的 adapter。
    ".phoenix-auto-complete-container",
    ".phoenix-date-picker",
    ".phoenix-radio-group",
    // Older Phoenix select fields may expose only a `.phoenix-select` surface
    // without a role or an input. Include the surface so it remains fillable.
    ".form-item--phoenix .phoenix-select"
  ].join(",");

  const SITE_ADAPTERS = [
    {
      id: "zhiye",
      name: "智易/智业 ATS",
      urlPattern: /(?:^|\.)zhiye\.com$/i,
      confidence: 0.94,
      // Keep generic form-item classes out of site detection.  Many unrelated
      // component libraries (including Layui) use the same suffix.
      indicators: [".ant-form-item", ".ant-select", ".zhiye-form-item", ".zhiye-form"],
      containerSelector: ".ant-form-item,.form-item,[class*='formItem'],[class*='FormItem'],[class*='field'],[class*='Field']",
      labelSelector: ".ant-form-item-label,label,[class*='label'],[class*='Label'],[class*='formLabel']",
      sectionSelector: ".ant-card-head-title,.ant-collapse-header,.form-section-title,[class*='sectionTitle'],[class*='module-title'],h2,h3,h4",
      repeatItemSelector: ".ant-card,.ant-collapse-item,.resume-block,[class*='list-item'],[class*='resume-item'],[class*='record-item']",
      saveLabels: ["保存", "确定", "完成"],
      editLabels: ["编辑", "修改", "完善"]
    },
    {
      id: "hotjob",
      name: "HotJob",
      urlPattern: /(?:^|\.)hotjob\.cn$/i,
      confidence: 0.92,
      indicators: [".form-cell .ant-form-item", ".form-item", ".resume-block", "[class*='kuma']", "[class*='uxcore']"],
      containerSelector: ".form-item,.kuma-form-item,.uxcore-form-row,[class*='form-item'],[class*='field']",
      labelSelector: ".kuma-label,.form-label,label,[class*='label']",
      sectionSelector: ".form-cell > .tit-wrap,.module-title,.resume-title,.card-title,.uxcore-card-title-text,h2,h3,h4",
      repeatItemSelector: ".form-cell-inner,.resume-block,.uxcore-card,[class*='resume-item'],[class*='experience-item'],[class*='list-item']",
      saveLabels: ["保存", "确定", "提交"],
      editLabels: ["编辑", "修改"]
    },
    {
      id: "layui",
      name: "Layui 通用表单",
      confidence: 0.78,
      indicators: [".layui-form", ".layui-form-select"],
      containerSelector: ".layui-form-item",
      labelSelector: ".layui-form-label,label,[class*='label'],[class*='Label']",
      sectionSelector: ".layui-elem-title,.layui-card-header,[class*='section-title'],[class*='module-title'],h2,h3,h4",
      repeatItemSelector: ".layui-form-item,.layui-card,[class*='list-item'],[class*='record-item']",
      saveLabels: ["保存", "确定", "完成", "提交"],
      editLabels: ["编辑", "修改", "完善"]
    },
    {
      id: "liepin",
      name: "猎聘/通用 ATS",
      urlPattern: /(?:^|\.)liepin\.com$/i,
      confidence: 0.86,
      indicators: [".form-item", "[class*='resume']", "[class*='apply']"],
      containerSelector: ".form-item,[class*='formItem'],[class*='field'],[class*='apply']",
      labelSelector: "label,[class*='label'],[class*='Label']",
      sectionSelector: "[class*='title'],[class*='Title'],h2,h3,h4",
      repeatItemSelector: "[class*='resume-item'],[class*='experience-item'],[class*='list-item'],[class*='record-item']",
      saveLabels: ["保存", "确定"],
      editLabels: ["编辑", "修改"]
    },
    {
      id: "moka",
      name: "Moka 招聘",
      urlPattern: /(?:^|\.)(?:mokahr|moka)\.com$/i,
      confidence: 0.95,
      indicators: ["[class*='apply-field-']", "[class*='apply-block-']", "[class*='blockTitle-']", ".ant-form-item"],
      containerSelector: "[class*='apply-field-'],.ant-form-item,[class*='form-item'],[class*='field-wrapper'],[class*='question-item'],[class*='schema-form-item']",
      labelSelector: "[class*='title-'] span,.ant-form-item-label,label,[class*='field-label'],[class*='question-label'],[class*='question-title']",
      sectionSelector: "[class*='blockTitle-'],.ant-card-head-title,[class*='module-title'],[class*='questionnaire-title'],[class*='block-title'],h2,h3,h4",
      repeatItemSelector: "[class*='apply-fields-'][class*='multi-'],.ant-card,[class*='resume-item'],[class*='experience-item'],[class*='list-item'],[class*='card-item']",
      saveLabels: ["保存", "确定", "下一步", "完成"],
      editLabels: ["编辑", "修改", "完善"]
    },
    {
      id: "beisen",
      name: "北森/iTalentX",
      urlPattern: /(?:^|\.)beisen\.com$|(?:^|\.)italent\.cn$|(?:^|\.)italentx\.cn$|(?:^|\.)italentx\.com$/i,
      confidence: 0.89,
      indicators: [".el-form-item", ".ant-form-item", "[class*='resume-form']", "[class*='talent-form']", "[class*='bs-']"],
      containerSelector: ".el-form-item,.ant-form-item,[class*='form-item'],[class*='resume-field'],[class*='field-row']",
      labelSelector: ".el-form-item__label,.ant-form-item-label,label,[class*='field-label'],[class*='label']",
      sectionSelector: ".el-card__header,[class*='block-title'],[class*='section-title'],[class*='module-title'],h2,h3,h4",
      repeatItemSelector: ".el-card,[class*='resume-item'],[class*='experience-item'],[class*='list-item'],[class*='record-item']",
      saveLabels: ["保存", "确定", "下一步", "完成"],
      editLabels: ["编辑", "修改", "完善", "填写"]
    },
    {
      id: "nowcoder",
      name: "牛客网申",
      urlPattern: /(?:^|\.)nowcoder\.com$/i,
      confidence: 0.84,
      indicators: [".ant-form-item", "[class*='questionnaire']", "[class*='resume-module']", "[class*='form-item']"],
      containerSelector: ".ant-form-item,[class*='form-item'],[class*='question-item'],[class*='resume-field']",
      labelSelector: ".ant-form-item-label,label,[class*='field-label'],[class*='question-title'],[class*='label']",
      sectionSelector: ".ant-card-head-title,[class*='module-title'],[class*='questionnaire-title'],[class*='resume-title'],h2,h3,h4",
      repeatItemSelector: ".ant-card,[class*='resume-item'],[class*='experience-item'],[class*='list-item']",
      saveLabels: ["保存", "确定", "下一步", "完成"],
      editLabels: ["编辑", "修改", "完善"]
    },
    {
      id: "zhaopin",
      name: "智联招聘",
      urlPattern: /(?:^|\.)zhaopin\.com$/i,
      confidence: 0.83,
      indicators: [".ant-form-item", "[class*='resume-edit']", "[class*='questionnaire']", "[class*='form-item']"],
      containerSelector: ".ant-form-item,[class*='form-item'],[class*='resume-field'],[class*='field-row']",
      labelSelector: ".ant-form-item-label,label,[class*='field-label'],[class*='label']",
      sectionSelector: ".ant-card-head-title,[class*='module-title'],[class*='resume-title'],[class*='section-title'],h2,h3,h4",
      repeatItemSelector: ".ant-card,[class*='resume-module'],[class*='resume-item'],[class*='list-item']",
      saveLabels: ["保存", "确定", "下一步", "完成"],
      editLabels: ["编辑", "修改", "完善"]
    },
    {
      id: "feishu-jobs",
      name: "飞书招聘",
      urlPattern: /(?:^|\.)jobs\.feishu\.cn$/i,
      confidence: 0.82,
      indicators: [".ud-formily-item", "[class*='applyFormModuleWrapper']", "[data-form-field-id]", "[data-form-field-name]"],
      containerSelector: ".ud-formily-item,[class*='applyFormModuleWrapper'],[class*='form-item'],[class*='field']",
      labelSelector: ".ud-formily-item-label-content,label,[class*='label'],[data-form-field-i18n-name]",
      sectionSelector: ".applyFormModuleWrapper-text,[class*='module-title'],[class*='section-title'],h2,h3,h4",
      repeatItemSelector: "[class*='applyFormModuleWrapper'],[class*='list-item'],[class*='record-item'],[class*='card-item']",
      saveLabels: ["保存", "确定", "下一步", "完成"],
      editLabels: ["编辑", "修改", "完善"]
    },
    {
      id: "ant-design",
      name: "Ant Design 表单",
      confidence: 0.78,
      indicators: [".ant-form-item", ".ant-select", ".ant-radio-wrapper"],
      containerSelector: ".ant-form-item,.ant-row.ant-form-item,[class*='ant-form-item']",
      labelSelector: ".ant-form-item-label,label,.ant-checkbox-wrapper,.ant-radio-wrapper",
      sectionSelector: ".ant-card-head-title,.ant-collapse-header,.ant-tabs-tab,.ant-typography,h2,h3,h4",
      repeatItemSelector: ".ant-card,.ant-collapse-item,[class*='list-item'],[class*='record-item'],[class*='card-item']",
      saveLabels: ["保存", "确定", "完成"],
      editLabels: ["编辑", "修改"]
    },
    {
      id: "arco-design",
      name: "Arco Design 表单",
      confidence: 0.77,
      indicators: [".arco-form-item", ".arco-select-view", ".arco-radio"],
      containerSelector: ".arco-form-item,[class*='arco-form-item']",
      labelSelector: ".arco-form-item-label,label,.arco-radio,.arco-checkbox",
      sectionSelector: ".arco-card-header,[class*='section-title'],[class*='module-title'],h2,h3,h4",
      repeatItemSelector: ".arco-card,[class*='list-item'],[class*='record-item'],[class*='card-item']",
      saveLabels: ["保存", "确定", "完成"],
      editLabels: ["编辑", "修改"]
    },
    {
      id: "element-ui",
      name: "Element UI 表单",
      confidence: 0.76,
      indicators: [".el-form-item", ".el-select", ".el-radio"],
      containerSelector: ".el-form-item,[class*='el-form-item']",
      labelSelector: ".el-form-item__label,label,.el-checkbox,.el-radio",
      sectionSelector: ".el-card__header,.el-collapse-item__header,[class*='title'],h2,h3,h4",
      repeatItemSelector: ".el-card,.el-collapse-item,[class*='list-item'],[class*='record-item'],[class*='card-item']",
      saveLabels: ["保存", "确定", "完成"],
      editLabels: ["编辑", "修改"]
    },
    {
      id: "tdesign",
      name: "TDesign 表单",
      confidence: 0.75,
      indicators: [".t-form__item", ".t-select", ".t-radio"],
      containerSelector: ".t-form__item,[class*='t-form__item']",
      labelSelector: ".t-form__label,label,.t-radio,.t-checkbox",
      sectionSelector: ".t-card__header,[class*='section-title'],[class*='module-title'],h2,h3,h4",
      repeatItemSelector: ".t-card,[class*='list-item'],[class*='record-item'],[class*='card-item']",
      saveLabels: ["保存", "确定", "完成"],
      editLabels: ["编辑", "修改"]
    }
  ];

  // Control adapters are deliberately separate from site adapters.  A site
  // adapter describes a page's layout and actions, while a control adapter
  // describes how one field is represented and written by a UI framework.
  // This lets one Layui/Ant/Element implementation work across many hosts.
  const CONTROL_ADAPTERS = [
    {
      id: "feishu-period", name: "飞书起止月份",
      matches: (e) => Boolean(e.matches?.(".atsx-date-picker-period-month-label")),
      getLogicalElement: (e) => e,
      getFieldContainer: (e) => e.closest(".atsx-form-item"),
      getLabel: (e) => /Begin$/.test(e.getAttribute("data-cy") || "") ? "开始时间" : "结束时间",
      getCurrentValue: (e) => readFeishuPeriod(e)
    },
    {
      id: "phoenix-date", name: "北森 Phoenix 日期",
      matches: (element) => Boolean(getPhoenixDateRoot(element)),
      getLogicalElement: (element) => getPhoenixDateInput(getPhoenixDateRoot(element)) || getPhoenixDateRoot(element),
      getFieldContainer: (element) => getPhoenixDateFieldContainer(getPhoenixDateRoot(element)),
      getSurfaceElement: (element) => getPhoenixDateSurface(getPhoenixDateRoot(element)),
      getLabel: (element) => getPhoenixDateLabel(getPhoenixDateRoot(element)),
      getCurrentValue: (element) => readPhoenixDate(getPhoenixDateRoot(element)),
      isDisabled: (element) => {
        const root = getPhoenixDateRoot(element);
        return Boolean(getPhoenixDateInput(root)?.disabled && !getPhoenixPresentCheckbox(root));
      }
    },
    {
      id: "phoenix-radio", name: "北森 Phoenix 单选组",
      matches: (element) => /(^|\.)zhiye\.com$/i.test(location.hostname) && Boolean(element.closest?.(".phoenix-radio-group")),
      getLogicalElement: (element) => element.closest(".phoenix-radio-group"),
      getSurfaceElement: (element) => element.closest(".phoenix-radio-group"),
      getFieldContainer: (element) => element.closest(".form-item"),
      getChoiceContainer: (element) => element.closest(".phoenix-radio-group"),
      getLabel: (element) => getElementText(element.closest(".form-item")?.querySelector(".form-item__title")),
      getCurrentValue: (element) => getElementText(element.closest(".phoenix-radio-group")?.querySelector(".phoenix-radio--checked .phoenix-radio__radio-text")),
      optionSelectors: [".phoenix-radio"]
    },
    {
      id: "phoenix-autocomplete", name: "北森 Phoenix 下拉控件",
      matches: (element) => Boolean(getPhoenixAutocompleteRoot(element)),
      getLogicalElement: (element) => getPhoenixAutocompleteInput(getPhoenixAutocompleteRoot(element)) || getPhoenixAutocompleteRoot(element),
      getFieldContainer: (element) => getPhoenixAutocompleteFieldContainer(getPhoenixAutocompleteRoot(element)),
      getChoiceContainer: (element) => getPhoenixAutocompleteRoot(element),
      getSurfaceElement: (element) => getPhoenixAutocompleteInput(getPhoenixAutocompleteRoot(element)) || getPhoenixAutocompleteRoot(element),
      getLabel: (element) => getPhoenixAutocompleteLabel(getPhoenixAutocompleteRoot(element)),
      getCurrentValue: (element) => {
        const root = getPhoenixAutocompleteRoot(element);
        const input = getPhoenixAutocompleteInput(root);
        const display = root?.querySelector?.(".phoenix-select__tipEle,.phoenix-select__value,.phoenix-select__text");
        // Never read the field wrapper: it includes the label and placeholder.
        const value = normalizeText(display ? getElementText(display) : input?.value || "", 260);
        return /^(请选择.*|请先选择.*|无数据)$/.test(value) ? "" : value;
      },
      isDisabled: (element) => Boolean(getPhoenixAutocompleteInput(getPhoenixAutocompleteRoot(element))?.disabled),
      optionSelectors: [
        "li",
        '[role="option"]',
        '[class*="selectList"] li',
        '[class*="option"]',
        ".phoenix-select__option",
        ".phoenix-select-dropdown li"
      ]
    },
    {
      id: "moka-sd-select",
      name: "Moka SD 下拉控件",
      matches(element) {
        return isMokaSdSelectField(element);
      },
      getLogicalElement(element) {
        return getMokaSdDropdownRoot(element) || element;
      },
      getSurfaceElement(element) {
        const root = getMokaSdDropdownRoot(element);
        return root?.querySelector?.("label[class*='sd-Select-container-']") || element;
      },
      getFieldContainer(element) {
        return (getMokaSdDropdownRoot(element) || element)?.closest?.("[class*='apply-field-']") || null;
      },
      getChoiceContainer(element) {
        return getMokaSdDropdownRoot(element);
      },
      getLabel(element) {
        const field = this.getFieldContainer(element);
        return getElementText(field?.querySelector?.(":scope > [class*='title-']"));
      },
      getCurrentValue(element) {
        const root = getMokaSdDropdownRoot(element);
        const surface = root?.querySelector?.("label[class*='sd-Select-container-']");
        const display = surface?.querySelector?.("[class*='sd-Input-display-value-']");
        const input = surface?.querySelector?.('input:not([type="hidden"])');
        return normalizeText(getElementText(display) || input?.value || "", 260);
      },
      isDisabled(element) {
        const root = getMokaSdDropdownRoot(element);
        const surface = root?.querySelector?.("label[class*='sd-Select-container-']");
        const input = surface?.querySelector?.('input:not([type="hidden"])');
        return Boolean(
          input?.disabled ||
          /(?:^|\s)(?:[^\s]*Disabled[^\s]*|[^\s]*disabled[^\s]*)(?:\s|$)/.test(String(surface?.className || ""))
        );
      },
      optionSelectors: [
        "[class*='sd-Select-common-item-']",
        "[class*='sd-Menu-container-']"
      ]
    },
    {
      id: "layui",
      name: "Layui 下拉控件",
      matches(element) {
        if (!(element instanceof Element)) {
          return false;
        }
        return Boolean(element.closest(".layui-form"));
      },
      getLogicalElement(element) {
        if (element instanceof HTMLSelectElement) {
          return element;
        }
        return findLayuiSelectForProxy(element) || element;
      },
      getSurfaceElement(element) {
        const select = element instanceof HTMLSelectElement ? element : findLayuiSelectForProxy(element);
        return findLayuiProxyForSelect(select || element) || element;
      },
      getFieldContainer(element) {
        const select = element instanceof HTMLSelectElement ? element : findLayuiSelectForProxy(element);
        const inline = select?.closest(".layui-input-inline,.layui-input-block") || element.closest?.(".layui-input-inline,.layui-input-block");
        const column = inline?.closest("[class*='layui-col-'],.layui-inline") || inline;
        return column || select?.parentElement || element.parentElement || element;
      },
      getLabel(element) {
        const container = this.getFieldContainer(element);
        if (!container) {
          return "";
        }
        const label = container.querySelector?.(":scope > .layui-form-label, .layui-form-label");
        const explicitLabel = getElementText(label);
        return getLayuiDerivedFieldLabel(element, container) || explicitLabel;
      },
      optionSelectors: ["dl > dd[lay-value]", "dd[lay-value]"]
    },
    {
      id: "ant-design",
      name: "Ant Design 控件",
      matches(element) {
        return Boolean(element?.closest?.(".ant-select,.ant-cascader-picker,.ant-picker,.ant-tree-select"));
      },
      fieldContainerSelector: ".ant-form-item,.ant-row.ant-form-item",
      choiceContainerSelector: ".ant-select,.ant-cascader-picker,.ant-picker,.ant-tree-select",
      labelSelector: ".ant-form-item-label,label",
      optionSelectors: [
        ".ant-select-item-option",
        ".ant-cascader-menu-item",
        ".ant-picker-cell",
        ".ant-tree-select-tree-node"
      ]
    },
    {
      id: "element-ui",
      name: "Element UI 控件",
      matches(element) {
        return Boolean(element?.closest?.(".el-select,.el-cascader,.el-date-editor,.el-tree-select"));
      },
      fieldContainerSelector: ".el-form-item",
      choiceContainerSelector: ".el-select,.el-cascader,.el-date-editor,.el-tree-select",
      labelSelector: ".el-form-item__label,label",
      optionSelectors: [".el-select-dropdown__item", ".el-cascader-node", ".el-picker-panel__content td"]
    },
    {
      id: "arco-design",
      name: "Arco Design 控件",
      matches(element) {
        return Boolean(element?.closest?.(".arco-select,.arco-cascader,.arco-picker"));
      },
      fieldContainerSelector: ".arco-form-item",
      choiceContainerSelector: ".arco-select,.arco-cascader,.arco-picker",
      labelSelector: ".arco-form-item-label,label",
      optionSelectors: [".arco-select-option", ".arco-cascader-node", ".arco-picker-cell"]
    },
    {
      id: "tdesign",
      name: "TDesign 控件",
      matches(element) {
        return Boolean(element?.closest?.(".t-select,.t-cascader,.t-date-picker"));
      },
      fieldContainerSelector: ".t-form__item",
      choiceContainerSelector: ".t-select,.t-cascader,.t-date-picker",
      labelSelector: ".t-form__label,label",
      optionSelectors: [".t-select-option", ".t-cascader__item", ".t-date-picker__cell"]
    }
  ];

  const AUTO_FILL_SECTION_ORDER = [
    "基本信息",
    "求职意向",
    "教育经历",
    "实习经历",
    "工作经历",
    "绩效考核",
    "专业资格",
    "项目经历",
    "社团工作",
    "学生工作",
    "奖惩情况",
    "外语能力",
    "计算机技能",
    "证书技能",
    "语言能力",
    "家庭信息",
    "培训经历",
    "论文著作",
    "专利成果",
    "自我描述",
    "有关声明",
    "其他信息",
    "自定义资料"
  ];

  const PROFILE_SECTION_ALIASES = {
    项目经历: ["项目经历", "项目经验", "实践活动"]
  };

  const PROFILE_LABEL_ALIASES = {
    姓名: ["真实姓名", "名字"],
    姓: ["姓氏", "中文姓"],
    名: ["名字", "中文名"],
    姓拼音: ["姓（拼音）", "姓氏拼音", "拼音姓", "Last Name Pinyin"],
    名拼音: ["名（拼音）", "名字拼音", "拼音名", "First Name Pinyin"],
    性别: ["男女性别"],
    英文名: ["英文姓名", "英文名称", "English Name"],
    出生日期: ["生日", "出生年月", "出生时间", "出生年月日"],
    第几届应届生: ["应届生届次", "届次", "毕业届次", "毕业年份"],
    国籍: ["国家", "国籍地区", "国籍国家或地区", "国籍（国家或地区）"],
    证件类型: ["身份证件类型", "证件类别", "证件号码类型"],
    证件号码类型: ["证件类型", "身份证件类型", "证件类别"],
    证件号码: ["身份证号", "身份证号码", "证件号", "身份证", "居民身份证号码"],
    婚姻状况: ["婚姻状态"],
    最高全日制学历: ["最高学历", "学历", "学历层次"],
    最高学历: ["最高全日制学历", "学历", "学历层次"],
    培养方式: ["教育类型", "学习形式", "办学形式", "统招统分"],
    教育类型: ["培养方式", "学习形式", "办学形式", "是否全日制"],
    学习形式: ["培养方式", "教育类型", "学历形式", "学习方式"],
    是否全日制: ["全日制", "是否为全日制"],
    专业排名: ["绩点排名", "GPA排名", "成绩排名", "排名"],
    绩点排名: ["专业排名", "GPA排名", "成绩排名", "排名"],
    班级排名: ["班级成绩排名"],
    无班级排名原因: ["没有班级排名的原因", "请写明没有班级排名的原因"],
    无专业排名原因: ["没有专业排名的原因", "请写明没有专业排名的原因"],
    GPA分数: ["GPA", "平均学分成绩", "平均学分成绩GPA", "绩点"],
    GPA满分: ["GPA满分", "绩点满分", "4分制"],
    身高厘米: ["身高", "净身高", "身高cm", "身高厘米"],
    体重公斤: ["体重", "体重kg", "体重公斤"],
    手机号码: ["手机号", "手机", "移动电话", "联系电话", "联系方式", "电话号码"],
    电话: ["手机号码", "手机号", "手机", "移动电话", "联系电话", "联系方式"],
    邮箱: ["电子邮箱", "邮件", "email", "e-mail"],
    确认邮箱: ["确认电子邮箱", "再次输入邮箱"],
    微信: ["微信号", "微信账号", "WeChat"],
    QQ: ["QQ号", "QQ号码"],
    民族: ["民族"],
    政治面貌: ["政治身份"],
    取得政治面貌时间: ["政治面貌取得时间", "入党时间", "入团时间"],
    户籍: ["户口所在地", "户籍所在地", "现户口所在地"],
    籍贯省: ["籍贯", "籍贯所在地", "籍贯省份"],
    籍贯市: ["籍贯", "籍贯所在地", "籍贯城市"],
    户籍所在地省: ["户籍", "户口所在地", "户籍所在地", "现户口所在地"],
    户籍所在地市: ["户籍", "户口所在地", "户籍所在地", "现户口所在地"],
    生源地: ["生源户口", "生源所在地", "生源地省", "生源地市"],
    现居住省: ["现居住地", "现居住城市", "当前居住地", "通讯地址"],
    现居住市: ["现居住地", "现居住城市", "当前居住地", "通讯地址"],
    现居住地: ["当前居住地", "居住地", "现居地", "所在地", "现居住城市"],
    "院校资质（最高学历）": ["院校资质", "最高学历院校资质", "学校类别", "院校类别"],
    最高英语证书: ["英语证书", "最高英语证书", "所获英语证书", "证书名称", "证书名称（技能名称）"],
    英语等级: ["英语水平", "外语等级", "英语级别", "CET-6", "英语六级"],
    现居住城市: ["现居住地", "当前居住城市", "居住城市", "所在地"],
    现居住详细地址: ["当前居住地详细地址", "现居住地址", "居住地址", "现住址", "当前地址"],
    通讯地址: ["通信地址", "邮寄地址", "收件地址"],
    联系地址: ["通讯地址", "通信地址", "邮寄地址", "收件地址"],
    邮编: ["邮政编码"],
    邮政编码: ["邮编"],
    现户口所在地: ["当前户口所在地", "户口所在地", "户籍所在地"],
    户口类型: ["户籍类型"],
    户籍类型: ["户口类型"],
    人事档案所在单位: ["档案所在单位", "档案单位"],
    血型: ["血液类型"],
    健康状况: ["身体状况"],
    高考时间: ["参加高考时间"],
    高考科目: ["文理科", "高考文理科"],
    工作年限: ["工作经验年限", "工作经验"],
    专业技术职称: ["技术职称", "职称"],
    紧急联系人电话: ["紧急联系人手机", "紧急联系人手机号", "紧急联系方式"],
    与紧急联系人关系: ["紧急联系人关系", "紧急联系人与本人关系"],
    意向岗位: ["目标岗位", "应聘岗位", "申请岗位", "投递岗位"],
    预计入职时间: ["可入职时间", "到岗时间"],
    当前薪资: ["目前薪资", "现薪资"],
    当前年收入: ["目前年收入", "现年收入", "当前年薪", "目前年薪"],
    期望工作城市: ["意向工作城市", "期望城市", "意向城市", "期望工作地点"],
    期望薪资: ["期望年薪", "期望月薪", "期望年收入", "期待薪资"],
    期望年收入: ["期望薪资", "期望年薪", "期待年收入"],
    面试城市: ["可面试城市"],
    面试站点: ["面试城市", "可面试城市", "面试地点", "面试地点城市"],
    简历来源: ["招聘信息来源", "信息来源"],
    即将获得最高学历: ["最高学历", "学历"],
    最高学历院校: ["最高学历学校", "毕业院校", "学校名称", "院校名称"],
    最高学历院系: ["最高学历学院", "学院名称", "院系", "院系名称"],
    本科毕业院校: ["本科院校", "本科毕业学校"],
    本科院系: ["本科专业院系", "本科院系名称"],
    专业名称: ["专业", "所学专业", "专业方向"],
    专业类型: ["专业", "专业名称", "所学专业", "学科专业"],
    学校名称: ["毕业院校", "院校名称", "学校"],
    学校所在国家地区: ["学校所在国家/地区", "学校国家地区", "学校国家"],
    学院名称: ["院系", "院系名称", "学院"],
    院系中文: ["院系（中文）", "院系", "学院名称", "院系名称"],
    学历: ["学历层次", "最高学历"],
    是否挂科: ["有无挂科", "是否有不及格科目", "是否有挂科"],
    学位: ["学位类型"],
    学历学位: ["学历/学位", "学历学位", "最高学历学位"],
    学号: ["学生证号"],
    学制: ["学习年限", "几年制"],
    城市: ["所在城市", "学校城市", "地点"],
    学校类别: ["院校类别", "学校类型"],
    录取批次: ["高考录取批次", "招生批次"],
    专业描述: ["专业介绍"],
    专业课程: ["主修课程", "核心课程"],
    研究方向: ["研究领域"],
    毕业论文: ["论文题目", "毕业论文题目"],
    成绩: ["学习成绩", "GPA分数", "平均成绩"],
    学历证书编号: ["学历证书号", "毕业证书编号"],
    学历证书号: ["学历证书编号", "毕业证书编号"],
    学位证书编号: ["学位证书号"],
    毕业状态: ["毕（结、肆）业", "毕结肆业"],
    "毕（结、肆）业": ["毕业状态", "毕结肆业"],
    辅导员姓名: ["辅导员"],
    辅导员联系方式: ["辅导员电话", "辅导员手机号"],
    是否为海外教育经历: ["是否海外教育经历", "是否海外学历", "海外教育经历"],
    开始时间: ["起始时间", "入学时间", "开始日期", "实践开始时间"],
    结束时间: ["截止时间", "毕业时间", "结束日期", "实践结束时间", "取得毕业证时间"],
    开始时间年: ["开始时间", "起始时间", "入学时间", "开始日期"],
    开始时间月: ["开始时间", "起始时间", "入学时间", "开始日期"],
    结束时间年: ["结束时间", "截止时间", "毕业时间", "结束日期"],
    结束时间月: ["结束时间", "截止时间", "毕业时间", "结束日期"],
    奖惩时间年: ["奖惩时间", "获奖时间", "奖励时间"],
    奖惩时间月: ["奖惩时间", "获奖时间", "奖励时间"],
    升学类型: ["本段经历升学类型", "入学方式"],
    高考所在地: ["高考省份", "高考所在地"],
    高考分数: ["高考成绩", "分数"],
    高考总分: ["高考总分数", "总分数"],
    是否有转学经历: ["转学经历", "有无转学经历"],
    单位名称: ["公司名称", "公司", "实习单位", "实践单位", "工作单位", "组织名称"],
    公司: ["公司名称", "单位名称", "实习单位", "工作单位"],
    类型: ["经历类型", "工作实习类型"],
    是否目标公司实习: ["是否为应聘单位实习", "是否为目标公司实习"],
    部门: ["部门名称", "所在部门"],
    职位名称: ["岗位", "岗位名称", "实习岗位", "职务名称", "角色"],
    职位: ["职务", "岗位", "职位名称", "项目角色", "担任角色", "家属职务", "亲属职务"],
    工作实习地点: ["工作/实习地点", "工作地点", "实习地点"],
    工作地点省: ["工作实习地点", "工作地点", "实习地点", "所在省市"],
    工作地点市: ["工作实习地点", "工作地点", "实习地点", "所在省市"],
    地点: ["工作地点", "实习地点", "项目地点", "培训地点"],
    工资: ["薪资", "实习工资", "月薪"],
    行业属性: ["行业", "所属行业"],
    行业: ["行业属性", "所属行业"],
    其他行业属性: ["请填写其他行业属性"],
    实习内容: ["实践内容", "工作内容", "工作内容描述", "职责描述", "工作职责", "项目描述"],
    工作内容: ["工作内容描述", "职责描述", "工作职责", "实践内容"],
    工作成果: ["实习成果", "工作业绩", "项目成果"],
    证明人: ["证明人姓名", "推荐人"],
    证明人姓名: ["证明人", "推荐人"],
    证明人职位: ["证明人职务"],
    证明人联系方式: ["证明人电话", "证明人手机号", "证明人及联系方式"],
    离职原因: ["离开原因"],
    项目名称: ["项目", "实践名称"],
    项目中职责: ["本人职责", "个人职责", "本人负责内容"],
    参与人数: ["项目人数", "团队人数"],
    项目内容: ["项目描述", "项目简述", "实践内容", "描述"],
    实践方式: ["实践类型", "活动方式"],
    本人职责: ["个人职责", "本人负责内容", "职责"],
    项目成果: ["项目产出", "实践成果", "项目绩效"],
    项目链接: ["项目地址", "作品链接"],
    实习周期: ["实习时间", "实习起止时间", "实习时长"],
    实习开始时间: ["实习开始", "开始时间", "入职时间"],
    特长爱好: ["爱好及专长", "兴趣爱好", "特长", "爱好"],
    语言能力: ["外语种类", "外语语种", "语言类型", "语种"],
    部门名称社团名称: ["部门名称", "社团名称", "组织名称"],
    组织名称: ["社团名称", "学生组织", "部门名称"],
    职务描述: ["职责", "活动描述", "工作职责或活动描述"],
    奖惩时间: ["获奖时间", "奖励时间"],
    奖惩解除时间: ["解除时间", "处分解除时间"],
    奖惩名称: ["获奖名称", "奖励名称", "奖项名称", "荣誉名称", "奖项"],
    颁奖单位: ["授奖单位", "奖惩单位", "颁发单位"],
    奖惩单位: ["颁奖单位", "授奖单位", "授予单位"],
    奖励等级: ["奖项等级", "奖励级别", "奖惩层级", "获奖级别"],
    奖惩层级: ["奖励等级", "奖项等级", "奖励级别", "获奖级别"],
    奖惩描述: ["获奖描述", "奖励描述", "奖惩原因"],
    奖惩原因: ["奖惩描述", "获奖描述", "奖励描述"],
    证书: ["证书名称", "资格证书", "技能证书"],
    证书名称技能名称: ["证书名称（技能名称）", "证书名称", "技能名称"],
    证书类别: ["证书类型", "资格证书类别"],
    外语种类: ["外语语种", "语言类型", "语种"],
    获得时间: ["获取日期", "取得时间", "证书取得时间", "获得日期"],
    证书获得时间: ["证书取得时间", "获得时间", "取得时间"],
    其他类请填写: ["其他证书", "其他证书名称"],
    证书颁发单位: ["发证机构", "颁发单位"],
    授予单位: ["颁发单位", "证书颁发单位", "发证机构"],
    发证单位: ["授予单位", "颁发单位", "证书颁发单位", "发证机构"],
    证书编号: ["证书号码"],
    证书说明: ["证书描述", "证书备注"],
    获取日期: ["取得时间", "证书取得时间", "获得日期"],
    竞赛项目: ["竞赛名称", "比赛项目"],
    竞赛奖项: ["奖项", "竞赛级别"],
    竞赛时间: ["比赛时间", "获奖时间"],
    计算机水平: ["计算机能力", "计算机技能"],
    其它技能: ["其他技能", "技能特长"],
    语言类型: ["外语语种", "语种"],
    掌握程度: ["熟练程度", "语言水平", "外语水平"],
    听说: ["听说能力"],
    读写: ["读写能力"],
    培训名称: ["培训项目", "课程名称"],
    培训机构: ["培训单位"],
    培训地点: ["培训城市", "培训地址"],
    培训课程: ["培训内容", "课程内容"],
    培训获得证书: ["培训证书"],
    培训内容: ["培训描述"],
    刊物名称: ["期刊名称", "发表刊物"],
    刊物层级: ["期刊层级"],
    论文名称: ["论文题目", "文章名称"],
    论文描述: ["论文摘要", "论文说明"],
    专利名称: ["专利题目"],
    专利编号: ["专利号"],
    专利类型: ["发明专利", "实用新型"],
    专利成果: ["专利描述", "专利说明"],
    与本人关系: ["关系", "亲属关系"],
    亲属在应聘单位工作: ["是否存在亲属在应聘单位工作"],
    工作单位: ["家属工作单位", "亲属工作单位"],
    部门及职位: ["家属职务", "亲属职务", "职务"],
    联系电话: ["家属联系电话", "亲属联系电话"],
    有无工作经历: ["是否有工作经历", "工作经历"],
    是否退休: ["有无退休", "退休情况"],
    考核年度: ["绩效年度", "年度考核"],
    绩效考核等级: ["考核等级", "年度绩效考核等级"],
    年度绩效排名: ["绩效排名", "考核排名", "排名"],
    绩效证明人: ["考核证明人", "证明人"],
    绩效证明人联系方式: ["证明人联系方式", "联系方式", "联系电话"],
    绩效说明: ["考核说明", "绩效评语"],
    兴趣爱好: ["爱好", "特长爱好具体内容"],
    特长: ["个人特长", "技能特长"],
    社会校园活动: ["社会/校园活动", "校园活动", "社会活动"],
    受到奖励学术成果: ["受到奖励/学术成果", "奖励学术成果", "奖励成果", "学术成果"],
    工作地点是否服从调剂: ["是否接受调剂", "是否服从调剂", "接受调剂"],
    是否同意部门岗位调配: ["是否同意部门/岗位调配", "部门岗位调配", "岗位调配"],
    首选工作地点: ["第一工作地点", "意向工作地点"],
    首选工作地点是否接受调剂: ["工作地点是否接受调剂", "地点调剂"],
    是否存在亲属在应聘单位工作: ["亲属在应聘单位工作", "是否存在亲属在本行工作情况", "亲属在本行工作", "亲属在我行工作"],
    是否患有影响工作的疾病: ["是否患有传染病高血压心脏病糖尿病肾炎精神病等影响工作的疾病", "是否患有重大疾病"],
    是否在第三方企业任兼职或持有企业股权: ["是否在第三方企业任兼职或持有企业股权", "任兼职或持有企业股权"],
    是否存在曾被用人单位辞退情况: ["曾被用人单位辞退情况", "是否曾被用人单位辞退"],
    是否享有境外长期或永久居留权: ["是否享有境外国家或地区长期或永久居留权", "境外长期或永久居留权"]
  };

  // Some ATS pages place personal questions under a generic “自我描述”
  // heading. Keep their logical source category explicit so they can still
  // consume the matching basic, education, certificate, or internship data.
  function getPersonalFieldKind(label) {
    const key = normalizeMatchKey(label || "");
    if (!key) return "";
    if (/自我评价|自我描述|自我介绍/.test(key)) return "selfEvaluation";
    if (/特长爱好|爱好及专长|兴趣爱好/.test(key)) return "hobby";
    if (/实习周期/.test(key)) return "internshipPeriod";
    if (/实习开始时间/.test(key)) return "internshipStart";
    if (/最高英语证书|所获英语证书|英语证书/.test(key)) return "highestEnglishCertificate";
    if (/英语等级|英语水平|外语等级/.test(key)) return "englishLevel";
    if (/院校资质.*最高学历|最高学历.*院校资质/.test(key)) return "highestSchoolQualification";
    // 智易的个人信息区会直接使用“最高学历”，不能让通用的
    // “学历”关键词把它误判成教育经历。优先绑定基本信息中的最高学历。
    if (/最高学历|最高全日制学历/.test(key)) return "highestEducation";
    if (/第几届应届生|应届生届次|毕业届次|届次/.test(key)) return "graduateCohort";
    if (/身高|净身高/.test(key)) return "height";
    if (/体重/.test(key)) return "weight";
    if (/招聘信息来源|简历来源|信息来源/.test(key)) return "profileSource";
    if (/面试站点|面试地点|面试城市|可面试城市/.test(key)) return "interviewSite";
    if (/姓名|出生日期|手机号码|手机号|邮箱|证件号码|身份证号|国籍|籍贯|政治面貌|民族|户口所在地|户籍所在地|户籍地址|现居住地|现居住城市/.test(key)) {
      return "basic";
    }
    return "";
  }

  function isPersonalFieldLabel(label) {
    return Boolean(getPersonalFieldKind(label));
  }

  function formatMissingProfileFields(fields) {
    const labels = Array.from(new Set((fields || []).map((value) => normalizeText(value, 80)).filter(Boolean)));
    return labels.length ? `资料待补全：${labels.join("、")}` : "";
  }

  function appendMissingProfileReminder(message, fields) {
    const reminder = formatMissingProfileFields(fields);
    const base = normalizeText(message || "", 260);
    return reminder ? (base ? `${base}；${reminder}` : reminder) : base;
  }

  function collectMissingProfileFields(plan) {
    const fields = Array.isArray(plan?.scan?.fields) ? plan.scan.fields : [];
    const candidatesByFieldId = new Map(
      (Array.isArray(plan?.candidates) ? plan.candidates : [])
        .map((candidate) => [candidate.fieldId, candidate])
    );
    const missing = [];
    for (const field of fields) {
      if (!field?.canFill || field.hasCurrentValue) {
        continue;
      }
      const label = field.inferredLabel || inferFieldLabel(field);
      if (!isPersonalFieldLabel(label)) {
        continue;
      }
      const category = field.inferredCategory || inferMatchSection(field);
      if (category === "家庭信息" || isLikelyFamilyMemberContext(field, label)) {
        continue;
      }
      const candidate = candidatesByFieldId.get(field.fieldId);
      if (!candidate?.value) {
        missing.push(label);
      }
    }
    return Array.from(new Set(missing.map((label) => normalizeText(label, 80)).filter(Boolean)));
  }

  function normalizeText(value, maxLength = 260) {
    const text = String(value || "")
      .replace(/\s+/g, " ")
      .replace(/\u00a0/g, " ")
      .trim();
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
  }

  function isVisible(element) {
    if (!element || !(element instanceof Element)) {
      return false;
    }

    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
      return false;
    }

    const rect = element.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      return false;
    }

    return true;
  }

  function getPhoenixDateRoot(element) {
    if (!element?.closest || !/(^|\.)zhiye\.com$/i.test(location.hostname)) return null;

    // The original Zhiye form used `.form-item--phoenix > .phoenix-select` for
    // month-only start/end fields. A generic Phoenix select uses the same
    // wrapper, so only classify it as a date when its field label or calendar
    // markers identify a date field.
    const legacyRoot = getPhoenixLegacySelectRoot(element);
    if (legacyRoot && isPhoenixLegacyDateRoot(legacyRoot)) {
      return legacyRoot;
    }

    // Current Phoenix date controls render a `.phoenix-date-picker` around a
    // `phoenix-calendar-input-wrap` input. The birth-date field uses the same
    // control, so do not restrict matching to start/end labels.
    const datePicker = element.closest(".phoenix-date-picker") ||
      element.closest(".form-item,.form-item--phoenix")?.querySelector(".phoenix-date-picker");
    return datePicker || null;
  }

  function getPhoenixLegacySelectRoot(element) {
    if (!element?.closest || !/(^|\.)zhiye\.com$/i.test(location.hostname)) return null;
    const root = element.closest(".form-item--phoenix") ||
      (element.closest(".phoenix-checkbox") ? element.closest(".fields-col")?.querySelector(".form-item--phoenix") : null);
    return root?.querySelector?.(".phoenix-select") ? root : null;
  }

  function getPhoenixLegacySelectLabel(root) {
    const container = root?.closest?.(".form-item,.form-item--phoenix,.fields-col") || root;
    return normalizeFieldLabelText(getElementText(container?.querySelector?.(".form-item__text,.form-item__title,label")));
  }

  function isPhoenixLegacyDateRoot(root) {
    if (!root) return false;
    const label = getPhoenixLegacySelectLabel(root);
    const fieldColumn = root.closest?.(".fields-col") || root;
    return /日期|时间|年月|有效期/.test(label) || Boolean(root.querySelector?.(
      ".phoenix-calendar-input-wrap,.phoenix-date-time-picker-input-wrap,.phoenix-calendar,.phoenix-checkbox"
    )) || Boolean(fieldColumn.querySelector?.(".phoenix-checkbox"));
  }

  function getPhoenixDateInput(root) {
    for (const selector of [
      ".phoenix-calendar-input-wrap input",
      ".phoenix-date-time-picker-input-wrap input",
      'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])',
      "textarea"
    ]) {
      const input = root?.querySelector?.(selector);
      if (input) return input;
    }
    return null;
  }

  function getPhoenixDateSurface(root) {
    for (const selector of [
      ".phoenix-calendar-input-wrap",
      ".phoenix-date-time-picker-input-wrap",
      ".phoenix-select",
      ".phoenix-date-picker"
    ]) {
      const surface = root?.querySelector?.(selector);
      if (surface) return surface;
    }
    return root || null;
  }

  function getPhoenixDateFieldContainer(root) {
    return root?.closest?.(".form-item,.form-item--phoenix,.fields-col") || root || null;
  }

  function getPhoenixDateLabel(root) {
    const container = getPhoenixDateFieldContainer(root);
    return getElementText(container?.querySelector?.(".form-item__text,.form-item__title,label"));
  }

  function getPhoenixAutocompleteRoot(element) {
    if (!element?.closest || !/(^|\.)zhiye\.com$/i.test(location.hostname)) return null;
    const modernRoot = element.closest(".phoenix-auto-complete-container");
    if (modernRoot?.querySelector?.('input:not([type="hidden"])')) {
      return modernRoot;
    }

    // Older Phoenix pages use the same `.form-item--phoenix` wrapper for
    // ordinary selects. Once date fields are excluded above, these controls
    // can share the choice-field writer and option matching logic.
    const legacyRoot = getPhoenixLegacySelectRoot(element);
    return legacyRoot && !isPhoenixLegacyDateRoot(legacyRoot) ? legacyRoot : null;
  }

  function getPhoenixAutocompleteInput(root) {
    return root?.querySelector?.('input:not([type="hidden"]),textarea,[contenteditable="true"]') || null;
  }

  function getPhoenixAutocompleteFieldContainer(root) {
    return root?.closest?.(".form-item,.form-item--phoenix,.fields-col") || root || null;
  }

  function getPhoenixAutocompleteLabel(root) {
    const container = getPhoenixAutocompleteFieldContainer(root);
    return getElementText(container?.querySelector?.(".form-item__text,.form-item__title,label"));
  }

  function getPhoenixPresentCheckbox(root) {
    const box = root?.closest(".fields-col")?.querySelector(".phoenix-checkbox");
    return getElementText(box?.querySelector(".phoenix-checkbox__text")) === "至今"
      ? box.querySelector('input[type="checkbox"]') : null;
  }

  function readPhoenixDate(root) {
    if (getPhoenixPresentCheckbox(root)?.checked) return "至今";
    const input = getPhoenixDateInput(root);
    const display = root?.querySelector?.(".phoenix-select__tipEle") ||
      root?.querySelector?.(".phoenix-calendar-input-wrap") ||
      root?.querySelector?.(".phoenix-date-picker-special-text");
    const text = normalizeDateValue(input?.value || getElementText(display));
    return /^\d{4}-\d{2}(?:-\d{2})?$/.test(text) ? text : "";
  }

  function getPhoenixSection(element) {
    const root = element?.closest?.(".form[name]");
    const labels = Array.from(root?.querySelectorAll(".form-item__text") || []).map(getElementText);
    if (labels.includes("项目名称")) return "项目经历";
    if (labels.includes("学校名称")) return "教育经历";
    if (labels.includes("公司名称")) return "工作经历";
    if (labels.includes("学校组织/团体名称") || (labels.includes("职务名称") && labels.includes("职责和成就"))) {
      return "社团工作";
    }
    // Zhiye's internship card uses 单位名称/职位名称 and often has no
    // visible section heading.  The dedicated 实习内容 label is the stable
    // discriminator; without it the card is treated as an unscoped form and
    // its values can be matched against project records.
    if (labels.includes("实习内容") || (labels.includes("单位名称") && labels.includes("职位名称") && labels.includes("开始时间"))) {
      return "实习经历";
    }
    return "";
  }

  function getFieldControlAdapter(element) {
    if (!element || !(element instanceof Element)) {
      return null;
    }

    return CONTROL_ADAPTERS.find((adapter) => {
      try {
        return Boolean(adapter.matches?.(element));
      } catch {
        return false;
      }
    }) || null;
  }

  function getMokaSdDropdownRoot(element) {
    if (!element || !(element instanceof Element)) {
      return null;
    }
    if (element.matches?.("[class*='sd-Dropdown-container-']")) {
      return element;
    }
    return element.closest?.("[class*='sd-Dropdown-container-']") || null;
  }

  function isMokaSdSelectField(element) {
    const root = getMokaSdDropdownRoot(element);
    const surface = root?.querySelector?.("label[class*='sd-Select-container-']");
    const field = root?.closest?.("[class*='apply-field-']");
    if (!root || !surface || !field || !surface.querySelector?.("[class*='sd-Select-addon-']")) {
      return false;
    }

    const fieldClass = String(field.className || "");
    if (/date_info|(?:^|\s)Select-|select_info|bool_info/.test(fieldClass)) {
      return true;
    }

    const heading = normalizeFieldLabelText(
      getElementText(field.querySelector?.(":scope > [class*='title-']"))
    );
    return /^(学校名称|院校名称|毕业院校|专业名称|所学专业)$/.test(heading);
  }

  function getLogicalControlElement(element) {
    const adapter = getFieldControlAdapter(element);
    if (!adapter?.getLogicalElement && adapter?.choiceContainerSelector) {
      try {
        return element.closest(adapter.choiceContainerSelector) || element;
      } catch {
        return element;
      }
    }
    if (!adapter?.getLogicalElement) {
      return element;
    }
    try {
      return adapter.getLogicalElement(element) || element;
    } catch {
      return element;
    }
  }

  function getControlSurfaceElement(element) {
    const adapter = getFieldControlAdapter(element);
    if (!adapter?.getSurfaceElement) {
      return element;
    }
    try {
      return adapter.getSurfaceElement(element) || element;
    } catch {
      return element;
    }
  }

  function isControlVisible(element) {
    if (!element || !(element instanceof Element)) {
      return false;
    }

    return isVisible(element) || isVisible(getControlSurfaceElement(element));
  }

  function getControlAdapterContainer(element) {
    const adapter = getFieldControlAdapter(element);
    if (!adapter) {
      return null;
    }

    if (adapter.getFieldContainer) {
      try {
        return adapter.getFieldContainer(element) || null;
      } catch {
        return null;
      }
    }

    if (adapter.fieldContainerSelector) {
      try {
        return element.closest(adapter.fieldContainerSelector);
      } catch {
        return null;
      }
    }

    return null;
  }

  function getControlAdapterChoiceContainer(element) {
    const adapter = getFieldControlAdapter(element);
    if (!adapter) {
      return null;
    }

    if (adapter.getChoiceContainer) {
      try {
        return adapter.getChoiceContainer(element) || null;
      } catch {
        return null;
      }
    }

    if (adapter.choiceContainerSelector) {
      try {
        return element.closest(adapter.choiceContainerSelector);
      } catch {
        return null;
      }
    }

    return null;
  }

  function getControlAdapterLabel(element) {
    const adapter = getFieldControlAdapter(element);
    if (!adapter) {
      return "";
    }

    if (adapter.getLabel) {
      try {
        return normalizeFieldLabelText(adapter.getLabel(element));
      } catch {
        return "";
      }
    }

    const container = getControlAdapterContainer(element);
    if (!container || !adapter.labelSelector) {
      return "";
    }

    try {
      const label = container.querySelector(adapter.labelSelector);
      return normalizeFieldLabelText(getElementText(label));
    } catch {
      return "";
    }
  }

  function getControlAdapterOptionSelectors(element) {
    const adapter = getFieldControlAdapter(element);
    return Array.isArray(adapter?.optionSelectors) ? adapter.optionSelectors : [];
  }

  function findLayuiProxyForSelect(select) {
    if (!(select instanceof HTMLSelectElement)) {
      return null;
    }

    const parent = select.parentElement;
    if (!parent) {
      return null;
    }

    const directSibling = Array.from(parent.children).find((child) => child.matches?.(".layui-form-select"));
    if (directSibling) {
      return directSibling;
    }

    const inline = select.closest(".layui-input-inline,.layui-input-block,.layui-inline");
    if (!inline) {
      return null;
    }

    return inline.querySelector?.(":scope > .layui-form-select") || inline.querySelector?.(".layui-form-select") || null;
  }

  function findLayuiSelectForProxy(element) {
    const proxy = element?.closest?.(".layui-form-select");
    if (!proxy) {
      return null;
    }

    const parent = proxy.parentElement;
    if (!parent) {
      return null;
    }

    const directSibling = Array.from(parent.children).find((child) => child instanceof HTMLSelectElement);
    if (directSibling) {
      return directSibling;
    }

    const inline = proxy.closest(".layui-input-inline,.layui-input-block,.layui-inline");
    return inline?.querySelector?.("select") || null;
  }

  function getLayuiDerivedFieldLabel(element, container) {
    const select = element instanceof HTMLSelectElement ? element : findLayuiSelectForProxy(element);
    const key = normalizeText(select?.name || select?.id || "", 100).toLowerCase();
    const suffix = /province|provice/.test(key) ? "省" : /city/.test(key) ? "市" : "";
    if (!suffix) {
      return "";
    }

    const semanticBases = [
      [/native/, "籍贯"],
      [/regist|hukou|household/, "户籍所在地"],
      [/living|residence|contact/, "现居住"],
      [/work/, "工作地点"],
      [/source/, "生源地"],
      [/exam|gaokao/, "高考所在地"]
    ];
    const knownBase = semanticBases.find(([pattern]) => pattern.test(key))?.[1];
    if (knownBase) {
      return `${knownBase}${suffix}`;
    }

    const row = container?.closest?.(".layui-form-item");
    const columns = row
      ? Array.from(row.children).filter((child) => child.matches?.("[class*='layui-col-'],.layui-inline"))
      : [];
    const columnIndex = columns.indexOf(container);
    const preceding = columns
      .slice(0, columnIndex >= 0 ? columnIndex + 1 : columns.length)
      .map((column) => getElementText(column.querySelector?.(".layui-form-label")))
      .filter(Boolean)
      .pop();
    return preceding ? `${normalizeFieldLabelText(preceding)}${suffix}` : "";
  }

  function sleep(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  function getPageKey() {
    return `${location.origin}${location.pathname}${location.search}`;
  }

  function detectSiteAdapter() {
    const hostname = location.hostname || "";
    const href = location.href || "";
    const scoreMap = new Map();

    for (const adapter of SITE_ADAPTERS) {
      let score = 0;
      const hasUrlPattern = Boolean(adapter.urlPattern);
      const urlMatched = hasUrlPattern && (adapter.urlPattern.test(hostname) || adapter.urlPattern.test(href));

      // A host-specific adapter must not be activated by a generic class name
      // alone.  For example, `.layui-form-item` previously triggered the
      // Zhiye adapter through `[class*='form-item']` on unrelated pages.
      if (hasUrlPattern && !urlMatched) {
        continue;
      }

      if (urlMatched) {
        score += 70;
      }

      for (const indicator of adapter.indicators || []) {
        try {
          if (document.querySelector(indicator)) {
            score += 8;
          }
        } catch {
          // Ignore invalid selectors from future compatibility probes.
        }
      }

      if (score > 0) {
        scoreMap.set(adapter, { score, urlMatched, hasUrlPattern });
      }
    }

    const scored = Array.from(scoreMap.entries())
      .map(([adapter, meta]) => {
        const baseConfidence = adapter.confidence || 0.7;
        return {
          ...adapter,
          confidence: Math.min(0.99, baseConfidence + meta.score / 100)
        };
      })
      .sort((left, right) => right.confidence - left.confidence);

    return scored[0] || null;
  }

  function getActiveSiteAdapter() {
    if (currentSiteAdapter) {
      return currentSiteAdapter;
    }
    currentSiteAdapter = detectSiteAdapter();
    return currentSiteAdapter;
  }

  function getAdapterSelectors() {
    const adapter = getActiveSiteAdapter();
    return {
      containerSelector: adapter?.containerSelector || "",
      labelSelector: adapter?.labelSelector || "",
      sectionSelector: adapter?.sectionSelector || "",
      repeatItemSelector: adapter?.repeatItemSelector || "",
      saveLabels: Array.isArray(adapter?.saveLabels) ? adapter.saveLabels : ["保存"],
      editLabels: Array.isArray(adapter?.editLabels) ? adapter.editLabels : ["编辑", "修改"]
    };
  }

  function getAdapterActionLabels(action) {
    const selectors = getAdapterSelectors();
    if (action === "save") {
      return selectors.saveLabels;
    }
    if (action === "edit") {
      return selectors.editLabels;
    }
    return ["保存"];
  }

  function normalizeProgressPercent(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return 0;
    }
    return Math.max(0, Math.min(100, Math.round(number)));
  }

  function setAutofillProgress(stage, percent, detail = "", active = true) {
    const normalizedStage = normalizeText(stage || "", 80);
    const now = Date.now();
    const previous = autofillProgress || {};
    const sameStage = previous.active && previous.stage === normalizedStage;
    const step = getAutofillProgressStep(normalizedStage);
    autofillProgress = {
      active: Boolean(active),
      stage: normalizedStage,
      percent: normalizeProgressPercent(percent),
      detail: normalizeText(detail || "", 160),
      stepIndex: step.index,
      stepTotal: step.total,
      stepLabel: step.label,
      startedAt: previous.active && previous.startedAt ? previous.startedAt : now,
      stageStartedAt: sameStage && previous.stageStartedAt ? previous.stageStartedAt : now
    };

    renderFloatingStatus();
    if (profilePanelVisible) {
      renderProfilePanel();
    }
    updateAutofillProgressTimer();
  }

  function clearAutofillProgress(detail = "") {
    autofillInProgress = false;
    autofillProgress = { active: false, stage: "", percent: 0, detail: normalizeText(detail || "", 160) };
    renderFloatingStatus();
    if (profilePanelVisible) {
      renderProfilePanel();
    }
    updateAutofillProgressTimer();
  }

  function getAutofillProgressStep(stage) {
    const text = normalizeText(stage || "", 80);
    if (/读取本机资料|开始填写|扫描页面并准备填写/.test(text)) {
      return { index: 1, total: 6, label: "准备本机资料" };
    }
    if (/扫描当前页面/.test(text)) {
      return { index: 2, total: 6, label: "扫描当前页面" };
    }
    if (/整理表单字段|AI 识别表单字段/.test(text)) {
      return { index: 3, total: 6, label: "整理表单字段" };
    }
    if (/AI 匹配字段|本地兜底匹配|匹配本地资料|AI 识别字段|整理匹配结果|匹配完成/.test(text)) {
      return { index: 4, total: 6, label: "匹配你的资料" };
    }
    if (/填写匹配项/.test(text)) {
      return { index: 5, total: 6, label: "填写表单" };
    }
    return { index: 6, total: 6, label: "完成复核" };
  }

  function updateAutofillProgressTimer() {
    if (autofillProgress.active) {
      if (!autofillProgressTimer) {
        autofillProgressTimer = window.setInterval(() => {
          renderFloatingStatus();
          if (profilePanelVisible) {
            renderProfilePanel();
          }
        }, 1000);
      }
      return;
    }

    if (autofillProgressTimer) {
      window.clearInterval(autofillProgressTimer);
      autofillProgressTimer = null;
    }
  }

  function formatElapsedTime(startedAt) {
    const start = Number(startedAt || 0);
    if (!start) {
      return "";
    }
    const seconds = Math.max(0, Math.floor((Date.now() - start) / 1000));
    if (seconds < 1) {
      return "";
    }
    if (seconds < 60) {
      return `${seconds} 秒`;
    }
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return rest ? `${minutes} 分 ${rest} 秒` : `${minutes} 分钟`;
  }

  function createAutofillAiState() {
    return {
      status: "idle",
      attempted: false,
      used: false,
      fallback: false,
      currentPhase: "",
      usedPhases: [],
      fallbackReasons: [],
      notes: []
    };
  }

  function resetAutofillAiState() {
    autofillAiState = createAutofillAiState();
  }

  function appendUniqueText(list, value, maxLength = 160) {
    const text = normalizeText(value || "", maxLength);
    if (!text || list.includes(text)) {
      return list;
    }
    return [...list, text];
  }

  function normalizeAutofillAiReason(reason) {
    return {
      phase: normalizeText(reason?.phase || "", 60),
      reason: normalizeText(reason?.reason || "", 180)
    };
  }

  function formatErrorMessage(error) {
    if (!error) {
      return "未知错误";
    }
    if (error instanceof Error) {
      return normalizeText(error.message || String(error), 180);
    }
    return normalizeText(String(error), 180);
  }

  function setAutofillAiTrying(phase) {
    autofillAiState = {
      ...autofillAiState,
      status: "trying",
      attempted: true,
      currentPhase: normalizeText(phase || "AI 优先匹配", 60)
    };
    renderFloatingStatus();
  }

  function setAutofillAiUsed(phase) {
    const phaseText = normalizeText(phase || "AI 优先匹配", 60);
    autofillAiState = {
      ...autofillAiState,
      status: autofillAiState.fallback ? "partial" : "used",
      attempted: true,
      used: true,
      currentPhase: "",
      usedPhases: appendUniqueText(autofillAiState.usedPhases || [], phaseText, 60)
    };
    renderFloatingStatus();
  }

  function setAutofillAiNoResult(phase, note) {
    const phaseText = normalizeText(phase || "AI 优先匹配", 60);
    const notes = appendUniqueText(autofillAiState.notes || [], note || `${phaseText}未返回可用建议`, 160);
    let status = "no-result";
    if (autofillAiState.used && autofillAiState.fallback) {
      status = "partial";
    } else if (autofillAiState.used) {
      status = "used";
    } else if (autofillAiState.fallback) {
      status = "fallback";
    }
    autofillAiState = {
      ...autofillAiState,
      status,
      attempted: true,
      currentPhase: "",
      notes
    };
    renderFloatingStatus();
  }

  function setAutofillAiFallback(phase, error) {
    const phaseText = normalizeText(phase || "AI 优先匹配", 60);
    const reason = formatErrorMessage(error);
    const nextReason = normalizeAutofillAiReason({ phase: phaseText, reason });
    const fallbackReasons = (autofillAiState.fallbackReasons || [])
      .map(normalizeAutofillAiReason)
      .filter((item) => item.phase || item.reason);
    const duplicate = fallbackReasons.some((item) => item.phase === nextReason.phase && item.reason === nextReason.reason);
    autofillAiState = {
      ...autofillAiState,
      status: autofillAiState.used ? "partial" : "fallback",
      attempted: true,
      fallback: true,
      currentPhase: "",
      fallbackReasons: duplicate ? fallbackReasons : [...fallbackReasons, nextReason]
    };
    renderFloatingStatus();
  }

  function formatAutofillAiFallbackReasons(state = autofillAiState) {
    const reasons = Array.isArray(state?.fallbackReasons) ? state.fallbackReasons : [];
    return reasons
      .map(normalizeAutofillAiReason)
      .filter((item) => item.phase || item.reason)
      .map((item) => `${item.phase || "AI"}：${item.reason || "未知错误"}`)
      .join("；");
  }

  function getAutofillAiStatusText(state = autofillAiState) {
    const status = state?.status || "idle";
    const usedPhases = Array.isArray(state?.usedPhases) ? state.usedPhases.filter(Boolean).join("、") : "";
    const fallbackReasons = formatAutofillAiFallbackReasons(state);

    if (status === "trying") {
      return `正在用 AI 优先匹配字段，只发送字段名称，不发送资料值。`;
    }
    if (state?.used && state?.fallback) {
      return `AI 已优先匹配部分字段，本地规则已兜底补齐其余字段${fallbackReasons ? `：${fallbackReasons}` : ""}。`;
    }
    if (state?.used) {
      return `AI 已优先匹配字段${usedPhases ? `（${usedPhases}）` : ""}，资料取值和填写仍在本机完成。`;
    }
    if (state?.fallback) {
      return `AI 不可用，已切换到本地规则兜底${fallbackReasons ? `：${fallbackReasons}` : ""}。`;
    }
    if (status === "no-result" || state?.attempted) {
      return "AI 没有提供可用匹配，本次改用本地规则兜底。";
    }
    return "未调用 AI，本次使用本地规则。";
  }

  function getAutofillModeBadgeText(state = autofillAiState, progress = autofillProgress) {
    const status = state?.status || "idle";
    const phase = normalizeText(state?.currentPhase || "", 60);
    const stage = normalizeText(progress?.stage || "", 80);
    const localMatching = /本地兜底匹配|匹配本地资料|整理匹配结果|匹配完成/.test(stage);

    if (status === "trying") {
      if (/字段理解/.test(phase)) {
        return "AI · 正在优先匹配字段";
      }
      return "AI · 正在分析页面结构";
    }
    if (state?.used && state?.fallback) {
      return localMatching ? "AI 优先匹配 · 本地规则兜底" : "AI 优先匹配 + 本地规则兜底";
    }
    if (state?.fallback) {
      return localMatching ? "本地规则兜底 · AI 不可用" : "本地规则 · AI 不可用";
    }
    if (status === "no-result" || (state?.attempted && !state?.used && !state?.fallback)) {
      return localMatching ? "本地规则兜底 · AI 无匹配" : "本地规则 · AI 无可用匹配";
    }
    if (state?.used) {
      if (/填写匹配项/.test(stage)) {
        return "本地填写 · AI 不参与填写";
      }
      if (localMatching) {
        return "AI 优先匹配 · 本地整理结果";
      }
      return "AI 优先匹配 · 本地继续处理";
    }
    if (/读取本机资料|开始填写|扫描页面并准备填写/.test(stage)) {
      return "本地规则 · 正在读取资料";
    }
    if (/扫描当前页面/.test(stage)) {
      return "本地规则 · 正在扫描页面";
    }
    if (/整理表单字段/.test(stage)) {
      return "本地规则 · 正在整理字段";
    }
    if (localMatching) {
      return "正在用本地规则匹配";
    }
    if (/填写匹配项/.test(stage)) {
      return "本地填写 · 不自动提交";
    }
    return "本地规则 · 正在处理";
  }

  function getAutofillCompletionBadgeText(state = autofillAiState) {
    const status = state?.status || "idle";
    if (state?.used && state?.fallback) {
      return "AI 优先匹配 + 本地规则兜底";
    }
    if (state?.used) {
      return "AI 优先匹配 · 本地填写";
    }
    if (state?.fallback) {
      return "本地规则完成 · AI 不可用";
    }
    if (status === "no-result" || state?.attempted) {
      return "本地规则完成 · AI 无建议";
    }
    return "本地规则完成";
  }

  function sanitizeAutofillAiUsage(aiUsage = {}) {
    const fallbackReasons = Array.isArray(aiUsage.fallbackReasons)
      ? aiUsage.fallbackReasons.map(normalizeAutofillAiReason).filter((item) => item.phase || item.reason)
      : [];
    const usedPhases = Array.isArray(aiUsage.usedPhases)
      ? aiUsage.usedPhases.map((phase) => normalizeText(phase || "", 60)).filter(Boolean)
      : [];
    const notes = Array.isArray(aiUsage.notes)
      ? aiUsage.notes.map((note) => normalizeText(note || "", 160)).filter(Boolean)
      : [];
    const state = {
      status: normalizeText(aiUsage.status || "idle", 40),
      attempted: Boolean(aiUsage.attempted),
      used: Boolean(aiUsage.used),
      fallback: Boolean(aiUsage.fallback),
      currentPhase: normalizeText(aiUsage.currentPhase || "", 60),
      usedPhases,
      fallbackReasons,
      notes
    };
    const fallbackReason = normalizeText(aiUsage.fallbackReason || formatAutofillAiFallbackReasons(state), 260);
    return {
      ...state,
      fallbackReason,
      message: normalizeText(aiUsage.message || getAutofillAiStatusText(state), 300)
    };
  }

  function getAutofillAiSnapshot() {
    return sanitizeAutofillAiUsage(autofillAiState);
  }

  function getDisplayedProgressPercent() {
    if (!autofillProgress.active) {
      return 0;
    }
    const startedAt = Number(autofillProgress.startedAt || autofillProgress.stageStartedAt || Date.now());
    const elapsedSeconds = Math.max(0, (Date.now() - startedAt) / 1000);
    const eased = 1 - Math.exp(-elapsedSeconds / 75);
    return Math.min(96, normalizeProgressPercent(eased * 96));
  }

  function getAutofillProgressTitle() {
    if (!autofillProgress.active) {
      return "";
    }
    const label = autofillProgress.stepLabel || autofillProgress.stage || "处理当前页面";
    return /^正在/.test(label) ? label : `正在${label}`;
  }

  function getAutofillProgressDetail() {
    if (!autofillProgress.active) {
      return "";
    }
    const detail = autofillProgress.detail || "正在处理当前网页，请勿重复点击。";
    const elapsed = formatElapsedTime(autofillProgress.stageStartedAt);
    const isAiTrying = autofillAiState.status === "trying";
    if (isAiTrying && elapsed) {
      return `${detail}，正在等待 API 响应，已等待 ${elapsed}`;
    }
    if (elapsed) {
      return `${detail}，已处理 ${elapsed}`;
    }
    return detail;
  }

  function startAutofillRun(stage = "处理中") {
    if (autofillInProgress) {
      return 0;
    }

    autofillInProgress = true;
    autofillRunId += 1;
    autofillSummary = null;
    lastAutofillDebug = null;
    resetAutofillAiState();
    setAutofillProgress(stage, 4, "准备开始", true);
    return autofillRunId;
  }

  function isCurrentAutofillRun(runId) {
    return Boolean(autofillInProgress && runId && runId === autofillRunId);
  }

  function getAutofillRuntimeState() {
    return {
      profilePanelVisible,
      profilePanelCollapsed,
      sidebarFilter,
      activeProfileCategory,
      autofillInProgress,
      autofillProgress: { ...autofillProgress },
      autofillSummary: autofillSummary ? { ...autofillSummary } : null,
      autofillAi: getAutofillAiSnapshot()
    };
  }

  function getAutofillDebugSnapshot() {
    return lastAutofillDebug
      ? {
          ...lastAutofillDebug,
          exportedAt: new Date().toISOString()
        }
      : null;
  }

  async function getAutofillDebugSnapshotForExport() {
    // Export the background-owned copy only.  The background sanitizes URLs,
    // field values and broad DOM context before persisting a snapshot.
    await autofillDebugPersistPromise.catch(() => undefined);
    const stored = await sendRuntimeMessage({ type: "OJAF_GET_DEBUG_HISTORY" });
    const history = Array.isArray(stored?.history) ? stored.history : [];
    return history[0] || null;
  }

  function queueAutofillDebugPersistence() {
    const snapshot = getAutofillDebugSnapshot();
    if (!snapshot) {
      return autofillDebugPersistPromise;
    }

    const safeSnapshot = JSON.parse(JSON.stringify(snapshot));
    autofillDebugPersistPromise = autofillDebugPersistPromise
      .catch(() => undefined)
      .then(async () => {
        await sendRuntimeMessage({
          type: "OJAF_SAVE_DEBUG_SNAPSHOT",
          payload: { snapshot: safeSnapshot }
        });
      })
      .catch((error) => {
        console.warn("[OJAF debug] 保存调试日志失败", error);
      });

    return autofillDebugPersistPromise;
  }

  function getProfilePanelStateSnapshot() {
    return {
      profilePanelVisible,
      profilePanelCollapsed,
      sidebarFilter,
      activeProfileCategory
    };
  }

  function queueProfilePanelStateSave() {
    scheduleProfilePanelStateSave(getProfilePanelStateSnapshot());
  }

  function renderAndSaveProfilePanel(statusMessage = "", isError = false) {
    renderProfilePanel();
    if (statusMessage) {
      setProfilePanelStatus(statusMessage, isError);
    }
    queueProfilePanelStateSave();
  }

  function goProfilePanelHome() {
    activeProfileCategory = "";
    sidebarFilter = "";
    renderAndSaveProfilePanel("已返回主页。");
  }

  function sendRuntimeMessage(message) {
    return new Promise((resolve, reject) => {
      if (!chrome?.runtime?.sendMessage) {
        reject(new Error("Extension runtime unavailable."));
        return;
      }

      chrome.runtime.sendMessage(message, (response) => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }
        if (!response?.ok) {
          reject(new Error(response?.error || "Runtime message failed."));
          return;
        }
        resolve(response.data);
      });
    });
  }

  function scheduleProfilePanelStateSave(patch = {}) {
    if (profilePanelStateSaveTimer) {
      clearTimeout(profilePanelStateSaveTimer);
    }

    profilePanelStateSaveTimer = setTimeout(() => {
      profilePanelStateSaveTimer = null;
      void persistProfilePanelState(patch);
    }, PROFILE_PANEL_STATE_DEBOUNCE_MS);
  }

  async function persistProfilePanelState(patch = {}) {
    try {
      await sendRuntimeMessage({
        type: "OJAF_SAVE_PROFILE_PANEL_STATE",
        payload: {
          pageKey: getPageKey(),
          patch
        }
      });
    } catch {
      // Session state is an enhancement only; continue without persistence.
    }
  }

  async function restoreProfilePanelState() {
    if (profilePanelStateRestored) {
      return;
    }
    profilePanelStateRestored = true;

    try {
      const state = await sendRuntimeMessage({
        type: "OJAF_GET_PROFILE_PANEL_STATE",
        payload: {
          pageKey: getPageKey()
        }
      });

      if (!state) {
        return;
      }

      profilePanelVisible = Boolean(state.profilePanelVisible);
      profilePanelCollapsed = Boolean(state.profilePanelCollapsed);
      sidebarFilter = normalizeText(state.sidebarFilter || "", 80);
      activeProfileCategory = normalizeText(state.activeProfileCategory || "", 80);

      if (profilePanelVisible) {
        const panel = ensureProfilePanel();
        panel.setAttribute(PANEL_HIDDEN_ATTR, "false");
        panel.setAttribute(PANEL_COLLAPSED_ATTR, profilePanelCollapsed ? "true" : "false");
        renderProfilePanel();
      }
    } catch {
      // No persisted state available.
    }
  }

  function compactText(value) {
    return normalizeText(value, 900)
      .replace(/[\s|*＊:：,，.。;；()（）[\]【】<>《》"'“”‘’/\\-]/g, "")
      .toLowerCase();
  }

  function textMatchScore(source, target) {
    const sourceText = compactText(source);
    const targetText = compactText(target);

    if (!sourceText || !targetText) {
      return 0;
    }

    if (sourceText === targetText) {
      return 5;
    }

    if (sourceText.includes(targetText) || targetText.includes(sourceText)) {
      return 4;
    }

    const sourceTokens = new Set(
      normalizeText(source, 900)
        .toLowerCase()
        .split(/[\s|*＊:：,，.。;；()（）[\]【】<>《》"'“”‘’/\\-]+/)
        .filter((token) => token.length > 1)
    );
    const targetTokens = normalizeText(target, 900)
      .toLowerCase()
      .split(/[\s|*＊:：,，.。;；()（）[\]【】<>《》"'“”‘’/\\-]+/)
      .filter((token) => token.length > 1);

    let overlap = 0;
    for (const token of targetTokens) {
      if (sourceTokens.has(token)) {
        overlap += 1;
      }
    }

    return Math.min(3, overlap);
  }

  function getButtonText(element) {
    if (!element) {
      return "";
    }

    return normalizeText(
      element.innerText ||
        element.textContent ||
        element.getAttribute("aria-label") ||
        element.getAttribute("title") ||
        element.getAttribute("value") ||
        ""
    );
  }

  function isActionControl(element, labels) {
    if (!element || !(element instanceof Element) || !isVisible(element)) {
      return false;
    }

    if (element.disabled || element.getAttribute("aria-disabled") === "true") {
      return false;
    }

    const tagName = element.tagName.toLowerCase();
    const role = element.getAttribute("role");
    const isClickable =
      tagName === "button" ||
      role === "button" ||
      (element instanceof HTMLInputElement && ["button", "submit"].includes(element.type));

    if (!isClickable) {
      return false;
    }

    const text = getButtonText(element);
    return labels.some((label) => text === label || text.includes(label));
  }

  function clickActionElement(element) {
    if (!element || !(element instanceof Element)) {
      return false;
    }

    element.scrollIntoView({ block: "center", inline: "nearest" });
    element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
    element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
    element.click();
    return true;
  }

  function getOrCreateFieldId(element) {
    let fieldId = element.getAttribute(FIELD_ATTR);
    if (!fieldId) {
      fieldCounter += 1;
      fieldId = `arf_${Date.now().toString(36)}_${fieldCounter}`;
      element.setAttribute(FIELD_ATTR, fieldId);
    }
    return fieldId;
  }

  function getElementText(element) {
    if (!element) {
      return "";
    }
    return normalizeText(element.innerText || element.textContent || "");
  }

  function getTextWithoutControls(element) {
    if (!element) {
      return "";
    }

    const clone = element.cloneNode(true);
    clone.querySelectorAll(
      "input, textarea, select, button, script, style, svg, .layui-form-select, .ant-select, .ant-select-dropdown, .el-select, .el-select-dropdown, .arco-select, .arco-select-popup, .t-select, .t-popup, .phoenix-auto-complete-container, .phoenix-date-picker, [role='combobox'], [role='listbox'], [role='option']"
    ).forEach((node) => {
      node.remove();
    });
    return normalizeText(clone.innerText || clone.textContent || "");
  }

  function getLabelByFor(element) {
    if (!element.id) {
      return "";
    }

    const escapedId = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(element.id) : element.id;
    const label = document.querySelector(`label[for="${escapedId}"]`);
    return getElementText(label);
  }

  function getAriaLabelText(element) {
    const ariaLabel = element.getAttribute("aria-label");
    if (ariaLabel) {
      return normalizeText(ariaLabel);
    }

    const labelledBy = element.getAttribute("aria-labelledby");
    if (!labelledBy) {
      return "";
    }

    return normalizeText(
      labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id))
        .filter(Boolean)
        .map(getElementText)
        .join(" ")
    );
  }

  function getClosestDataAttributeValue(element, attributeNames, maxDepth = 6) {
    let current = element;
    for (let depth = 0; current && depth <= maxDepth; depth += 1, current = current.parentElement) {
      if (!(current instanceof Element)) {
        continue;
      }
      for (const name of attributeNames) {
        const value = current.getAttribute(name);
        if (value) {
          const normalized = normalizeText(value, 140);
          if (normalized) {
            return normalized;
          }
        }
      }
    }
    return "";
  }

  function getDataAttributeLabelText(element) {
    return normalizeFieldLabelText(
      getClosestDataAttributeValue(element, [
        "data-form-field-i18n-name",
        "data-form-field-name",
        "data-field-label",
        "data-label",
        "data-title"
      ])
    );
  }

  function getDataAttributeSectionText(element) {
    const direct = getClosestDataAttributeValue(element, [
      "data-section-title",
      "data-module-title",
      "data-group-title"
    ], 10);
    if (direct) {
      return direct;
    }

    let current = element.parentElement;
    for (let depth = 0; current && depth < 10; depth += 1, current = current.parentElement) {
      if (!(current instanceof Element)) {
        continue;
      }
      const scoped = current.querySelector(
        ".applyFormModuleWrapper-text,[data-section-title],[data-module-title],[class*='module-title'],[class*='section-title']"
      );
      const text = normalizeText(scoped?.textContent || "", 140);
      if (text) {
        return text;
      }
    }
    return "";
  }

  function getWrappingLabel(element) {
    const label = element.closest("label");
    return getTextWithoutControls(label);
  }

  function findFieldContainer(element) {
    const controlContainer = getControlAdapterContainer(element);
    if (controlContainer) {
      return controlContainer;
    }

    const adapterSelectors = getAdapterSelectors();
    if (adapterSelectors.containerSelector) {
      const container = element.closest(adapterSelectors.containerSelector);
      if (container) {
        return container;
      }
    }

    let current = element.parentElement;
    let best = null;

    for (let depth = 0; current && depth < 5; depth += 1, current = current.parentElement) {
      const text = getTextWithoutControls(current);
      const className = String(current.className || "");
      const likelyField =
        /form|field|item|row|cell|control|input|el-form-item|ant-form-item/i.test(className) ||
        current.querySelector("label") ||
        /[:：*]/.test(text);

      if (likelyField && text && text.length <= 180) {
        best = current;
        break;
      }

      if (!best && text && text.length <= 120) {
        best = current;
      }
    }

    return best || element.parentElement;
  }

  function getNearbyText(element) {
    const parts = [];
    const container = findFieldContainer(element);

    parts.push(getControlAdapterLabel(element));
    parts.push(getLabelByFor(element));
    parts.push(getWrappingLabel(element));
    parts.push(getAriaLabelText(element));
    parts.push(getDataAttributeLabelText(element));
    parts.push(getAdapterLabelText(element));
    parts.push(getDataAttributeSectionText(element));

    if (container) {
      parts.push(getTextWithoutControls(container));

      if (!getFieldControlAdapter(element)) {
        let previous = container.previousElementSibling;
        for (let i = 0; previous && i < 3; i += 1, previous = previous.previousElementSibling) {
          const text = getElementText(previous);
          if (text && text.length <= 120) {
            parts.push(text);
            break;
          }
        }
      }
    }

    parts.push(element.getAttribute("placeholder"));
    parts.push(element.getAttribute("name"));
    parts.push(element.getAttribute("id"));
    parts.push(element.getAttribute("title"));

    return normalizeText([...new Set(parts.filter(Boolean))].join(" | "), 420);
  }

  function getFieldOptionLabelsText(field, maxLength = 180) {
    const options = Array.isArray(field?.options) ? field.options : [];
    const labels = options
      .map((option) => normalizeText(option?.label || option?.value || "", 40))
      .filter(Boolean);
    return normalizeText([...new Set(labels)].join(" | "), maxLength);
  }

  function normalizeHotjobSectionTitle(value) {
    const title = normalizeText(value, 180).replace(/必填.*$/, "").trim();
    return ({ 个人基本信息: "基本信息", 自我评价: "自我描述", 项目经验: "项目经历" })[title] || title;
  }

  function normalizeHotjobFieldLabel(value) {
    const label = normalizeFieldLabelText(value);
    // Keep qualifications such as 税前/最高学历; strip only known UI instructions.
    const key = label.replace(/[（(]专科以上必填[）)]/, "");
    return ({
      第一专业: "专业名称", 学校: "学校名称", 企业名称: "单位名称",
      工作描述: "工作内容", 项目职责: "本人职责", GPA绩点: "GPA分数",
      评价内容: "自我描述", 得分: "考试分数",
      "国籍/地区": "国籍"
    })[key] || key;
  }

  // Resolve imported Feishu cards as records before matching individual fields.
  function projectNameSimilarity(a, b) {
    const clean = (v) => String(v || "").toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, "");
    a = clean(a); b = clean(b);
    if (!a || !b) return 0;
    if (a === b) return 1;
    if (Math.min(a.length, b.length) >= 4 && (a.includes(b) || b.includes(a))) return 0.93;
    const grams = (v) => new Set(Array.from({length: Math.max(0, v.length - 1)}, (_, i) => v.slice(i, i + 2)));
    const x = grams(a), y = grams(b);
    return x.size + y.size ? 2 * [...x].filter((g) => y.has(g)).length / (x.size + y.size) : 0;
  }

  function prepareFeishuRecords(fields, entries) {
    let project = null, awardIndex = 0;
    const groups = [];
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      if (f.siteAdapterId !== "feishu-jobs") continue;
      if (f.inferredLabel === "项目名称") { project = []; groups.push(project); }
      if (f.inferredCategory === "项目经历" && project) project.push(f);
      else if (f.inferredLabel !== "项目名称") project = null;
      if (f.inferredCategory === "奖惩情况") {
        if (/^(获奖名称|奖惩名称|奖项名称)$/.test(f.inferredLabel)) awardIndex++;
        if (awardIndex) f.feishuAwardIndex = awardIndex - 1;
        if (/^YYYY$/i.test(f.label || f.placeholder || "")) f.inferredLabel = "奖惩时间年";
        if (f.inferredLabel === "获奖名称") f.inferredLabel = "奖惩名称";
        if (f.inferredLabel === "描述") f.inferredLabel = "奖惩描述";
      }
      if (/^(URL\s*\/\s*ID|社交账号|社交链接)$/i.test(f.inferredLabel)) {
        f.githubTarget = "url";
        const previous = fields[i - 1];
        if (previous?.siteAdapterId === "feishu-jobs" && previous.type === "combobox" &&
            (!previous.inferredLabel || /社交平台/.test(previous.inferredLabel))) previous.githubTarget = "platform";
      }
      if (/^社交平台$/.test(f.inferredLabel)) f.githubTarget = "platform";
    }
    const identities = entries.filter((e) => e.category === "项目经历" && e.label === "项目名称" && e.hasValue && Number.isInteger(e.valuePath?.itemIndex));
    const projectFields = fields.filter((f) => f.siteAdapterId === "feishu-jobs" && f.inferredCategory === "项目经历");
    const allBlank = projectFields.length > 0 && projectFields.every((f) =>
      !f.hasCurrentValue && !String(f.currentValue || "").trim());
    for (const [groupIndex, group] of groups.entries()) {
      const name = group.find((f) => f.inferredLabel === "项目名称")?.currentValue || "";
      const ranked = identities.map((e) => ({e, score: projectNameSimilarity(name, e.value)})).sort((a,b) => b.score-a.score);
      const best = ranked[0];
      // Empty forms have no identity to compare. Bind a profile prefix only
      // when the entire project section is empty; never guess for partial imports.
      const positional = allBlank ? identities.filter((e) => e.valuePath.itemIndex === groupIndex) : [];
      const match = allBlank
        ? (positional.length === 1 ? positional[0] : null)
        : best && best.score >= 0.82 && (!ranked[1] || best.score - ranked[1].score >= 0.12) ? best.e : null;
      const narrative = group.filter((f) => /^(描述|项目描述|项目内容|项目简述|本人职责|项目职责|职责|项目成果|项目绩效)$/.test(f.inferredLabel));
      if (narrative.length === 1 && /^(描述|项目描述|项目内容|项目简述)$/.test(narrative[0].inferredLabel)) narrative[0].singleProjectDescription = true;
      for (const f of group) {
        f.hotjobProfileIndex = match ? match.valuePath.itemIndex : -1;
        f.hotjobProfileSectionKey = match?.valuePath.sectionKey;
        f.feishuProjectCorrection = Boolean(match);
      }
    }
  }

  function bindHotjobRecords(fields, entries) {
    const identityLabels = {
      教育经历: "学校名称", 实习经历: "单位名称", 项目经历: "项目名称"
    };
    const identityEntryLabels = {
      教育经历: new Set(["学校名称", "学校"]),
      实习经历: new Set(["单位名称", "公司名称", "公司"]),
      项目经历: new Set(["项目名称"])
    };
    const groups = new Map();
    for (const field of fields) {
      const isZhiyeRepeat = field.siteAdapterId === "zhiye" && identityLabels[field.inferredCategory];
      if (!(field.siteAdapterId === "hotjob" || isZhiyeRepeat) || field.repeatItemIndex == null || !identityLabels[field.inferredCategory]) continue;
      const key = `${field.inferredCategory}|${field.repeatItemIndex}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(field);
    }
    const emptyZhiyeProjects = fields.filter((field) =>
      field.siteAdapterId === "zhiye" && field.inferredCategory === "项目经历");
    const allZhiyeProjectsBlank = emptyZhiyeProjects.length > 0 &&
      emptyZhiyeProjects.every((field) => !field.hasCurrentValue && !normalizeText(field.currentValue || "", 200));
    for (const group of groups.values()) {
      const first = group[0];
      const identityLabel = identityLabels[first.inferredCategory];
      const identityFields = group.filter((field) => normalizeHotjobFieldLabel(field.inferredLabel) === identityLabel);
      const identity = identityFields.find((field) => field.hasCurrentValue)?.currentValue || "";
      const identityLabelsForEntries = identityEntryLabels[first.inferredCategory] || new Set([identityLabel]);
      const identities = entries.filter((entry) => entry.category === first.inferredCategory &&
        identityLabelsForEntries.has(normalizeHotjobFieldLabel(entry.label)) && entry.hasValue &&
        Number.isInteger(entry.valuePath?.itemIndex));
      let matches = [];
      if (identity) {
        matches = identities.filter((entry) => normalizeChoiceLabel(entry.value) === normalizeChoiceLabel(identity));
        if (!matches.length && first.siteAdapterId === "zhiye") {
          const ranked = identities
            .map((entry) => ({ entry, score: projectNameSimilarity(identity, entry.value) }))
            .sort((left, right) => right.score - left.score);
          const best = ranked[0];
          const runnerUp = ranked[1];
          // Zhiye frequently appends a project qualifier or drops the
          // organization prefix during resume parsing. Accept a unique fuzzy
          // identity, while keeping a margin against similarly named projects.
          if (best && best.score >= 0.72 && (!runnerUp || best.score - runnerUp.score >= 0.1)) {
            matches = [best.entry];
          }
        }
      } else if (identityFields.length && (identities.length === first.repeatItemTotal ||
        (first.siteAdapterId === "zhiye" && allZhiyeProjectsBlank))) {
        // Entirely blank Zhiye project forms can consume a profile prefix.
        // Populated/reordered forms still require identity or complete-form matching.
        const expectedIndex = Number(first.repeatItemIndex) === 0 ? 0 : Number(first.repeatItemIndex) - 1;
        matches = identities.filter((entry) => entry.valuePath.itemIndex === expectedIndex);
      }
      // Imported Zhiye cards may retain dates while names are empty. Bind only
      // when all present dates identify exactly one stored project.
      if (!matches.length && first.siteAdapterId === "zhiye") {
        const dates = group.filter((field) => /^(开始时间|结束时间)$/.test(field.inferredLabel) && field.hasCurrentValue && field.currentValue);
        if (dates.length) {
          matches = identities.filter((candidate) => dates.every((field) =>
            entries.some((entry) => entry.category === first.inferredCategory &&
              entry.valuePath?.sectionKey === candidate.valuePath.sectionKey &&
              entry.valuePath?.itemIndex === candidate.valuePath.itemIndex &&
              entry.label === field.inferredLabel && entry.hasValue &&
              normalizeChoiceLabel(entry.value) === normalizeChoiceLabel(field.currentValue))));
        }
      }
      const unique = new Map(matches.map((entry) => [
        `${entry.valuePath.sectionKey}|${entry.valuePath.itemIndex}`, entry
      ]));
      const match = unique.size === 1 ? [...unique.values()][0] : null;
      for (const field of group) {
        field.hotjobProfileIndex = match ? match.valuePath.itemIndex : -1;
        field.hotjobProfileSectionKey = match?.valuePath.sectionKey;
      }
    }
  }

  function normalizeFieldLabelText(value, maxLength = 90) {
    return normalizeText(value, maxLength)
      .replace(/^[*＊•\s]+/, "")
      .replace(/[*＊\s]+$/, "")
      .replace(/[:：]\s*$/, "")
      .replace(/^(请输入|请选择|请填写|请写明|点击选择)\s*/, "")
      .replace(/\s*(请输入|请选择|点击选择|选择)$/, "")
      .trim();
  }

  function isOptionOnlyLabel(value) {
    const text = normalizeText(value, 120);
    const key = compactText(text);
    if (!key) {
      return false;
    }
    if (/^(男|女|男女|是|否|是否|否是|有|无|有无|未参加|参加过|至今|填写结束时间|长期有效|填写有效期)$/i.test(key)) {
      return true;
    }
    return (
      key.length <= 80 &&
      (
        /^(离婚|离异|丧偶|已婚|未婚){2,}$/.test(key) ||
        /^(博士研究生|硕士研究生|大学本科|大学专科|中等专科|职业高中|技工学校|普通高中|其他|无){2,}$/.test(key) ||
        /^(博士|硕士|学士|其他|无){2,}$/.test(key) ||
        /^(A型|B型|AB型|O型|其他){2,}$/i.test(key) ||
        /^(全日制|非全日制|无数据){1,3}$/.test(key)
      )
    );
  }

  function isGenericFieldLabel(value) {
    const text = normalizeFieldLabelText(value, 80);
    return !text || /^(请输入|请选择|请填写|选择|内容列表|分数|总分数|日期|时间)$/i.test(text);
  }

  function extractFieldContainerLabel(container) {
    if (!container) {
      return "";
    }

    const text = getTextWithoutControls(container);
    if (!text) {
      return "";
    }

    const requiredMatches = Array.from(text.matchAll(/[*＊]\s*([^:：\n]{1,70})\s*[:：]/g));
    if (requiredMatches.length > 0) {
      return normalizeFieldLabelText(requiredMatches[0][1]);
    }

    const matches = Array.from(text.matchAll(/([^:：\n]{1,70})\s*[:：]/g));
    if (matches.length > 0) {
      return normalizeFieldLabelText(matches[0][1]);
    }

    return normalizeFieldLabelText(text.split(/\s{2,}|\|/)[0], 90);
  }

  function getPlaceholderDerivedLabel(placeholder, containerText = "") {
    const text = normalizeText(placeholder, 100);
    const context = compactText(containerText);
    if (!text) {
      return "";
    }

    if (/GPA|平均学分成绩/i.test(text)) {
      return "GPA分数";
    }
    if (/没有班级排名/.test(text)) {
      return "无班级排名原因";
    }
    if (/没有专业排名/.test(text)) {
      return "无专业排名原因";
    }
    if (/其他行业属性/.test(text)) {
      return "其他行业属性";
    }
    if (/工作内容描述/.test(text)) {
      return "工作内容描述";
    }
    if (/受到奖励|学术成果/.test(text)) {
      return "受到奖励/学术成果";
    }
    if (/社会\/?校园活动/.test(text)) {
      return "社会/校园活动";
    }
    if (/爱好|专长/.test(text)) {
      return "爱好及专长";
    }
    if (/自我评价/.test(text)) {
      return "自我评价";
    }
    if (/总分数/.test(text)) {
      return "高考总分";
    }
    if (/分数/.test(text) && /六级/.test(context)) {
      return "六级分数";
    }
    if (/分数/.test(text) && /四级/.test(context)) {
      return "四级分数";
    }
    if (/分数/.test(text) && /托福|toefl/i.test(context)) {
      return "TOEFL分数";
    }
    if (/分数/.test(text) && /雅思|ielts/i.test(context)) {
      return "IELTS分数";
    }
    if (/分数/.test(text) && /gre/i.test(context)) {
      return "GRE分数";
    }
    if (/分数/.test(text) && /gmat/i.test(context)) {
      return "GMAT分数";
    }
    if (/分数/.test(text)) {
      return "考试分数";
    }

    const cleaned = normalizeFieldLabelText(text);
    return /^(日期|时间|请输入|请选择|请填写)$/.test(cleaned) ? "" : cleaned;
  }

  function getGroupedControlInfo(container, element) {
    if (!container) {
      return { controls: [], index: -1 };
    }

    const controls = collectVisibleControls(container);

    const index = controls.findIndex((item) => item === element || item.contains(element) || element.contains(item));
    return { controls, index };
  }

  function getRepeatGroupLabelText(element) {
    const root = findRepeatItemRoot(element);
    if (!root) {
      return "";
    }

    const controls = collectVisibleControls(root);
    const labels = controls
      .map(getControlContextLabel)
      .filter((label) => label && !isOptionOnlyLabel(label) && !/OpenJobAutofill/.test(label));

    return normalizeText([...new Set(labels)].join(" | "), 360);
  }

  function getControlContextLabel(control) {
    const container = findFieldContainer(control);
    return normalizeFieldLabelText(
      getControlAdapterLabel(control) ||
        extractFieldContainerLabel(container) ||
        getDataAttributeLabelText(control) ||
        getAdapterLabelText(control) ||
        getLabelByFor(control) ||
        getWrappingLabel(control) ||
        getAriaLabelText(control) ||
        ""
    );
  }

  function isRepeatItemRootCandidate(root) {
    if (!root || root.closest?.(`#${PANEL_ID}`)) {
      return false;
    }

    const controls = collectVisibleControls(root);
    if (controls.length < 2 || controls.length > 24) {
      return false;
    }

    const text = getTextWithoutControls(root);
    return Boolean(text && text.length <= 2600);
  }

  function getLocationGroupedLabel(context, index) {
    if (index < 0) {
      return "";
    }

    const suffixes = ["省", "市", "区县"];
    const suffix = suffixes[index] || `第${index + 1}项`;
    const groups = [
      [/工作\/实习地点|工作实习地点|实习地点|工作地点/, "工作/实习地点"],
      [/现户口所在地|当前户口所在地|户口所在地/, "现户口所在地"],
      [/生源地/, "生源地"],
      [/籍贯/, "籍贯"],
      [/高考所在地|高考省份/, "高考所在地"]
    ];

    for (const [pattern, label] of groups) {
      if (pattern.test(context)) {
        return `${label}${suffix}`;
      }
    }

    return "";
  }

  function disambiguateGroupedFieldLabel(element, label, container, placeholder) {
    const containerText = getTextWithoutControls(container);
    const context = compactText([label, containerText, placeholder].join(" "));
    const { controls, index } = getGroupedControlInfo(container, element);
    const type = getControlType(element);

    if (getActiveSiteAdapter()?.id === "hotjob") {
      if (normalizeFieldLabelText(label) === "证书等级" && controls.length === 2) {
        return index === 0 ? "外语种类" : "证书名称";
      }
      label = normalizeHotjobFieldLabel(label);
    }

    if (getActiveSiteAdapter()?.id === "moka") {
      const dateInfo = getMokaNativeDateControlInfo(container, element);
      const dateLabel = getMokaGroupedDateLabel(label, dateInfo.index, dateInfo.total);
      if (dateLabel) {
        return dateLabel;
      }
    }

    // A pair of full-date controls shares one label on many project forms.
    // Moka year/month groups are handled by its adapter above.
    const rangeLabel = getPairedDateRangeLabel(label, index, controls.length);
    if (rangeLabel) {
      return rangeLabel;
    }

    if (controls.length >= 2) {
      const locationLabel = getLocationGroupedLabel(context, index);
      if (locationLabel) {
        return locationLabel;
      }
    }

    if (/平均学分成绩gpa/.test(context)) {
      if (/分数|数字/.test(compactText(placeholder)) || element instanceof HTMLInputElement) {
        return "GPA分数";
      }
      if (type === "combobox" || type === "select") {
        return "GPA满分";
      }
      return "平均学分成绩（GPA）";
    }

    if (/有无班级排名/.test(context)) {
      if (/原因/.test(context) || element instanceof HTMLInputElement) {
        return "无班级排名原因";
      }
      if (type === "combobox" || type === "select") {
        return "班级排名";
      }
      return "有无班级排名";
    }

    if (/有无专业排名/.test(context)) {
      if (/原因/.test(context) || element instanceof HTMLInputElement) {
        return "无专业排名原因";
      }
      if (type === "combobox" || type === "select") {
        return "专业排名";
      }
      return "有无专业排名";
    }

    if (/本段经历升学类型/.test(context)) {
      if (/总分/.test(context)) {
        return "高考总分";
      }
      if (/分数/.test(context) && (type === "number" || type === "text")) {
        return "考试分数";
      }
      return "本段经历升学类型";
    }

    if (/竞赛/.test(context)) {
      if (/项目/.test(context)) {
        return "竞赛项目";
      }
      if (/奖项/.test(context)) {
        return "竞赛奖项";
      }
      if (/时间|日期/.test(context)) {
        return "竞赛时间";
      }
    }

    for (const test of [
      ["六级", "六级"],
      ["四级", "四级"],
      ["toefl", "TOEFL"],
      ["ielts", "IELTS"],
      ["gre", "GRE"],
      ["gmat", "GMAT"]
    ]) {
      const [needle, title] = test;
      if (context.includes(needle)) {
        if (/分数/.test(context)) {
          return `${title}分数`;
        }
        if (/获得时间|取得时间/.test(context)) {
          return `${title}获得时间`;
        }
        if (/有效期/.test(context)) {
          return `${title}有效期`;
        }
        return title;
      }
    }

    return label;
  }

  function getMokaNativeDateControlInfo(container, element) {
    if (!container || !element) {
      return { index: -1, total: 0 };
    }

    // Moka renders each year/month selector as a visible text input inside a
    // custom dropdown.  Read those native inputs directly so generic logical
    // control de-duplication cannot collapse or reorder a date group.
    const controls = Array.from(
      container.querySelectorAll(
        'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]),select'
      )
    ).filter((control) => isControlVisible(control));
    const index = controls.findIndex(
      (control) => control === element || control.contains(element) || element.contains(control)
    );
    return { index, total: controls.length };
  }

  function getPairedDateRangeLabel(label, index, total) {
    const key = normalizeFieldLabelText(label);
    if (!/^(起止时间|起止日期|项目起止时间|项目时间)$/.test(key) || total !== 2) {
      return "";
    }
    return ["开始时间", "结束时间"][index] || "";
  }

  function getMokaGroupedDateLabel(label, index, total) {
    const text = String(label || "").replace(/\s+/g, "");
    if (index < 0) {
      return "";
    }
    if (/^获奖时间$/.test(text) && total === 2) {
      return ["奖惩时间年", "奖惩时间月"][index] || "";
    }
    if (!/^(起止时间|就读时间)$/.test(text)) {
      return "";
    }
    if (total === 2) {
      return ["开始时间年", "开始时间月"][index] || "";
    }
    if (total >= 4) {
      return ["开始时间年", "开始时间月", "结束时间年", "结束时间月"][index] || "";
    }
    return "";
  }

  function extractContextualLabelFromText(text) {
    const source = normalizeText(text, 500);
    if (!source) {
      return "";
    }

    const parts = source.split(/\s*\|\s*/).map((part) => normalizeText(part, 140)).filter(Boolean);
    for (const part of parts) {
      const match = part.match(/(?:^|[\s*＊])([^:：]{1,70})[:：]/);
      const label = normalizeFieldLabelText(match ? match[1] : part);
      if (
        label &&
        !isGenericFieldLabel(label) &&
        !isOptionOnlyLabel(label) &&
        !/^\d+\/\d+$/.test(label) &&
        !/请上传|请选择|请输入|无数据/.test(label)
      ) {
        return label;
      }
    }

    return "";
  }

  function improveFieldLabel(element, rawLabel, nearbyText) {
    const container = findFieldContainer(element);
    const containerLabel = extractFieldContainerLabel(container);
    const contextLabel = extractContextualLabelFromText(nearbyText);
    const placeholder = normalizeText(element.getAttribute("placeholder"), 100);
    const placeholderLabel = getPlaceholderDerivedLabel(placeholder, getTextWithoutControls(container));
    const raw = normalizeFieldLabelText(rawLabel);
    let label = raw;

    if (getActiveSiteAdapter()?.id === "hotjob" && element.closest(".form-cell") && raw) {
      return disambiguateGroupedFieldLabel(element, raw, container, placeholder);
    }

    if (isGenericFieldLabel(label) || isOptionOnlyLabel(label)) {
      label = contextLabel || containerLabel || label;
    }

    if (placeholderLabel && (isGenericFieldLabel(label) || /原因|分数|行业属性|工作内容|奖励|活动|评价|专长/.test(placeholderLabel))) {
      label = placeholderLabel;
    }

    if (isGenericFieldLabel(label) || isOptionOnlyLabel(label)) {
      label = contextLabel || normalizeFieldLabelText(nearbyText.split(/\s*\|\s*/)[0]);
    }

    label = disambiguateGroupedFieldLabel(element, normalizeFieldLabelText(label), container, placeholder);
    if (isMokaProjectRoleField(element, label)) {
      return "职位";
    }
    return isMokaLanguageTypeField(element, label) ? "外语种类" : label;
  }

  function isMokaProjectRoleField(element, label) {
    if (getActiveSiteAdapter()?.id !== "moka" || normalizeMatchKey(label) !== "职责") {
      return false;
    }

    const isSingleLineText = element instanceof HTMLInputElement && !["checkbox", "radio", "file"].includes(element.type);
    if (!isSingleLineText) {
      return false;
    }

    const repeatRoot = findRepeatItemRoot(element);
    const context = compactText([getSectionText(element), getTextWithoutControls(repeatRoot)].join(" "));
    return matchesProfileSectionAlias(context, "项目经历") || /项目名称|项目描述|项目中职责/.test(context);
  }

  function isMokaLanguageTypeField(element, label) {
    return (
      getActiveSiteAdapter()?.id === "moka" &&
      normalizeMatchKey(label) === "语言能力" &&
      getSectionText(element) === "语言能力"
    );
  }

  function getAdapterLabelText(element) {
    const controlLabel = getControlAdapterLabel(element);
    if (controlLabel) {
      return controlLabel;
    }

    const { labelSelector } = getAdapterSelectors();
    const container = findFieldContainer(element);
    if (!container || !labelSelector) {
      return "";
    }

    try {
      const labels = Array.from(container.querySelectorAll(labelSelector))
        .slice(0, 4)
        .map((label) => getElementText(label))
        .filter(Boolean);
      return normalizeText(labels.join(" | "), 160);
    } catch {
      return "";
    }
  }

  function getSectionText(element) {
    const feishuCard = element.closest?.(".resumeEditForm-item");
    if (feishuCard) {
      const cls = feishuCard.className || "";
      if (/resumeEditForm-project/.test(cls)) return "项目经历";
      if (/resumeEditForm-education/.test(cls)) return "教育经历";
      if (/resumeEditForm-intern/.test(cls)) return "实习经历";
    }
    if (getActiveSiteAdapter()?.id === "zhiye") {
      const section = getPhoenixSection(element);
      if (section) return section;
    }
    if (getActiveSiteAdapter()?.id === "hotjob") {
      const heading = element.closest(".form-cell")?.querySelector(":scope > .tit-wrap");
      if (heading) {
        return normalizeHotjobSectionTitle(getElementText(heading));
      }
    }
    const parts = [];
    const elementRect = element.getBoundingClientRect();
    const adapterSelectors = getAdapterSelectors();

    if (getActiveSiteAdapter()?.id === "moka") {
      const block = element.closest("[class*='apply-block-']");
      const heading = block?.querySelector(":scope > [class*='blockTitle-']");
      const category = normalizeMokaSectionTitle(getElementText(heading));
      if (category) {
        return category;
      }
    }

    const headingSelector = [
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "legend",
      "[role='heading']",
      ".title",
      ".section-title",
      ".card-title",
      adapterSelectors.sectionSelector
    ]
      .filter(Boolean)
      .join(",");

    const pushText = (text) => {
      const normalized = normalizeSectionHeadingText(text);
      if (normalized) {
        parts.push(normalized);
        return;
      }
      const plain = normalizeText(text, 180);
      if (plain && plain.length <= 180 && /[\u4e00-\u9fa5A-Za-z]/.test(plain)) {
        parts.push(plain);
      }
    };

    pushText(getDataAttributeSectionText(element));

    let current = element.parentElement;
    for (let depth = 0; current && depth < 10; depth += 1, current = current.parentElement) {
      const headingText = getNearestScopedHeadingText(current, headingSelector, element, elementRect);
      if (headingText) {
        pushText(headingText);
      }

      let previous = current.previousElementSibling;
      for (let i = 0; previous && i < 8; i += 1, previous = previous.previousElementSibling) {
        const text = getElementText(previous);
        if (text && /[\u4e00-\u9fa5A-Za-z]/.test(text)) {
          pushText(text);
          break;
        }
      }
    }

    return normalizeText([...new Set(parts)].join(" | "), 240);
  }

  function getNearestScopedHeadingText(root, headingSelector, element, elementRect) {
    if (!root?.querySelectorAll || !headingSelector) {
      return "";
    }

    let best = null;
    let bestBottom = -Infinity;
    for (const heading of Array.from(root.querySelectorAll(headingSelector))) {
      if (!(heading instanceof Element) || heading.contains(element)) {
        continue;
      }
      const rect = heading.getBoundingClientRect();
      if (rect.bottom > elementRect.top + 8 || rect.bottom < bestBottom) {
        continue;
      }
      const text = getElementText(heading);
      if (!text || text.length > 260) {
        continue;
      }
      best = text;
      bestBottom = rect.bottom;
    }
    return best || "";
  }

  function normalizeSectionHeadingText(text) {
    const key = compactText(text);
    if (!key) {
      return "";
    }

    const mokaCategory = normalizeMokaSectionTitle(text);
    if (mokaCategory) {
      return mokaCategory;
    }

    const sections = [
      ["基本信息", /基本信息|个人信息/],
      ["教育经历", /教育经历|教育背景/],
      ["工作经历", /工作经历/],
      ["绩效考核", /近三年年度绩效考核|绩效考核/],
      ["家庭信息", /家庭及社会关系|家庭情况|家庭信息|社会关系/],
      ["证书技能", /证书信息|证书技能|资格证书/],
      ["专业资格", /专业技术资格|职业资格|职称/],
      ["奖惩情况", /奖惩信息|奖惩情况|获奖情况/],
      ["自我描述", /自我评价及相关情况说明|自我评价|自我描述/],
      ["有关声明", /有关声明/]
    ];

    for (const [label, pattern] of sections) {
      if (pattern.test(key)) {
        return label;
      }
    }

    return "";
  }

  function normalizeMokaSectionTitle(value) {
    const text = String(value || "").replace(/\s+/g, "").replace(/添加$/, "");
    const sections = [
      ["基本信息", /个人信息|基本信息/],
      ["求职意向", /求职意向/],
      ["教育经历", /教育背景|教育经历/],
      ["实习经历", /实习经历/],
      ["工作经历", /工作经历/],
      ["项目经历", /项目经验|项目经历/],
      ["语言能力", /语言能力/],
      ["自我描述", /自我描述|自我评价/],
      ["奖惩情况", /获奖经历|奖惩经历|奖惩情况|获奖情况/]
    ];
    for (const [category, pattern] of sections) {
      if (pattern.test(text)) {
        return category;
      }
    }
    return "";
  }

  function getOptions(element) {
    if (element instanceof HTMLSelectElement) {
      return Array.from(element.options).map((option) => ({
        value: option.value,
        label: normalizeText(option.textContent)
      }));
    }

    const ariaControls = element.getAttribute("aria-controls");
    const optionRoot = ariaControls ? document.getElementById(ariaControls) : getExpandedOptionRoot(element);
    const container = getControlAdapterChoiceContainer(element) || getControlAdapterContainer(element);
    const roots = [optionRoot, container].filter((root, index, array) => root && array.indexOf(root) === index);
    if (roots.length === 0) {
      return [];
    }

    const selectors = [
      '[role="option"]',
      "li",
      ".option",
      ...getControlAdapterOptionSelectors(element)
    ].join(",");
    const seen = new Set();
    const options = [];
    for (const root of roots) {
      for (const option of Array.from(root.querySelectorAll(selectors))) {
        if (seen.has(option)) {
          continue;
        }
        seen.add(option);
        const label = getElementText(option);
        const value = option.getAttribute("data-value") || option.getAttribute("lay-value") || label;
        if (label || value) {
          options.push({ value, label });
        }
        if (options.length >= 80) {
          return options;
        }
      }
    }
    return options;
  }

  function getExpandedOptionRoot(element) {
    if (!element) {
      return null;
    }

    const ariaExpanded = element.getAttribute("aria-expanded");
    if (ariaExpanded === "true") {
      const popupId = element.getAttribute("aria-controls") || element.getAttribute("aria-owns");
      if (popupId) {
        const controlled = document.getElementById(popupId);
        if (controlled) {
          return controlled;
        }
      }
    }

    const closestPopup = element.closest('[role="combobox"],[class*="select"],[class*="picker"]');
    if (closestPopup) {
      const popup = closestPopup.querySelector('[role="listbox"],[role="menu"],[class*="dropdown"],[class*="option"]');
      if (popup) {
        return popup;
      }
    }

    return null;
  }

  function getControlType(element) {
    if (element instanceof HTMLTextAreaElement) {
      return "textarea";
    }

    if (element instanceof HTMLSelectElement) {
      return "select";
    }

    const controlAdapter = getFieldControlAdapter(element);
    if (controlAdapter?.choiceContainerSelector || controlAdapter?.getChoiceContainer) {
      return "combobox";
    }

    if (element.isContentEditable) {
      return "contenteditable";
    }

    const role = element.getAttribute("role");
    if (role === "combobox") {
      return "combobox";
    }
    if (role === "radio") {
      return "radio";
    }
    if (role === "checkbox") {
      return "checkbox";
    }

    if (element instanceof HTMLInputElement) {
      return element.type || "text";
    }

    return role || "text";
  }

  function getControlCurrentValue(element) {
    if (getActiveSiteAdapter()?.id === "hotjob") {
      const select = element.closest?.(".ant-select");
      if (select) return getElementText(select.querySelector(".ant-select-selection-selected-value"));
    }
    if (!element) {
      return "";
    }

    const adapter = getFieldControlAdapter(element);
    if (adapter?.getCurrentValue) {
      try {
        return normalizeText(adapter.getCurrentValue(element), 260);
      } catch {
        // Fall through to the generic control reader.
      }
    }

    if (adapter?.choiceContainerSelector || adapter?.getChoiceContainer) {
      const input = element.querySelector?.('input:not([type="hidden"]),textarea,[contenteditable="true"]');
      const directValue = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
        ? element.value
        : "";
      return normalizeText(input?.value || directValue || getElementText(element), 260);
    }

    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
      if (element instanceof HTMLInputElement && ["checkbox", "radio"].includes(element.type)) {
        return element.checked ? "checked" : "";
      }
      return normalizeText(element.value || "", 260);
    }

    if (element.isContentEditable) {
      return normalizeText(element.textContent || "", 260);
    }

    return "";
  }

  function hasMeaningfulControlValue(element, label, currentValue) {
    const value = normalizeText(currentValue, 120);
    if (!value || /^(请选择|请先选择|无数据|undefined|null)$/i.test(value)) {
      return false;
    }

    const labelKey = normalizeMatchKey(label);
    if (
      element instanceof HTMLInputElement &&
      (element.type === "number" || element.getAttribute("role") === "spinbutton") &&
      /^(0|1|0\.0+|1\.0+)$/.test(value) &&
      /身高|体重|收入|薪资|年薪/.test(labelKey)
    ) {
      return false;
    }

    return true;
  }

  function buildFieldMeta(element) {
    const adapter = getActiveSiteAdapter();
    const controlAdapter = getFieldControlAdapter(element);
    const type = getControlType(element);
    const adapterDisabled = (() => {
      try {
        return Boolean(controlAdapter?.isDisabled?.(element));
      } catch {
        return false;
      }
    })();
    const canFill = !element.disabled && !adapterDisabled && type !== "file";
    const rawLabel = normalizeText(
      getControlAdapterLabel(element) ||
        getLabelByFor(element) ||
        getDataAttributeLabelText(element) ||
        getAdapterLabelText(element) ||
        getWrappingLabel(element) ||
        getAriaLabelText(element)
    );
    const nearbyText = getNearbyText(element);
    const label = improveFieldLabel(element, rawLabel, nearbyText);
    const currentValue = getControlCurrentValue(element);
    const groupText = getRepeatGroupLabelText(element);
    const repeatItem = getRepeatItemOccurrenceInfo(element);

    return {
      fieldId: getOrCreateFieldId(element),
      type,
      tagName: element.tagName.toLowerCase(),
      label,
      placeholder: normalizeText(element.getAttribute("placeholder")),
      name: normalizeText(element.getAttribute("name")),
      id: normalizeText(element.getAttribute("id")),
      required: Boolean(element.required || element.getAttribute("aria-required") === "true"),
      disabled: Boolean(element.disabled || adapterDisabled),
      readOnly: Boolean(element.readOnly || element.getAttribute("aria-readonly") === "true"),
      hasCurrentValue: hasMeaningfulControlValue(element, label, currentValue),
      currentValue,
      canFill,
      section: getSectionText(element),
      nearbyText,
      groupText,
      repeatItemIndex: repeatItem.index,
      repeatItemTotal: repeatItem.total,
      options: getOptions(element),
      cssPath: getCssPath(element),
      controlAdapterId: controlAdapter?.id || "",
      controlAdapterName: controlAdapter?.name || "",
      siteAdapterId: adapter?.id || "",
      siteAdapterName: adapter?.name || ""
    };
  }

  function getCssPath(element) {
    const parts = [];
    let current = element;

    while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 5) {
      let selector = current.nodeName.toLowerCase();
      if (current.id) {
        selector += `#${current.id}`;
        parts.unshift(selector);
        break;
      }

      const className = String(current.className || "")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .join(".");
      if (className) {
        selector += `.${className}`;
      }

      parts.unshift(selector);
      current = current.parentElement;
    }

    return parts.join(" > ");
  }

  function collectVisibleControls(root = document) {
    const candidates = [
      ...Array.from(root.querySelectorAll(CONTROL_SELECTOR)),
      // Frameworks such as Layui hide the native select and expose a proxy
      // input. Include native selects so the logical field keeps its name/id.
      ...Array.from(root.querySelectorAll("select"))
    ];
    const seen = new Set();
    const controls = [];

    for (const candidate of candidates) {
      if (!(candidate instanceof Element)) {
        continue;
      }

      const element = getLogicalControlElement(candidate);
      if (!(element instanceof Element) || seen.has(element)) {
        continue;
      }
      seen.add(element);

      if (element.closest(`#${PANEL_ID}`)) {
        continue;
      }

      if (isControlVisible(element) || isControlVisible(candidate)) {
        controls.push(element);
      }
    }

    return controls;
  }

  function hasVisibleControls(root) {
    return collectVisibleControls(root).length > 0;
  }

  function looksLikeEditableSummary(text) {
    return Boolean(text && text.length >= 8 && text.length <= 1400 && /[:：]/.test(text));
  }

  function findActionRoot(actionElement) {
    let current = actionElement?.parentElement || null;
    let best = current;

    for (let depth = 0; current && depth < 8; depth += 1, current = current.parentElement) {
      const text = getTextWithoutControls(current);
      if (text && text.length <= 1400) {
        best = current;
        if (looksLikeEditableSummary(text)) {
          return current;
        }
      }
    }

    return best || actionElement?.parentElement || null;
  }

  function findNextClosedEditButton() {
    const buttons = Array.from(
      document.querySelectorAll('button,[role="button"],input[type="button"],input[type="submit"]')
    );
    const editLabels = getAdapterActionLabels("edit");

    return (
      buttons.find((button) => {
        if (
          !isActionControl(button, editLabels) ||
          button.getAttribute(EDIT_ATTEMPT_ATTR) === "true"
        ) {
          return false;
        }

        const root = findActionRoot(button);
        if (!root) {
          return false;
        }

        const text = getTextWithoutControls(root);
        return looksLikeEditableSummary(text) && !hasVisibleControls(root);
      }) || null
    );
  }

  async function expandEditableCardsForScan() {
    let expanded = 0;

    for (let i = 0; i < MAX_EDIT_EXPANSIONS; i += 1) {
      const button = findNextClosedEditButton();
      if (!button) {
        break;
      }

      button.setAttribute(EDIT_ATTEMPT_ATTR, "true");
      clickActionElement(button);
      expanded += 1;
      await sleep(180);
    }

    return expanded;
  }

  async function waitForDynamicControlRendering(root = document, timeout = 900) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeout) {
      const layuiSelects = Array.from(root.querySelectorAll("select")).filter((select) => select.closest(".layui-form"));
      const pending = layuiSelects.some((select) => !findLayuiProxyForSelect(select) && !isVisible(select));
      if (!pending) {
        return;
      }
      await sleep(80);
    }
  }

  async function scanForm() {
    currentSiteAdapter = detectSiteAdapter();
    const expandedEditCards = await expandEditableCardsForScan();
    await waitForDynamicControlRendering();
    const controls = collectVisibleControls();

    const fields = controls.map((element) => buildFieldMeta(element));
    const adapter = getActiveSiteAdapter();

    return {
      url: location.href,
      hostname: location.hostname,
      title: document.title,
      siteAdapter: adapter
        ? {
            id: adapter.id || "",
            name: adapter.name || "",
            confidence: adapter.confidence || 0
          }
        : null,
      scannedAt: new Date().toISOString(),
      expandedEditCards,
      fields
    };
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const fontUrl = typeof chrome !== "undefined" && chrome.runtime?.getURL
      ? chrome.runtime.getURL("assets/fonts/Manrope-Variable.ttf")
      : "";
    const fontFace = fontUrl
      ? `@font-face { font-family: "Manrope"; src: url("${fontUrl}") format("truetype"); font-style: normal; font-weight: 200 800; font-display: swap; }`
      : "";
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `${fontFace}
      [${MARK_ATTR}="filled"] {
        outline: 2px solid #19a974 !important;
        outline-offset: 2px !important;
        box-shadow: 0 0 0 4px rgba(25, 169, 116, 0.14) !important;
      }
      [${MARK_ATTR}="uncertain"] {
        outline: 2px solid #f5a623 !important;
        outline-offset: 2px !important;
        box-shadow: 0 0 0 4px rgba(245, 166, 35, 0.18) !important;
      }
      [${MARK_ATTR}="error"] {
        outline: 2px solid #f5a623 !important;
        outline-offset: 2px !important;
        box-shadow: 0 0 0 4px rgba(245, 166, 35, 0.18) !important;
      }
      #${FLOAT_ID} {
        position: fixed;
        right: 18px;
        bottom: 18px;
        width: min(360px, calc(100vw - 36px));
        padding: 14px;
        border: 1px solid rgba(38, 58, 44, 0.14);
        border-radius: 18px;
        background:
          linear-gradient(180deg, rgba(255, 253, 247, 0.98), rgba(249, 244, 234, 0.96)),
          radial-gradient(circle at 0% 0%, rgba(15, 107, 79, 0.13), transparent 42%);
        box-shadow: 0 18px 58px rgba(32, 33, 36, 0.18);
        z-index: 2147483645;
        color: #202124;
        font: 13px/1.45 ui-serif, Georgia, "Times New Roman", "Noto Serif SC", serif;
      }
      #${FLOAT_ID}[hidden] {
        display: none;
      }
      #${FLOAT_ID} * {
        box-sizing: border-box;
      }
      #${FLOAT_ID} .arf-float-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 10px;
      }
      #${FLOAT_ID} .arf-float-title {
        color: #26231e;
        font-size: 15px;
        font-weight: 700;
      }
      #${FLOAT_ID} .arf-float-detail {
        margin-top: 3px;
        color: #6f6a60;
        font-size: 12px;
      }
      #${FLOAT_ID} .arf-float-privacy {
        margin-top: 8px;
        padding: 8px 10px;
        border: 1px solid rgba(15, 107, 79, 0.14);
        border-radius: 12px;
        background: rgba(15, 107, 79, 0.07);
        color: #4d6458;
        font-size: 11px;
        line-height: 1.45;
      }
      #${FLOAT_ID} .arf-float-ai {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin-top: 8px;
        padding: 6px 10px;
        border-radius: 999px;
        background: rgba(15, 107, 79, 0.12);
        color: #0f6b4f;
        font-size: 11px;
        font-weight: 700;
        line-height: 1.3;
      }
      #${FLOAT_ID} .arf-float-close {
        width: 26px;
        min-width: 26px;
        height: 26px;
        border: 1px solid #ded6c8;
        border-radius: 9px;
        background: #fff;
        color: #4b463f;
        cursor: pointer;
      }
      #${FLOAT_ID} .arf-float-progress {
        margin-top: 11px;
      }
      #${FLOAT_ID} .arf-float-track {
        height: 8px;
        overflow: hidden;
        border-radius: 999px;
        background: rgba(15, 107, 79, 0.12);
      }
      #${FLOAT_ID} .arf-float-fill {
        width: 0%;
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, #0f6b4f, #d48a1f);
        transition: width 0.25s ease;
      }
      #${FLOAT_ID} .arf-float-chips {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
        margin-top: 12px;
      }
      #${FLOAT_ID} .arf-float-chip {
        padding: 8px;
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.74);
        color: #6f6a60;
        text-align: center;
      }
      #${FLOAT_ID} .arf-float-chip strong {
        display: block;
        color: #26231e;
        font-size: 18px;
        line-height: 1.1;
      }
      #${FLOAT_ID} .arf-float-chip.is-ok strong {
        color: #0f6b4f;
      }
      #${FLOAT_ID} .arf-float-chip.is-warn strong {
        color: #bf7a18;
      }
      #${FLOAT_ID} .arf-float-actions {
        display: flex;
        gap: 8px;
        margin-top: 12px;
      }
      #${FLOAT_ID} .arf-float-actions button {
        flex: 1;
        min-height: 34px;
        border: 0;
        border-radius: 11px;
        background: #0f6b4f;
        color: #fff;
        cursor: pointer;
      }
      #${FLOAT_ID} .arf-float-actions button.secondary {
        border: 1px solid #0f6b4f;
        background: transparent;
        color: #0f6b4f;
      }
      #${PANEL_ID} {
        position: fixed;
        top: 8px;
        right: 0;
        width: min(430px, calc(100vw - 28px));
        height: calc(100dvh - 16px);
        max-height: calc(100dvh - 16px);
        min-height: 0;
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 16px 16px max(18px, env(safe-area-inset-bottom));
        border: 0;
        border-left: 1px solid rgba(38, 58, 44, 0.16);
        border-radius: 18px 0 0 18px;
        background:
          linear-gradient(180deg, rgba(255, 253, 247, 0.99), rgba(250, 246, 236, 0.98)),
          radial-gradient(circle at 10% 0%, rgba(15, 107, 79, 0.1), transparent 32%);
        box-shadow: -18px 0 48px rgba(34, 34, 34, 0.16);
        z-index: 2147483646;
        font-size: 13px;
        color: #202124;
        overflow: hidden;
      }
      @supports not (height: 100dvh) {
        #${PANEL_ID} {
          height: calc(100vh - 16px);
          max-height: calc(100vh - 16px);
        }
      }
      #${PANEL_ID}[${PANEL_HIDDEN_ATTR}="true"] {
        display: none;
      }
      #${PANEL_ID}[${PANEL_COLLAPSED_ATTR}="true"] {
        top: calc(50vh - 76px);
        width: 46px;
        height: 152px;
        padding: 6px;
        border: 1px solid rgba(38, 58, 44, 0.16);
        border-right: 0;
        border-radius: 14px 0 0 14px;
      }
      #${PANEL_ID}[${PANEL_COLLAPSED_ATTR}="true"] .arf-body,
      #${PANEL_ID}[${PANEL_COLLAPSED_ATTR}="true"] .arf-footer,
      #${PANEL_ID}[${PANEL_COLLAPSED_ATTR}="true"] .arf-subtitle,
      #${PANEL_ID}[${PANEL_COLLAPSED_ATTR}="true"] .arf-home,
      #${PANEL_ID}[${PANEL_COLLAPSED_ATTR}="true"] .arf-close {
        display: none;
      }
      #${PANEL_ID}[${PANEL_COLLAPSED_ATTR}="true"] .arf-header {
        height: 100%;
        align-items: center;
        justify-content: center;
      }
      #${PANEL_ID}[${PANEL_COLLAPSED_ATTR}="true"] .arf-title {
        display: none;
      }
      #${PANEL_ID}[${PANEL_COLLAPSED_ATTR}="true"] .arf-toggle {
        width: 34px;
        height: 132px;
        min-height: 132px;
        padding: 0;
        writing-mode: vertical-rl;
        letter-spacing: 0.16em;
      }
      #${PANEL_ID} * {
        box-sizing: border-box;
      }
      #${PANEL_ID} .arf-body {
        flex: 1 1 auto;
        display: flex;
        flex-direction: column;
        gap: 10px;
        min-height: 0;
        overflow-y: auto;
        padding: 0 3px 8px 0;
        overscroll-behavior: contain;
      }
      #${PANEL_ID} .arf-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 8px;
      }
      #${PANEL_ID} .arf-title {
        font-size: 18px;
        font-weight: 700;
      }
      #${PANEL_ID} .arf-subtitle {
        margin-top: 2px;
        color: #6f6a60;
        line-height: 1.45;
      }
      #${PANEL_ID} .arf-close {
        width: 28px;
        min-height: 28px;
        border: 1px solid #ded6c8;
        border-radius: 8px;
        background: #fff;
        color: #333;
      }
      #${PANEL_ID} .arf-home,
      #${PANEL_ID} .arf-toggle {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 46px;
        height: 28px;
        min-height: 28px;
        padding: 0;
        border: 1px solid #ded6c8;
        border-radius: 8px;
        background: #fff;
        color: #333;
        cursor: pointer;
      }
      #${PANEL_ID} .arf-header-actions {
        display: flex;
        flex: none;
        align-items: center;
        gap: 6px;
      }
      #${PANEL_ID} .arf-search {
        width: 100%;
        min-height: 40px;
        padding: 0 12px;
        border: 1px solid #ded6c8;
        border-radius: 13px;
        background: #fffdf8;
        color: #202124;
        font: inherit;
      }
      #${PANEL_ID} .arf-content {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      #${PANEL_ID} .arf-overview {
        display: grid;
        grid-template-columns: 1fr;
        gap: 10px;
      }
      #${PANEL_ID} .arf-category-card {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 8px;
        width: 100%;
        padding: 14px;
        border: 1px solid #e2d8c8;
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.74);
        color: #202124;
        text-align: left;
        cursor: pointer;
      }
      #${PANEL_ID} .arf-category-card:hover {
        border-color: rgba(15, 107, 79, 0.35);
        background: #fffdf8;
      }
      #${PANEL_ID} .arf-category-title {
        font-size: 15px;
        font-weight: 700;
        color: #26231e;
      }
      #${PANEL_ID} .arf-category-note {
        margin-top: 5px;
        color: #7a7164;
        font-size: 12px;
        line-height: 1.45;
      }
      #${PANEL_ID} .arf-category-count {
        align-self: start;
        min-width: 34px;
        padding: 4px 8px;
        border-radius: 999px;
        background: rgba(15, 107, 79, 0.12);
        color: #0f6b4f;
        font-size: 12px;
        font-weight: 700;
        text-align: center;
      }
      #${PANEL_ID} .arf-detail-head {
        position: sticky;
        top: 0;
        z-index: 1;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 0 4px;
        background: linear-gradient(180deg, rgba(255, 253, 247, 0.99), rgba(255, 253, 247, 0.88));
      }
      #${PANEL_ID} .arf-back {
        min-height: 32px;
        padding: 0 11px;
        border: 1px solid #ded6c8;
        border-radius: 10px;
        background: #fff;
        color: #4b463f;
        cursor: pointer;
      }
      #${PANEL_ID} .arf-detail-title {
        font-size: 16px;
        font-weight: 700;
      }
      #${PANEL_ID} .arf-detail-card {
        padding: 14px;
        border: 1px solid #e2d8c8;
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.78);
      }
      #${PANEL_ID} .arf-subsection-title {
        margin: 2px 0 10px;
        color: #0f6b4f;
        font-size: 13px;
        font-weight: 700;
      }
      #${PANEL_ID} .arf-readable {
        user-select: text;
        -webkit-user-select: text;
      }
      #${PANEL_ID} .arf-row {
        display: grid;
        grid-template-columns: minmax(84px, 0.38fr) minmax(0, 1fr);
        gap: 10px;
        padding: 7px 0;
        border-top: 1px dashed rgba(222, 214, 200, 0.82);
        line-height: 1.55;
      }
      #${PANEL_ID} .arf-row:first-child {
        border-top: 0;
        padding-top: 0;
      }
      #${PANEL_ID} .arf-row-label {
        color: #7a7164;
        font-size: 12px;
      }
      #${PANEL_ID} .arf-row-value {
        color: #26231e;
        white-space: pre-wrap;
        word-break: break-word;
      }
      #${PANEL_ID} .arf-row-value.is-empty {
        color: #aaa196;
      }
      #${PANEL_ID} .arf-empty {
        padding: 12px;
        border: 1px dashed #ded6c8;
        border-radius: 12px;
        color: #6f6a60;
        background: #fffdf8;
        line-height: 1.5;
      }
      #${PANEL_ID} .arf-footer {
        display: flex;
        flex-direction: column;
        gap: 8px;
        flex-shrink: 0;
        padding: 8px 0 0;
        border-top: 1px solid rgba(231, 223, 209, 0.9);
        background: linear-gradient(180deg, rgba(250, 246, 236, 0), rgba(250, 246, 236, 0.98) 18%);
      }
      #${PANEL_ID} .arf-actions {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
      }
      #${PANEL_ID} .arf-actions button {
        min-height: 34px;
        border: 0;
        border-radius: 10px;
        background: #0f6b4f;
        color: #fff;
        cursor: pointer;
      }
      #${PANEL_ID} .arf-actions button.secondary {
        background: #eaf2ed;
        color: #0f6b4f;
      }
      #${PANEL_ID} .arf-actions button.ghost {
        background: #f5f1e8;
        color: #4b463f;
      }
      #${PANEL_ID} .arf-actions button:disabled {
        cursor: not-allowed;
        opacity: 0.5;
      }
      #${PANEL_ID} .arf-meta {
        color: #6f6a60;
        font-size: 12px;
        line-height: 1.45;
      }
      #${PANEL_ID} .arf-progress {
        display: flex;
        flex-direction: column;
        gap: 5px;
      }
      #${PANEL_ID} .arf-progress[hidden] {
        display: none;
      }
      #${PANEL_ID} .arf-progress-track {
        height: 8px;
        overflow: hidden;
        border-radius: 999px;
        background: rgba(15, 107, 79, 0.12);
      }
      #${PANEL_ID} .arf-progress-fill {
        width: 0%;
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, #0f6b4f, #d48a1f);
        transition: width 0.25s ease;
      }
      #${PANEL_ID} .arf-progress-meta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        color: #6f6a60;
        font-size: 11px;
        line-height: 1.35;
      }
      #${PANEL_ID} .arf-progress-meta span:last-child {
        min-width: 0;
        overflow: hidden;
        text-align: right;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      #${PANEL_ID},
      #${FLOAT_ID} {
        --arf-surface: #ffffff;
        --arf-surface-2: #f5f7fb;
        --arf-surface-3: #e8ecf3;
        --arf-text: #0a0a0a;
        --arf-text-2: #1f2530;
        --arf-muted: #5a6478;
        --arf-faint: #98a0b0;
        --arf-rule: #d8dde6;
        --arf-accent: #4361ee;
        --arf-accent-hover: #3552d7;
        --arf-accent-soft: rgba(67, 97, 238, 0.1);
        --arf-accent-glow: rgba(67, 97, 238, 0.26);
        --arf-danger: #b42335;
        --arf-font: "Manrope", "Inter", "Avenir Next", "PingFang SC", "Noto Sans SC", -apple-system, BlinkMacSystemFont, sans-serif;
        font-family: var(--arf-font);
        color: var(--arf-text);
        font-feature-settings: "ss01", "ss02", "ss03", "cv02", "tnum";
        -webkit-font-smoothing: antialiased;
      }
      #${PANEL_ID} {
        border-color: var(--arf-rule);
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.99), rgba(245, 247, 251, 0.99));
        box-shadow: -18px 0 48px rgba(20, 30, 60, 0.16);
      }
      #${PANEL_ID}[${PANEL_COLLAPSED_ATTR}="true"] {
        border-color: var(--arf-rule);
      }
      #${PANEL_ID} .arf-subtitle,
      #${PANEL_ID} .arf-meta,
      #${PANEL_ID} .arf-progress-meta,
      #${PANEL_ID} .arf-category-note,
      #${PANEL_ID} .arf-row-label {
        color: var(--arf-muted);
      }
      #${PANEL_ID} .arf-title,
      #${PANEL_ID} .arf-category-title,
      #${PANEL_ID} .arf-detail-title,
      #${PANEL_ID} .arf-row-value {
        color: var(--arf-text-2);
      }
      #${PANEL_ID} .arf-close,
      #${PANEL_ID} .arf-home,
      #${PANEL_ID} .arf-toggle,
      #${PANEL_ID} .arf-back {
        border-color: var(--arf-rule);
        background: var(--arf-surface);
        color: var(--arf-text-2);
      }
      #${PANEL_ID} .arf-close:hover,
      #${PANEL_ID} .arf-home:hover,
      #${PANEL_ID} .arf-toggle:hover,
      #${PANEL_ID} .arf-back:hover {
        border-color: var(--arf-accent);
        color: var(--arf-accent);
      }
      #${PANEL_ID} .arf-search {
        border-color: var(--arf-rule);
        background: var(--arf-surface);
        color: var(--arf-text);
      }
      #${PANEL_ID} .arf-search:focus,
      #${PANEL_ID} .arf-row-editor:focus {
        outline: none;
        border-color: var(--arf-accent);
        box-shadow: 0 0 0 3px var(--arf-accent-soft);
      }
      #${PANEL_ID} .arf-category-card,
      #${PANEL_ID} .arf-detail-card {
        border-color: var(--arf-rule);
        background: var(--arf-surface);
      }
      #${PANEL_ID} .arf-category-card:hover {
        border-color: rgba(67, 97, 238, 0.35);
        background: var(--arf-surface-2);
      }
      #${PANEL_ID} .arf-category-count {
        background: var(--arf-accent-soft);
        color: var(--arf-accent);
      }
      #${PANEL_ID} .arf-subsection-title {
        color: var(--arf-accent);
      }
      #${PANEL_ID} .arf-row {
        grid-template-columns: minmax(84px, 0.34fr) minmax(0, 1fr) auto;
        align-items: start;
        border-top-color: rgba(216, 221, 230, 0.9);
      }
      #${PANEL_ID} .arf-row-value.is-empty {
        color: var(--arf-faint);
      }
      #${PANEL_ID} .arf-empty {
        border-color: var(--arf-rule);
        background: var(--arf-surface-2);
        color: var(--arf-muted);
      }
      #${PANEL_ID} .arf-detail-head {
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.99), rgba(255, 255, 255, 0.88));
      }
      #${PANEL_ID} .arf-footer {
        border-top-color: var(--arf-rule);
        background: linear-gradient(180deg, rgba(245, 247, 251, 0), rgba(245, 247, 251, 0.99) 18%);
      }
      #${PANEL_ID} .arf-actions button,
      #${PANEL_ID} .arf-row-action.is-primary {
        border: 1px solid var(--arf-accent);
        border-color: var(--arf-accent);
        background: var(--arf-accent);
        color: #ffffff;
      }
      #${PANEL_ID} .arf-actions button:hover:not(:disabled),
      #${PANEL_ID} .arf-row-action.is-primary:hover:not(:disabled) {
        background: var(--arf-accent-hover);
        box-shadow: 0 9px 22px var(--arf-accent-glow);
      }
      #${PANEL_ID} .arf-actions button.secondary {
        border-color: var(--arf-accent);
        background: var(--arf-accent-soft);
        color: var(--arf-accent);
      }
      #${PANEL_ID} .arf-actions button.ghost,
      #${PANEL_ID} .arf-row-action {
        border: 1px solid var(--arf-rule);
        border-color: var(--arf-rule);
        background: var(--arf-surface-2);
        color: var(--arf-text-2);
      }
      #${PANEL_ID} .arf-row-action {
        width: auto;
        min-height: 28px;
        margin: 0;
        padding: 0 8px;
        border-radius: 7px;
        font: inherit;
        font-size: 11px;
        font-weight: 750;
        line-height: 1;
        cursor: pointer;
        white-space: nowrap;
      }
      #${PANEL_ID} .arf-row-action.is-primary {
        border-color: var(--arf-accent);
        background: var(--arf-accent);
        color: #ffffff;
      }
      #${PANEL_ID} .arf-row-action:hover:not(:disabled) {
        border-color: var(--arf-accent);
        background: var(--arf-accent-soft);
        color: var(--arf-accent);
      }
      #${PANEL_ID} .arf-row-action.is-primary:hover:not(:disabled) {
        background: var(--arf-accent-hover);
        color: #ffffff;
      }
      #${PANEL_ID} .arf-row-action:disabled {
        cursor: not-allowed;
        opacity: 0.5;
      }
      #${PANEL_ID} .arf-row-main {
        min-width: 0;
      }
      #${PANEL_ID} .arf-row-actions {
        display: flex;
        align-items: flex-start;
        justify-content: flex-end;
        gap: 6px;
        padding-top: 1px;
      }
      #${PANEL_ID} .arf-row-editor {
        display: block;
        width: 100%;
        min-height: 32px;
        padding: 7px 9px;
        border: 1px solid var(--arf-rule);
        border-radius: 8px;
        background: var(--arf-surface);
        color: var(--arf-text-2);
        font: inherit;
        font-size: 13px;
        line-height: 1.5;
        resize: vertical;
      }
      #${PANEL_ID} .arf-row-value.is-editing {
        white-space: normal;
      }
      #${PANEL_ID} .arf-progress-track {
        background: var(--arf-accent-soft);
      }
      #${PANEL_ID} .arf-progress-fill {
        background: var(--arf-accent);
      }
      #${FLOAT_ID} {
        border-color: var(--arf-rule);
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.99), rgba(245, 247, 251, 0.98));
        box-shadow: 0 18px 58px rgba(20, 30, 60, 0.18);
        color: var(--arf-text);
      }
      #${FLOAT_ID} .arf-float-title,
      #${FLOAT_ID} .arf-float-chip strong {
        color: var(--arf-text-2);
      }
      #${FLOAT_ID} .arf-float-detail {
        color: var(--arf-muted);
      }
      #${FLOAT_ID} .arf-float-privacy,
      #${FLOAT_ID} .arf-float-ai {
        border-color: rgba(67, 97, 238, 0.2);
        background: var(--arf-accent-soft);
        color: var(--arf-text-2);
      }
      #${FLOAT_ID} .arf-float-ai {
        color: var(--arf-accent);
      }
      #${FLOAT_ID} .arf-float-close,
      #${FLOAT_ID} .arf-float-chip {
        border-color: var(--arf-rule);
        background: var(--arf-surface-2);
        color: var(--arf-muted);
      }
      #${FLOAT_ID} .arf-float-track {
        background: var(--arf-accent-soft);
      }
      #${FLOAT_ID} .arf-float-fill {
        background: var(--arf-accent);
      }
      #${FLOAT_ID} .arf-float-actions button {
        background: var(--arf-accent);
      }
      #${FLOAT_ID} .arf-float-actions button.secondary {
        border-color: var(--arf-accent);
        background: var(--arf-surface);
        color: var(--arf-accent);
      }
    `;
    document.documentElement.appendChild(style);
  }

  function markElement(element, mark, title) {
    injectStyle();
    const surface = getControlSurfaceElement(element);
    (surface || element).setAttribute(MARK_ATTR, mark);
    if (title) {
      (surface || element).setAttribute("title", title);
    }
  }

  function clearMarks() {
    document.querySelectorAll(`[${MARK_ATTR}]`).forEach((element) => {
      element.removeAttribute(MARK_ATTR);
    });
    autofillSummary = null;
    const floating = document.getElementById(FLOAT_ID);
    if (floating) {
      floating.hidden = true;
    }
  }

  function ensureFloatingStatus() {
    injectStyle();
    let floating = document.getElementById(FLOAT_ID);
    if (floating) {
      return floating;
    }

    floating = document.createElement("div");
    floating.id = FLOAT_ID;
    floating.hidden = true;
    floating.innerHTML = `
      <div class="arf-float-head">
        <div>
          <div class="arf-float-title" data-role="float-title">简历填写中</div>
          <div class="arf-float-detail" data-role="float-detail">正在准备...</div>
        </div>
        <button class="arf-float-close" type="button" data-action="float-hide" title="隐藏">×</button>
      </div>
      <div class="arf-float-privacy">隐私：资料只保存在本机；插件不会自动提交。</div>
      <div class="arf-float-ai" data-role="float-ai" hidden></div>
      <div class="arf-float-progress" data-role="float-progress">
        <div class="arf-float-track">
          <div class="arf-float-fill" data-role="float-fill"></div>
        </div>
      </div>
      <div class="arf-float-chips" data-role="float-chips" hidden></div>
      <div class="arf-float-actions">
        <button type="button" data-action="float-detail">打开资料面板</button>
        <button class="secondary" type="button" data-action="float-clear">清除颜色标记</button>
      </div>
    `;

    floating.querySelector('[data-action="float-hide"]')?.addEventListener("click", () => {
      floating.hidden = true;
    });
    floating.querySelector('[data-action="float-detail"]')?.addEventListener("click", () => {
      showProfilePanel();
      renderProfilePanel();
    });
    floating.querySelector('[data-action="float-clear"]')?.addEventListener("click", clearMarks);

    document.documentElement.appendChild(floating);
    return floating;
  }

  function setAutofillSummary(summary) {
    const failed = Number(summary?.failed || 0);
    const skipped = Number(summary?.skipped || 0);
    autofillSummary = {
      attempted: Number(summary?.attempted || 0),
      filled: Number(summary?.filled || 0),
      failed,
      skipped,
      pending: Number(summary?.pending ?? skipped + failed),
      total: Number(summary?.total || 0),
      message: normalizeText(summary?.message || "", 160),
      missingProfileFields: Array.isArray(summary?.missingProfileFields) ? summary.missingProfileFields.slice() : [],
      aiUsage: sanitizeAutofillAiUsage(summary?.aiUsage || getAutofillAiSnapshot())
    };
    renderFloatingStatus();
  }

  function renderFloatingStatus() {
    const shouldShow = Boolean(autofillProgress.active || autofillSummary);
    const floating = ensureFloatingStatus();
    floating.hidden = !shouldShow;
    if (!shouldShow) {
      return;
    }

    const title = floating.querySelector('[data-role="float-title"]');
    const detail = floating.querySelector('[data-role="float-detail"]');
    const aiFlag = floating.querySelector('[data-role="float-ai"]');
    const progress = floating.querySelector('[data-role="float-progress"]');
    const fill = floating.querySelector('[data-role="float-fill"]');
    const chips = floating.querySelector('[data-role="float-chips"]');

    if (autofillProgress.active) {
      const modeBadge = getAutofillModeBadgeText(autofillAiState, autofillProgress);
      if (title) {
        title.textContent = getAutofillProgressTitle() || "正在填写";
      }
      if (detail) {
        detail.textContent = getAutofillProgressDetail();
      }
      if (progress) {
        progress.hidden = false;
      }
      if (fill) {
        fill.style.width = `${getDisplayedProgressPercent()}%`;
      }
      if (chips) {
        chips.hidden = true;
        chips.textContent = "";
      }
      if (aiFlag) {
        aiFlag.hidden = !modeBadge;
        aiFlag.textContent = modeBadge || "";
      }
      return;
    }

    const summary = autofillSummary || {};
    const modeBadge = getAutofillCompletionBadgeText(summary.aiUsage || autofillAiState);
    if (title) {
      title.textContent = "填写完成";
    }
    if (detail) {
      detail.textContent = summary.message || "请直接在页面上检查绿色已填写和橙色待处理标记。";
    }
    if (progress) {
      progress.hidden = true;
    }
    if (chips) {
      chips.hidden = false;
      chips.innerHTML = `
        <div class="arf-float-chip is-ok"><strong>${summary.filled || 0}</strong>已填写</div>
        <div class="arf-float-chip is-warn"><strong>${summary.pending || 0}</strong>待处理</div>
      `;
    }
    if (aiFlag) {
      aiFlag.hidden = !modeBadge;
      aiFlag.textContent = modeBadge || "";
    }
  }

  function setProfilePanelStatus(message, isError = false) {
    const panel = ensureProfilePanel();
    const statusEl = panel.querySelector('[data-role="status"]');
    if (statusEl) {
      statusEl.textContent = message;
      statusEl.style.color = isError ? "var(--arf-danger)" : "var(--arf-muted)";
    }
  }

  function setProfilePanelVisible(nextVisible) {
    profilePanelVisible = Boolean(nextVisible);
    const panel = ensureProfilePanel();
    panel.setAttribute(PANEL_HIDDEN_ATTR, profilePanelVisible ? "false" : "true");
    panel.setAttribute(PANEL_COLLAPSED_ATTR, profilePanelCollapsed ? "true" : "false");
    if (profilePanelVisible) {
      renderAndSaveProfilePanel();
    } else {
      queueProfilePanelStateSave();
    }
  }

  function showProfilePanel() {
    setProfilePanelVisible(true);
    void refreshCurrentProfile();
  }

  function toggleProfilePanelCollapsed() {
    profilePanelCollapsed = !profilePanelCollapsed;
    renderAndSaveProfilePanel();
  }

  function ensureProfilePanel() {
    injectStyle();
    if (profilePanel && document.contains(profilePanel)) {
      return profilePanel;
    }

    const stalePanel = document.getElementById(PANEL_ID);
    if (stalePanel) {
      stalePanel.remove();
    }

    const panel = document.createElement("aside");
    panel.id = PANEL_ID;
    panel.setAttribute(PANEL_HIDDEN_ATTR, "true");
    panel.setAttribute(PANEL_COLLAPSED_ATTR, "false");

    const header = document.createElement("div");
    header.className = "arf-header";

    const titleWrap = document.createElement("div");
    const title = document.createElement("div");
    title.className = "arf-title";
    title.textContent = "OpenJobAutofill";
    const subtitle = document.createElement("div");
    subtitle.className = "arf-subtitle";
    subtitle.dataset.role = "subtitle";
    subtitle.textContent = "本机简历资料。用于查看、搜索和复制；开始填写会扫描并自动填写当前网页。";
    titleWrap.append(title, subtitle);

    const headerActions = document.createElement("div");
    headerActions.className = "arf-header-actions";

    const collapseBtn = document.createElement("button");
    collapseBtn.type = "button";
    collapseBtn.className = "arf-toggle";
    collapseBtn.dataset.action = "collapse";
    collapseBtn.textContent = "收起";
    collapseBtn.addEventListener("click", toggleProfilePanelCollapsed);

    const homeBtn = document.createElement("button");
    homeBtn.type = "button";
    homeBtn.className = "arf-home";
    homeBtn.dataset.action = "home";
    homeBtn.textContent = "主页";
    homeBtn.addEventListener("click", goProfilePanelHome);

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "arf-close";
    closeBtn.textContent = "×";
    closeBtn.addEventListener("click", () => setProfilePanelVisible(false));
    headerActions.append(collapseBtn, homeBtn, closeBtn);
    header.append(titleWrap, headerActions);

    const body = document.createElement("div");
    body.className = "arf-body";

    const searchInput = document.createElement("input");
    searchInput.className = "arf-search";
    searchInput.dataset.role = "quick-copy-search";
    searchInput.type = "search";
    searchInput.placeholder = "搜索分类或内容，例如 手机 / 项目 / 奖学金";
    searchInput.addEventListener("input", () => {
      sidebarFilter = normalizeText(searchInput.value || "", 80);
      activeProfileCategory = "";
      renderQuickCopyList(panel);
      queueProfilePanelStateSave();
    });

    const content = document.createElement("div");
    content.className = "arf-content";
    content.dataset.role = "quick-copy-list";
    content.textContent = "资料加载中...";

    const status = document.createElement("div");
    status.className = "arf-meta";
    status.dataset.role = "status";
    status.textContent = "资料只从本机读取。";

    const progress = document.createElement("div");
    progress.className = "arf-progress";
    progress.dataset.role = "progress";
    progress.hidden = true;
    progress.innerHTML = `
      <div class="arf-progress-track">
        <div class="arf-progress-fill" data-role="progress-fill"></div>
      </div>
      <div class="arf-progress-meta">
        <span data-role="progress-stage"></span>
        <span data-role="progress-detail"></span>
      </div>
    `;

    const actions = document.createElement("div");
    actions.className = "arf-actions";

    const copyCategoryBtn = document.createElement("button");
    copyCategoryBtn.type = "button";
    copyCategoryBtn.dataset.action = "copy-category";
    copyCategoryBtn.textContent = "复制本类";
    copyCategoryBtn.disabled = true;
    copyCategoryBtn.addEventListener("click", () => {
      void copyActiveCategory();
    });

    const refreshBtn = document.createElement("button");
    refreshBtn.type = "button";
    refreshBtn.className = "secondary";
    refreshBtn.dataset.action = "refresh";
    refreshBtn.textContent = "刷新";
    refreshBtn.addEventListener("click", () => {
      void refreshCurrentProfile({ force: true });
    });

    const settingsBtn = document.createElement("button");
    settingsBtn.type = "button";
    settingsBtn.className = "ghost";
    settingsBtn.dataset.action = "settings";
    settingsBtn.textContent = "设置";
    settingsBtn.addEventListener("click", () => {
      void openOptionsPageFromProfilePanel();
    });

    actions.append(copyCategoryBtn, refreshBtn, settingsBtn);

    const footer = document.createElement("div");
    footer.className = "arf-footer";

    footer.append(status, progress, actions);

    body.append(searchInput, content);
    panel.append(header, body, footer);
    document.documentElement.appendChild(panel);
    profilePanel = panel;
    return panel;
  }

  async function openOptionsPageFromProfilePanel() {
    try {
      await sendRuntimeMessage({ type: "OJAF_OPEN_OPTIONS" });
      setProfilePanelStatus("已打开设置页。");
    } catch (error) {
      setProfilePanelStatus(`打开设置失败：${error.message}`, true);
    }
  }

  async function refreshCurrentProfile(options = {}) {
    if (currentProfileLoadPromise && !options.force) {
      return currentProfileLoadPromise;
    }

    currentProfileLoadPromise = (async () => {
      const settings = await sendRuntimeMessage({ type: "OJAF_GET_SETTINGS" });
      currentProfileV2 = settings.profileV2 || null;
      return currentProfileV2;
    })();

    try {
      const profile = await currentProfileLoadPromise;
      if (profilePanelVisible) {
        renderProfilePanel();
      }
      if (options.force && profilePanelVisible) {
        setProfilePanelStatus("已刷新本机简历资料。");
      }
      return profile;
    } catch (error) {
      if (profilePanelVisible) {
        setProfilePanelStatus(`读取本机资料失败：${error.message}`, true);
      }
      return null;
    } finally {
      currentProfileLoadPromise = null;
    }
  }

  function formatQuickCopyValue(value, maxLength = 64) {
    if (value == null || value === "") {
      return "";
    }

    if (typeof value === "string") {
      return normalizeText(value, maxLength);
    }

    if (typeof value === "object") {
      try {
        return normalizeText(JSON.stringify(value), maxLength);
      } catch {
        return normalizeText(String(value), maxLength);
      }
    }

    return normalizeText(String(value), maxLength);
  }

  function normalizeProfileCategory(title) {
    const text = normalizeText(title, 80);
    if (!text) {
      return "其他信息";
    }

    if (/基本|个人信息|联系方式/.test(text)) {
      return "基本信息";
    }
    if (/求职意向|意向岗位|期望薪资|期望工作|面试城市/.test(text)) {
      return "求职意向";
    }
    if (/教育|学历|学校/.test(text)) {
      return "教育经历";
    }
    if (matchesProfileSectionAlias(text, "项目经历") || /项目/.test(text)) {
      return "项目经历";
    }
    if (/实习|实践/.test(text)) {
      return "实习经历";
    }
    if (/工作经历/.test(text)) {
      return "工作经历";
    }
    if (/绩效考核|考核等级|考核排名/.test(text)) {
      return "绩效考核";
    }
    if (/专业技术资格|职业资格|职称/.test(text)) {
      return "专业资格";
    }
    if (/社团|校园活动/.test(text)) {
      return "社团工作";
    }
    if (/学生工作|班委|学生会|干部任职|在校职务/.test(text)) {
      return "学生工作";
    }
    if (/奖|惩|荣誉|成果/.test(text)) {
      return "奖惩情况";
    }
    if (/外语能力|外语|英语|四六级|CET|IELTS|TOEFL|GRE|GMAT/i.test(text)) {
      return "外语能力";
    }
    if (/计算机技能|IT技能|计算机能力/.test(text)) {
      return "计算机技能";
    }
    if (/证书|技能|计算机/.test(text)) {
      return "证书技能";
    }
    if (/语言|语种/i.test(text)) {
      return "语言能力";
    }
    if (/家庭|亲属|父亲|母亲|社会关系/.test(text)) {
      return "家庭信息";
    }
    if (/培训/.test(text)) {
      return "培训经历";
    }
    if (/论文|著作|刊物/.test(text)) {
      return "论文著作";
    }
    if (/专利/.test(text)) {
      return "专利成果";
    }
    if (/自我描述|自我评价|自我介绍/.test(text)) {
      return "自我描述";
    }
    if (/声明|疾病|不良|居留|任职|持股|调剂/.test(text)) {
      return "有关声明";
    }
    if (/自定义|补充/.test(text)) {
      return "自定义资料";
    }

    return text;
  }

  function matchesProfileSectionAlias(value, category) {
    const text = normalizeMatchKey(value);
    if (!text) {
      return false;
    }
    return (PROFILE_SECTION_ALIASES[category] || []).some((alias) => text.includes(normalizeMatchKey(alias)));
  }

  function getCurrentProfileSections() {
    return profileV2ToProfileSections(currentProfileV2);
  }

  function getCurrentProfileEntries() {
    const entries = [];
    for (const section of getCurrentProfileSections()) {
      for (const item of section.items) {
        const itemIndex = entries.length;
        entries.push({
          ...item,
          itemId: item.itemId || `profileV2.unknown.items[${itemIndex}].value`,
          category: section.category,
          sectionKey: section.category,
          aliases: item.aliases || buildProfileItemAliases(section, item)
        });
      }
    }
    return entries;
  }

  function hasCurrentProfileData() {
    return getCurrentProfileSections().length > 0;
  }

  function profileV2ToProfileSections(profileV2) {
    if (!profileV2 || typeof profileV2 !== "object") {
      return [];
    }

    const sections = [];
    const sourceSections = profileV2.sections && typeof profileV2.sections === "object" ? profileV2.sections : {};
    for (const [sectionKey, section] of Object.entries(sourceSections)) {
      appendProfileV2Section(sections, sectionKey, section);
    }
    for (const [index, section] of (Array.isArray(profileV2.customSections) ? profileV2.customSections : []).entries()) {
      appendProfileV2Section(sections, section.key || `custom-${index}`, section, { customSectionIndex: index });
    }

    return sections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => item.label)
      }))
      .filter((section) => section.items.length > 0);
  }

  function appendProfileV2Section(sections, sectionKey, section, location = {}) {
    if (!section || typeof section !== "object") {
      return;
    }

    const category = normalizeProfileCategory(section.title || sectionKey || "其他信息");
    const target = ensureProfileSection(sections, category, section.title || category);
    if (section.kind === "repeat") {
      const items = Array.isArray(section.items) ? section.items : [];
      items.forEach((item, itemIndex) => {
        const baseSubsection = normalizeText(item?.title || `${section.title || category} ${itemIndex + 1}`, 120);
        const familyRelation = category === "家庭信息" ? getFamilyRelationFromProfileItem(item, baseSubsection) : "";
        const subsection = buildProfileItemSubsection(baseSubsection, familyRelation);
        appendProfileV2Values(target, item?.values, {
          sectionKey,
          subsection,
          familyRelation,
          itemIndex,
          customSectionIndex: location.customSectionIndex,
          prefix: `profileV2.sections.${sectionKey}.items[${itemIndex}].values`
        });
        appendProfileV2CustomRows(target, item?.custom, {
          sectionKey,
          subsection,
          familyRelation,
          itemIndex,
          customSectionIndex: location.customSectionIndex,
          prefix: `profileV2.sections.${sectionKey}.items[${itemIndex}].custom`
        });
      });
      return;
    }

    appendProfileV2Values(target, section.values, {
      sectionKey,
      subsection: "",
      familyRelation: "",
      itemIndex: null,
      customSectionIndex: location.customSectionIndex,
      prefix: `profileV2.sections.${sectionKey}.values`
    });
    appendProfileV2CustomRows(target, section.custom, {
      sectionKey,
      subsection: "",
      familyRelation: "",
      itemIndex: null,
      customSectionIndex: location.customSectionIndex,
      prefix: `profileV2.sections.${sectionKey}.custom`
    });
  }

  function getFamilyRelationFromProfileItem(item, fallbackText = "") {
    const titleRelation = getFamilyRelationFromText(fallbackText);
    if (titleRelation) {
      return titleRelation;
    }

    const values = item?.values && typeof item.values === "object" ? item.values : {};
    for (const [label, value] of Object.entries(values)) {
      if (/关系|与本人关系|亲属关系/.test(normalizeMatchKey(label))) {
        const relation = getFamilyRelationFromText(value);
        if (relation) {
          return relation;
        }
      }
    }
    return "";
  }

  function buildProfileItemSubsection(baseSubsection, familyRelation) {
    const base = normalizeText(baseSubsection, 120);
    const relation = normalizeText(familyRelation, 40);
    if (!base) {
      return relation;
    }
    if (!relation || getFamilyRelationFromText(base) === relation) {
      return base;
    }
    return normalizeText(`${base} ${relation}`, 120);
  }

  function ensureProfileSection(sections, category, sourceTitle) {
    let section = sections.find((item) => item.category === category);
    if (!section) {
      section = { category, sourceTitles: [], items: [] };
      sections.push(section);
    }
    if (sourceTitle && !section.sourceTitles.includes(sourceTitle)) {
      section.sourceTitles.push(sourceTitle);
    }
    return section;
  }

  function getProfileSectionTitle(section) {
    if (!section) {
      return "";
    }

    const sourceTitle = Array.isArray(section.sourceTitles)
      ? section.sourceTitles.find((title) => Boolean(normalizeText(title, 120)))
      : "";
    return normalizeText(sourceTitle || section.category || "", 120);
  }

  function appendProfileV2Values(section, values, context) {
    if (!values || typeof values !== "object") {
      return;
    }
    let index = 0;
    for (const [label, value] of Object.entries(values)) {
      appendProfileV2Entry(section, {
        label,
        value,
        subsection: context.subsection,
        familyRelation: context.familyRelation,
        itemId: `${context.prefix}[${index}]`,
        valuePath: {
          sectionKey: context.sectionKey,
          itemIndex: Number.isInteger(context.itemIndex) ? context.itemIndex : null,
          customSectionIndex: Number.isInteger(context.customSectionIndex) ? context.customSectionIndex : null,
          kind: "value",
          label
        }
      });
      index += 1;
    }
  }

  function appendProfileV2CustomRows(section, rows, context) {
    if (!Array.isArray(rows)) {
      return;
    }
    rows.forEach((row, index) => {
      appendProfileV2Entry(section, {
        label: row?.label || "",
        value: row?.value || "",
        subsection: context.subsection,
        familyRelation: context.familyRelation,
        itemId: `${context.prefix}[${index}].value`,
        valuePath: {
          sectionKey: context.sectionKey,
          itemIndex: Number.isInteger(context.itemIndex) ? context.itemIndex : null,
          customSectionIndex: Number.isInteger(context.customSectionIndex) ? context.customSectionIndex : null,
          kind: "custom",
          customIndex: index
        }
      });
    });
  }

  function appendProfileV2Entry(section, entry) {
    const label = normalizeText(entry.label || "", 120);
    const value = String(entry.value == null ? "" : entry.value).trim();
    if (!label || !value) {
      return;
    }

    const item = {
      label,
      value,
      preview: formatQuickCopyValue(value, 96),
      hasValue: true,
      subsection: normalizeText(entry.subsection || "", 120),
      familyRelation: normalizeText(entry.familyRelation || "", 40),
      itemId: entry.itemId || `profileV2.items[${section.items.length}].value`
    };
    if (entry.valuePath) {
      item.valuePath = { ...entry.valuePath };
    }
    item.aliases = buildProfileItemAliases(section, item);
    section.items.push(item);
  }

  function normalizeMatchKey(value) {
    return compactText(value)
      .replace(/[()（）[\]【】<>《》"'“”‘’、,，。．·•\s|:：/\\-]/g, "")
      .replace(/[0-9]/g, "");
  }

  function inferFieldLabel(field) {
    if (field?.siteAdapterId === "hotjob" && field.label) {
      return normalizeHotjobFieldLabel(field.label);
    }
    const candidates = [];
    for (const value of [field?.label, field?.nearbyText, field?.placeholder, field?.name, field?.id, field?.title]) {
      const text = normalizeText(value, 280);
      if (text) {
        candidates.push(text);
      }
    }

    for (const candidate of candidates) {
      const parts = candidate.split(/\s*\|\s*/).map((part) => normalizeText(part, 120)).filter(Boolean);
      for (const part of parts) {
        const cleaned = part
          .replace(/^[*•\s]+/, "")
          .replace(/^[（(]?(必填|选填)[)）]?\s*/, "")
          .replace(/^(请输入|请选择|请填写|请写明|点击选择)\s*/, "")
          .replace(/[:：]\s*(请输入|请选择|上传文件)?$/, "")
          .replace(/\s*(请输入|请选择|点击选择|选择)$/g, "")
          .trim();
        if (
          cleaned &&
          cleaned.length <= 80 &&
          /[\u4e00-\u9fa5A-Za-z]/.test(cleaned) &&
          !/请输入|请选择|上传文件|内容列表|搜索分类或内容|OpenJobAutofill/.test(cleaned)
        ) {
          return cleaned.replace(/^[*•\s]+/, "");
        }
      }
    }

    return normalizeText(field?.label || field?.nearbyText || "", 80);
  }

  function isFamilyRelationLabel(label) {
    const key = normalizeMatchKey(label);
    return /^(关系|与本人关系|亲属关系|家庭关系|社会关系)$/.test(key);
  }

  function isFamilyMemberDetailLabel(label) {
    const key = normalizeMatchKey(label);
    return /^(姓名|出生日期|出生年月|生日|性别|政治面貌|学历|工作单位|单位名称|公司|职务|职位|岗位|联系电话|电话|手机号码|是否退休|退休情况|备注|联系地址|通讯地址|地址|住址)$/.test(key);
  }

  function isFamilyMemberLabel(label) {
    return isFamilyRelationLabel(label) || isFamilyMemberDetailLabel(label);
  }

  function getFamilyContextKey(field) {
    return compactText([
      field?.groupText,
      getFieldOptionLabelsText(field, 180),
      field?.section,
      field?.nearbyText,
      field?.label,
      field?.placeholder
    ].join(" "));
  }

  function isLikelyFamilyMemberContext(field, label = "") {
    const key = getFamilyContextKey(field);
    const labelKey = normalizeMatchKey(label || field?.label || "");
    if (!key || /紧急联系人/.test(key)) {
      return false;
    }

    if (/是否存在亲属.*(应聘单位|本行|我行)|亲属在.*(应聘单位|本行|我行)|有关声明|电子签名/.test(key)) {
      return false;
    }

    if (/家庭情况|家庭信息|家庭及社会关系|社会关系|亲属信息|亲属情况|亲属关系|与本人关系|是否退休/.test(key)) {
      return true;
    }

    if (!isFamilyMemberLabel(labelKey)) {
      return false;
    }

    const indicators = [
      /关系|与本人关系|亲属关系/,
      /姓名/,
      /出生日期|出生年月/,
      /政治面貌/,
      /学历/,
      /工作单位|单位名称|公司/,
      /职务|职位|岗位/,
      /联系电话|手机号码|电话/,
      /是否退休|退休情况/
    ];
    const indicatorCount = indicators.reduce((count, pattern) => count + (pattern.test(key) ? 1 : 0), 0);
    return /关系|与本人关系|亲属关系/.test(key) && indicatorCount >= 4;
  }

  function isFamilyScopedField(field, fieldLabel, fieldCategory) {
    return fieldCategory === "家庭信息" || isLikelyFamilyMemberContext(field, fieldLabel);
  }

  function inferMatchSection(field) {
    if (field?.siteAdapterId === "hotjob" && field.section) {
      const section = normalizeHotjobSectionTitle(field.section);
      if (["基本信息", "自我描述", "教育经历", "实习经历", "项目经历", "语言能力", "培训经历", "计算机技能"].includes(section)) {
        return section;
      }
    }
    const label = normalizeMatchKey(field?.inferredLabel || field?.label || "");
    // Family records reuse labels such as 姓名、电话 and 出生日期. Their
    // surrounding relationship context must outrank the generic personal
    // field shortcut below.
    if (isLikelyFamilyMemberContext(field, label)) {
      return "家庭信息";
    }
    const personalKind = getPersonalFieldKind(label);
    if (personalKind === "selfEvaluation") return "自我描述";
    if (personalKind === "hobby") return "其他信息";
    if (personalKind === "internshipPeriod" || personalKind === "internshipStart") return "实习经历";
    if (personalKind === "highestEnglishCertificate") return "证书技能";
    if (personalKind === "englishLevel") return "外语能力";
    if (personalKind === "highestSchoolQualification") return "教育经历";
    if (personalKind === "highestEducation" && /教育经历/.test(normalizeMatchKey([field?.section, field?.groupText].join(" ")))) {
      return "教育经历";
    }
    if (personalKind === "highestEducation" || personalKind === "height" || personalKind === "weight" || personalKind === "profileSource") {
      return "基本信息";
    }
    if (personalKind === "interviewSite") return "求职意向";
    if (personalKind) return "基本信息";
    const text = compactText([field?.groupText, getFieldOptionLabelsText(field, 180), field?.section, field?.nearbyText, field?.label].join(" "));
    if (!text) {
      return "";
    }

    if (/自我评价|自我描述|自我介绍|相关情况说明/.test(text)) {
      return "自我描述";
    }
    if (/取得证书资质|证书资质/.test(label)) {
      return "证书技能";
    }
    if (/近三年年度绩效考核|绩效考核|考核年度|考核等级/.test(text)) {
      return "绩效考核";
    }
    if (/证明人|联系方式|备注/.test(label) && /排名|考核|绩效|证明人/.test(text) && !/实习|实践|项目/.test(text)) {
      return "绩效考核";
    }
    if (/专业技术资格|职业资格|职称/.test(text)) {
      return "专业资格";
    }
    if (/有关声明|声明|永居权|永久居留|背景调查|事实完全相符|非法组织|重大疾病|传染病|行政处罚|失信被执行人|境外居留|第三方企业|任兼职|持有企业股权|用人单位辞退/.test(text)) {
      return "有关声明";
    }
    if (/家庭情况|家庭信息|家庭及社会关系|社会关系|亲属信息|亲属情况|亲属关系|与本人关系|是否退休/.test(text)) {
      return "家庭信息";
    }
    if (/求职意向|意向岗位|预计入职|期望工作城市|期望薪资|当前薪资|当前年收入|面试城市|意向城市|目标岗位|简历来源|目前工作地/.test(text)) {
      return "求职意向";
    }
    if (
      /个人信息|基本信息/.test(text) ||
      /^(姓名|性别|出生日期|民族|政治面貌|籍贯|户口所在地|现户口所在地|当前居住地|当前居住地详细地址|净身高cm|身高|体重kg|体重|血型|婚姻状况|电子邮箱|手机号码|电话)$/.test(label)
    ) {
      return "基本信息";
    }
    if (/证书信息|证书类别|证书名称|发证单位|证书编号/.test(text)) {
      return "证书技能";
    }
    if (/教育经历|学历|学校名称|学院名称|专业名称|培养方式|升学类型/.test(text)) {
      return "教育经历";
    }
    if (/工作经历|有无工作经历|现工作单位|当前工作单位|工作职责/.test(text)) {
      return "工作经历";
    }
    if (matchesProfileSectionAlias(text, "项目经历") || /项目名称|项目职责|项目描述|项目简述|项目成果/.test(text)) {
      return "项目经历";
    }
    if (/工作实习经历|工作\/实习经历|实习经历|实践|单位名称|职位名称/.test(text)) {
      return "实习经历";
    }
    if (/在校职务|社团|学生工作|部门名称/.test(text)) {
      return /学生工作/.test(text) ? "学生工作" : "社团工作";
    }
    if (/奖惩信息|奖惩情况|奖惩名称|奖惩时间|奖励|荣誉|获奖|学术成果/.test(text)) {
      return "奖惩情况";
    }
    if (/技能|资格证书|证书|计算机水平|其它技能|语言能力|语言类型|四六级|六级|四级|TOEFL|IELTS|GRE|GMAT/i.test(text)) {
      if (/语言|外语|四六级|六级|四级|TOEFL|IELTS|GRE|GMAT/i.test(text)) {
        return "外语能力";
      }
      if (/计算机|IT技能|计算机水平|其它技能/.test(text)) {
        return "计算机技能";
      }
      return "证书技能";
    }
    if (/培训经历|培训名称|培训机构|培训课程/.test(text)) {
      return "培训经历";
    }
    if (/论文|著作|刊物名称|论文名称/.test(text)) {
      return "论文著作";
    }
    if (/专利|专利名称|专利编号/.test(text)) {
      return "专利成果";
    }
    if (/受到奖励|学术成果|社会校园活动|社会\/校园活动|校园活动|兴趣爱好|特长|爱好及专长/.test(text)) {
      return "其他信息";
    }
    if (/是否|有无|能否|同意|接受|服从/.test(text) && /亲属|调剂|背景|居留|疾病|处罚|任职|持股|股票/.test(text)) {
      return "有关声明";
    }
    if (/其他信息|其他个人情况|附加信息|附加问题/.test(text)) {
      return "其他信息";
    }
    return "";
  }

  function buildProfileItemAliases(section, item) {
    const aliases = new Set();
    const label = normalizeText(item?.label || "", 120);
    const subsection = normalizeText(item?.subsection || "", 120);
    const category = normalizeText(section?.category || "", 120);
    const labelKey = normalizeMatchKey(label);

    if (label) {
      aliases.add(label);
      aliases.add(labelKey);
    }
    if (subsection) {
      aliases.add(subsection);
      aliases.add(normalizeMatchKey(subsection));
    }
    if (category) {
      aliases.add(category);
      aliases.add(normalizeMatchKey(category));
      for (const alias of PROFILE_SECTION_ALIASES[category] || []) {
        aliases.add(alias);
        aliases.add(normalizeMatchKey(alias));
      }
    }

    const aliasList = PROFILE_LABEL_ALIASES[label] || PROFILE_LABEL_ALIASES[labelKey] || [];
    for (const alias of aliasList) {
      aliases.add(alias);
      aliases.add(normalizeMatchKey(alias));
    }

    // Also resolve the reverse direction: the profile may store a label such
    // as “移动电话” or “国籍（国家或地区）”, while the page uses the canonical
    // label “手机号码” or “国籍”. This keeps alias matching fuzzy without
    // treating unrelated values as candidates.
    for (const [canonical, mappedAliases] of Object.entries(PROFILE_LABEL_ALIASES)) {
      if (normalizeMatchKey(canonical) === labelKey || mappedAliases.some((alias) => normalizeMatchKey(alias) === labelKey)) {
        aliases.add(canonical);
        aliases.add(normalizeMatchKey(canonical));
        for (const alias of mappedAliases) {
          aliases.add(alias);
          aliases.add(normalizeMatchKey(alias));
        }
      }
    }

    return Array.from(aliases).filter(Boolean);
  }

  function buildProfileCatalogFromEntries(entries) {
    const sectionMap = new Map();
    const fields = [];

    for (const entry of entries) {
      if (!entry?.itemId || !entry?.label) {
        continue;
      }

      const field = {
        path: entry.itemId,
        label: [entry.category, entry.subsection, entry.label].filter(Boolean).join(" / "),
        aliases: Array.from(new Set([entry.label, entry.subsection, entry.category, ...(entry.aliases || [])].filter(Boolean)))
      };
      fields.push(field);

      const key = entry.category || "本地资料";
      if (!sectionMap.has(key)) {
        sectionMap.set(key, {
          key,
          title: key,
          fields: []
        });
      }
      sectionMap.get(key).fields.push(field);
    }

    return {
      sections: Array.from(sectionMap.values()),
      fields
    };
  }

  function getProfileEntryByPath(entries, path) {
    if (!path) {
      return null;
    }
    return entries.find((entry) => entry.itemId === path) || null;
  }

  function getScanFieldById(scan, fieldId) {
    const fields = Array.isArray(scan?.fields) ? scan.fields : [];
    return fields.find((field) => field.fieldId === fieldId) || null;
  }

  function getEntryCategoryBonus(fieldCategory, entryCategory) {
    if (!fieldCategory || !entryCategory) {
      return 0;
    }

    if (fieldCategory === entryCategory) {
      return 14;
    }

    const compatiblePairs = new Map([
      ["基本信息", ["其他信息", "教育经历", "求职意向"]],
      ["求职意向", ["基本信息", "其他信息"]],
      ["教育经历", ["基本信息"]],
      ["实习经历", ["项目经历"]],
      ["项目经历", []],
      ["工作经历", ["实习经历"]],
      ["绩效考核", ["工作经历"]],
      ["社团工作", ["学生工作"]],
      ["学生工作", ["社团工作"]],
      ["专业资格", ["证书技能"]],
      ["外语能力", ["语言能力", "证书技能"]],
      ["语言能力", ["外语能力", "证书技能"]],
      ["计算机技能", ["证书技能", "其他信息"]],
      ["证书技能", ["外语能力", "计算机技能", "其他信息", "专业资格"]],
      ["自我描述", ["其他信息"]],
      ["有关声明", ["其他信息"]]
    ]);

    const compatible = compatiblePairs.get(fieldCategory) || [];
    return compatible.includes(entryCategory) ? 6 : -8;
  }

  function isExplanatoryField(text) {
    const key = normalizeMatchKey(text);
    if (/自我评价|自我描述|自我介绍|相关情况说明/.test(key)) {
      return false;
    }
    return /原因|说明|理由|备注/.test(key);
  }

  function isExplanatoryEntry(text) {
    return /原因|说明|理由|备注/.test(normalizeMatchKey(text));
  }

  function isCategoryCompatibleForMapping(fieldCategory, entryCategory) {
    if (!fieldCategory || !entryCategory) {
      return true;
    }

    if (fieldCategory === entryCategory) {
      return true;
    }

    const compatiblePairs = new Map([
      ["基本信息", ["其他信息", "教育经历", "求职意向"]],
      ["求职意向", ["基本信息", "其他信息"]],
      ["实习经历", ["项目经历", "工作经历"]],
      ["工作经历", ["实习经历"]],
      ["绩效考核", ["工作经历"]],
      ["项目经历", []],
      ["社团工作", ["学生工作"]],
      ["学生工作", ["社团工作"]],
      ["专业资格", ["证书技能"]],
      ["外语能力", ["语言能力", "证书技能"]],
      ["语言能力", ["外语能力", "证书技能"]],
      ["计算机技能", ["证书技能", "其他信息"]],
      ["证书技能", ["外语能力", "语言能力", "计算机技能", "专业资格"]],
      ["有关声明", ["其他信息"]],
      ["自我描述", ["其他信息"]],
      ["其他信息", ["有关声明", "奖惩情况", "社团工作", "学生工作", "自我描述"]]
    ]);

    return (compatiblePairs.get(fieldCategory) || []).includes(entryCategory);
  }

  function isNameLikeLabel(labelKey) {
    return /姓名|联系人|证明人|推荐人|介绍人/.test(labelKey);
  }

  function isPhoneLikeLabel(labelKey) {
    return /电话|手机|联系方式|联系电话|手机号/.test(labelKey);
  }

  function isRoleLikeLabel(labelKey) {
    return /职务|职位|岗位|角色/.test(labelKey);
  }

  function isRelationLikeLabel(labelKey) {
    return /关系|与本人关系|亲属关系/.test(labelKey);
  }

  function hasRelationLikeOptions(optionText) {
    return /父亲|母亲|爸爸|妈妈|配偶|爱人|丈夫|妻子|兄弟|姐妹|哥哥|姐姐|弟弟|妹妹|儿子|女儿|朋友|同学|同事|亲属|关系/.test(optionText);
  }

  function getContextualAddressBucket(key, labelKey) {
    const provinceLike = /省|省份/.test(labelKey);
    const cityLike = /市|城市|地区/.test(labelKey);
    const addressLike = /地址|住址|详细地址|街道|门牌|通讯|通信|邮寄|收件/.test(labelKey);

    if (/籍贯/.test(key)) {
      if (provinceLike || /籍贯省/.test(key)) {
        return "nativeProvince";
      }
      if (cityLike || /籍贯市/.test(key)) {
        return "nativeCity";
      }
      return "nativePlace";
    }

    if (/生源地|生源户口|生源所在地/.test(key)) {
      if (provinceLike || /生源地省/.test(key)) {
        return "sourceProvince";
      }
      if (cityLike || /生源地市/.test(key)) {
        return "sourceCity";
      }
      return "sourcePlace";
    }

    if (/户口|户籍/.test(key)) {
      if (provinceLike || /户口所在地省|户籍所在地省/.test(key)) {
        return "hukouProvince";
      }
      if (cityLike || /户口所在地市|户籍所在地市/.test(key)) {
        return "hukouCity";
      }
      return "hukouPlace";
    }

    if (/通讯地址|通信地址|联系地址|邮寄地址|收件地址/.test(key)) {
      return "mailingAddress";
    }

    if (/当前居住|现居住|现居地|居住城市|居住地|现住址/.test(key)) {
      if (addressLike || /详细地址|地址|住址|街道|门牌/.test(key)) {
        return "currentResidenceAddress";
      }
      return "currentResidenceCity";
    }

    return "";
  }

  function getContextualSemanticBucket(field, fieldLabel, fieldCategory) {
    const labelKey = normalizeMatchKey(fieldLabel || field?.label || "");
    const optionText = getFieldOptionLabelsText(field, 200);
    const key = compactText([
      fieldCategory,
      field?.groupText,
      field?.section,
      field?.nearbyText,
      field?.label,
      field?.placeholder,
      field?.name,
      field?.id,
      optionText
    ].join(" "));

    if (!key) {
      return "";
    }

    if (
      /家庭信息|家庭情况|家庭及社会关系|社会关系|亲属信息|亲属情况|亲属关系/.test(key) &&
      !/是否存在亲属.*(应聘单位|本行|我行)|亲属在.*(应聘单位|本行|我行)|有关声明|电子签名/.test(key)
    ) {
      if (isRelationLikeLabel(labelKey) || hasRelationLikeOptions(optionText)) {
        return "familyRelation";
      }
      if (/姓名/.test(labelKey)) {
        return "familyName";
      }
      if (/出生日期|出生年月|生日/.test(labelKey)) {
        return "familyBirthDate";
      }
      if (/政治面貌/.test(labelKey)) {
        return "familyPoliticalStatus";
      }
      if (/学历/.test(labelKey)) {
        return "familyEducationLevel";
      }
      if (/工作单位|单位名称|公司/.test(labelKey)) {
        return "familyEmployer";
      }
      if (isRoleLikeLabel(labelKey)) {
        return "familyRole";
      }
      if (isPhoneLikeLabel(labelKey)) {
        return "familyPhone";
      }
      if (/联系地址|通讯地址|地址|住址/.test(labelKey)) {
        return "familyAddress";
      }
      if (/是否退休|退休情况/.test(labelKey)) {
        return "familyRetired";
      }
    }

    if (/绩效考核|考核年度|考核等级/.test(key)) {
      if (isPhoneLikeLabel(labelKey)) {
        return "performanceContact";
      }
      if (isNameLikeLabel(labelKey)) {
        return "performanceReference";
      }
      if (/排名/.test(labelKey) || /排名/.test(key)) {
        return "performanceRank";
      }
      if (/绩效考核等级|考核等级/.test(labelKey) || /绩效考核等级|考核等级/.test(key)) {
        return "performanceLevel";
      }
      if (/说明|评语|备注/.test(labelKey) || /说明|评语|备注/.test(key)) {
        return "performanceNote";
      }
    }

    if (/紧急联系人|紧急联系方式/.test(key)) {
      if (isRelationLikeLabel(labelKey) || hasRelationLikeOptions(optionText)) {
        return "emergencyRelation";
      }
      if (isPhoneLikeLabel(labelKey)) {
        return "emergencyPhone";
      }
      if (isNameLikeLabel(labelKey) || /紧急联系人/.test(labelKey)) {
        return "emergencyContact";
      }
    }

    if (/证明人|推荐人|介绍人/.test(key) && !/紧急联系人/.test(key)) {
      if (isPhoneLikeLabel(labelKey)) {
        return "referencePhone";
      }
      if (isRoleLikeLabel(labelKey)) {
        return "referenceRole";
      }
      if (isNameLikeLabel(labelKey)) {
        return "referenceName";
      }
    }

    return getContextualAddressBucket(key, labelKey);
  }

  function getSemanticBucket(text, category = "") {
    const key = normalizeMatchKey([category, text].join(" "));
    if (!key) {
      return "";
    }

    const labelKey = normalizeMatchKey(text);
    if (category === "教育经历") {
      const educationBuckets = { 学历: "educationLevel", 学位: "degree", 学历形式: "trainingMode", 学习形式: "trainingMode", 学习方式: "trainingMode", 培养方式: "trainingMode", 是否挂科: "failedCourses", 有无挂科: "failedCourses", 班级排名: "classRank", 专业排名: "majorRank", 成绩gpa: "gpaScore", gpa: "gpaScore", 绩点: "gpaScore", 成绩: "gpaScore" };
      if (educationBuckets[labelKey]) return educationBuckets[labelKey];
    }

    if (/^(项目角色|担任角色)$/.test(labelKey)) {
      return "role";
    }
    if (category === "项目经历" && labelKey === "描述") {
      return "projectDescription";
    }

    if (/是否存在亲属.*(应聘单位|本行|我行)|亲属在.*(应聘单位|本行|我行)/.test(key)) {
      return "declarationRelativeAtEmployer";
    }

    if (/家庭信息|家庭情况|家庭及社会关系|社会关系|亲属信息|亲属情况|亲属关系/.test(key)) {
      if (/与本人关系|亲属关系|^家庭信息关系$|关系/.test(key)) {
        return "familyRelation";
      }
      if (/姓名/.test(key)) {
        return "familyName";
      }
      if (/出生日期|出生年月|生日/.test(key)) {
        return "familyBirthDate";
      }
      if (/政治面貌/.test(key)) {
        return "familyPoliticalStatus";
      }
      if (/学历/.test(key)) {
        return "familyEducationLevel";
      }
      if (/工作单位|单位名称|公司/.test(key)) {
        return "familyEmployer";
      }
      if (/职务|职位|岗位/.test(key)) {
        return "familyRole";
      }
      if (/联系电话|手机号码|电话/.test(key)) {
        return "familyPhone";
      }
      if (/联系地址|通讯地址|地址|住址/.test(key)) {
        return "familyAddress";
      }
      if (/是否退休|退休情况/.test(key)) {
        return "familyRetired";
      }
      if (/备注/.test(key)) {
        return "familyNote";
      }
    }

    if (/是否患有|传染病|高血压|心脏病|糖尿病|肾炎|精神病|影响工作的疾病|重大疾病/.test(key)) {
      return "declarationDisease";
    }
    if (/第三方企业|任兼职|持有企业股权|私募股权/.test(key)) {
      return "declarationThirdPartyEquity";
    }
    if (/不良行为记录|犯罪记录|行政处罚|党纪处分|违纪违规|失信被执行人/.test(key)) {
      return "declarationBadRecord";
    }
    if (/用人单位辞退|曾被辞退|辞退情况/.test(key)) {
      return "declarationDismissed";
    }
    if (/金融机构营销|业务风险/.test(key)) {
      return "declarationFinancialMarketingRisk";
    }
    if (/境外.*(长期|永久)居留权|永久居留权|永居权/.test(key)) {
      return "declarationOverseasResidence";
    }
    if (/教育经历.*最高学历/.test(key)) {
      return "isHighestEducation";
    }
    if (/最高全日制学历/.test(key)) {
      return "highestFullTimeEducation";
    }
    if (/最高学历/.test(key)) {
      return "highestEducationLevel";
    }
    if (/身高|净身高/.test(key)) {
      return "height";
    }
    if (/体重/.test(key)) {
      return "weight";
    }
    if (/面试站点|面试地点|面试城市|可面试城市/.test(key)) {
      return "interviewSite";
    }
    if (/是否海外学历|是否海外教育经历|是否为海外教育经历/.test(key)) {
      return "overseasEducation";
    }
    if (/毕（结、肆）业|毕结肆业|毕业状态|毕业结业肄业在读/.test(key)) {
      return "graduationStatus";
    }
    if (/学历证书号/.test(key)) {
      return "educationCertificate";
    }
    if (/^学历$|学历层次|教育经历学历/.test(key)) {
      return "educationLevel";
    }
    if (/是否挂科|有无挂科|是否有挂科|是否有不及格科目/.test(key)) return "failedCourses";
    if (/^学位$|学位类型|教育经历学位/.test(key)) {
      return "degree";
    }
    if (/绩效考核|考核年度|考核等级/.test(key)) {
      if (/联系方式|联系电话|电话/.test(key)) {
        return "performanceContact";
      }
      if (/证明人|推荐人/.test(key)) {
        return "performanceReference";
      }
      if (/排名/.test(key)) {
        return "performanceRank";
      }
      if (/绩效考核等级|考核等级/.test(key)) {
        return "performanceLevel";
      }
      if (/说明|评语|备注/.test(key)) {
        return "performanceNote";
      }
    }
    if (/专业技术资格|职业资格|职称/.test(key)) {
      if (/有无|是否/.test(key)) {
        return "professionalQualificationAvailable";
      }
      if (/职业资格证书|资格证书/.test(key)) {
        return "professionalCertificate";
      }
      return "professionalQualification";
    }
    if (/学校所在国家|学校国家/.test(key)) {
      return "schoolCountry";
    }
    if (/姓拼音|姓氏拼音/.test(key)) {
      return "lastNamePinyin";
    }
    if (/名拼音|名字拼音/.test(key)) {
      return "firstNamePinyin";
    }
    if (/^姓名$|真实姓名/.test(key)) {
      return "fullName";
    }
    if (/^姓$|中文姓|姓氏/.test(key)) {
      return "lastName";
    }
    if (/^名$|中文名|名字/.test(key)) {
      return "firstName";
    }
    if (/国籍|国家或地区/.test(key) && !/学校/.test(key)) {
      return "nationality";
    }
    if (/证件类型|身份证件类型/.test(key)) {
      return "idType";
    }
    if (/证件号码|身份证号|身份证号码/.test(key)) {
      return "idNumber";
    }
    if (/民族/.test(key)) {
      return "ethnicity";
    }
    if (/政治面貌|政治身份/.test(key)) {
      return "politicalStatus";
    }
    if (/婚姻状况|婚姻状态/.test(key)) {
      return "maritalStatus";
    }
    if (/血型|血液类型/.test(key)) {
      return "bloodType";
    }
    if (/净身高|身高/.test(key)) {
      return "height";
    }
    if (/体重/.test(key)) {
      return "weight";
    }
    if (/确认邮箱|再次输入邮箱/.test(key)) {
      return "confirmEmail";
    }
    if (/电子邮箱|邮箱|email|mail/.test(key)) {
      return "email";
    }
    if (/qq/.test(key)) {
      return "qq";
    }
    if (/紧急联系人手机|紧急联系人电话/.test(key)) {
      return "emergencyPhone";
    }
    if (/与紧急联系人关系|紧急联系人关系/.test(key)) {
      return "emergencyRelation";
    }
    if (/紧急联系人/.test(key)) {
      return "emergencyContact";
    }
    if (/证明人联系方式|证明人电话|证明人手机号/.test(key)) {
      return "referencePhone";
    }
    if (/证明人职位|证明人职务/.test(key)) {
      return "referenceRole";
    }
    if (/证明人姓名|证明人|推荐人/.test(key)) {
      return "referenceName";
    }
    if (/手机号码|手机号|手机|联系电话|电话号码/.test(key)) {
      return "phone";
    }
    if (/微信|wechat/.test(key)) {
      return "wechat";
    }
    if (/预计入职时间|可入职时间|到岗时间/.test(key)) {
      return "availableDate";
    }
    if (/简历名称|简历标题/.test(key)) {
      return "resumeTitle";
    }
    if (/有无工作经历|是否有工作经历/.test(key)) {
      return "workExperienceAvailable";
    }
    if (/离职原因|离开原因/.test(key)) {
      return "leavingReason";
    }
    if (/意向岗位|目标岗位|应聘岗位|申请岗位/.test(key)) {
      return "targetPosition";
    }
    if (/当前薪资|目前薪资|现薪资/.test(key)) {
      return "currentSalary";
    }
    if (/当前年收入|目前年收入|现年收入/.test(key)) {
      return "currentAnnualIncome";
    }
    if (/期望薪资|期望年薪|期望月薪|期望年收入/.test(key)) {
      return "expectedSalary";
    }
    if (/期望工作城市|意向工作城市|期望城市|意向城市/.test(key)) {
      return "expectedCity";
    }
    if (/面试城市|可面试城市/.test(key)) {
      return "interviewCity";
    }
    if (/当前居住地详细地址|现居住详细地址|现居住地址|居住地址|现住址|当前地址/.test(key)) {
      return "currentResidenceAddress";
    }
    if (/当前居住地|现居住地|现居住城市|居住城市|现居地/.test(key)) {
      return "currentResidenceCity";
    }
    if (/通讯地址|通信地址|联系地址|邮寄地址|收件地址/.test(key)) {
      return "mailingAddress";
    }
    if (/出生日期|出生年月|生日/.test(key)) {
      return "birthDate";
    }
    if (/开始时间|入学时间|开始日期/.test(key)) {
      return "startDate";
    }
    if (/结束时间|毕业时间|取得毕业证时间|截止时间/.test(key)) {
      return "endDate";
    }
    if (/培养方式|学习形式|学历形式|学习方式|教育类型/.test(key)) {
      return "trainingMode";
    }
    if (/学制|学习年限/.test(key)) {
      return "studyLength";
    }
    if (/学号|学生证号/.test(key)) {
      return "studentId";
    }
    if (/学校名称|毕业院校|院校名称/.test(key)) {
      return "school";
    }
    if (/院系|学院名称/.test(key)) {
      return "department";
    }
    if (/专业类型|专业名称|所学专业|专业$/.test(key)) {
      return "major";
    }
    if (/现工作单位|当前工作单位/.test(key)) {
      return "currentEmployer";
    }
    if (/工作单位|单位名称|公司名称|^公司$|实习单位/.test(key)) {
      return "employer";
    }
    if (/部门/.test(key)) {
      return "department";
    }
    if (/职务|岗位|职位(?:名称)?/.test(key)) {
      return "role";
    }
    if (/籍贯省/.test(key)) {
      return "nativeProvince";
    }
    if (/籍贯市/.test(key)) {
      return "nativeCity";
    }
    if (/^籍贯$|籍贯所在地/.test(key)) {
      return "nativePlace";
    }
    if (/生源地省/.test(key)) {
      return "sourceProvince";
    }
    if (/生源地市/.test(key)) {
      return "sourceCity";
    }
    if (/^生源地$|生源所在地|生源户口/.test(key)) {
      return "sourcePlace";
    }
    if (/现户口所在地省|户口所在地省|户籍所在地省/.test(key)) {
      return "hukouProvince";
    }
    if (/现户口所在地市|户口所在地市|户籍所在地市/.test(key)) {
      return "hukouCity";
    }
    if (/现户口所在地|户口所在地|户籍所在地/.test(key)) {
      return "hukouPlace";
    }
    if (/工作实习地点省|工作地点省|实习地点省/.test(key)) {
      return "workProvince";
    }
    if (/工作实习地点市|工作地点市|实习地点市/.test(key)) {
      return "workCity";
    }
    if (/工作实习地点|工作地点|实习地点/.test(key)) {
      return "workPlace";
    }
    if (/高考所在地省/.test(key)) {
      return "examProvince";
    }
    if (/高考所在地市/.test(key)) {
      return "examCity";
    }
    if (/高考所在地|高考省份/.test(key)) {
      return "examPlace";
    }
    if (/平均学分成绩gpa|有无gpa|是否有gpa/.test(key) && !/分数|满分|评价体系/.test(key)) {
      return "gpaAvailable";
    }
    if (/gpa分数|绩点分数|平均学分成绩.*分数|请输入gpa分数数字|^成绩gpa$|^gpa$|^绩点$|^成绩$/.test(key)) {
      return "gpaScore";
    }
    if (/gpa满分|绩点满分|4分制|5分制|评价体系/.test(key)) {
      return "gpaScale";
    }
    if (/班级排名|专业排名/.test(key) && /原因/.test(key)) {
      return "rankReason";
    }
    if (/班级排名/.test(key)) {
      return "classRank";
    }
    if (/专业排名/.test(key)) {
      return "majorRank";
    }
    if (/高考总分|总分数/.test(key)) {
      return "examTotal";
    }
    if (/高考科目|文理科/.test(key)) {
      return "examSubject";
    }
    if (/高考时间/.test(key)) {
      return "examDate";
    }
    if (/六级获得时间|六级获取日期|六级取得时间/.test(key)) {
      return "cet6Date";
    }
    if (/六级有效期/.test(key)) {
      return "cet6ValidUntil";
    }
    if (/六级分数/.test(key)) {
      return "cet6Score";
    }
    if (/^六级$|大学英语六级|cet6/.test(key)) {
      return "cet6Taken";
    }
    if (/四级获得时间|四级获取日期|四级取得时间/.test(key)) {
      return "cet4Date";
    }
    if (/四级有效期/.test(key)) {
      return "cet4ValidUntil";
    }
    if (/四级分数/.test(key)) {
      return "cet4Score";
    }
    if (/^四级$|大学英语四级|cet4/.test(key)) {
      return "cet4Taken";
    }
    if (/toefl.*分数|托福.*分数/.test(key)) {
      return "toeflScore";
    }
    if (/ielts.*分数|雅思.*分数/.test(key)) {
      return "ieltsScore";
    }
    if (/gre.*分数/.test(key)) {
      return "greScore";
    }
    if (/gmat.*分数/.test(key)) {
      return "gmatScore";
    }
    if (/^toefl$|托福/.test(key)) {
      return "toeflTaken";
    }
    if (/^ielts$|雅思/.test(key)) {
      return "ieltsTaken";
    }
    if (/^gre$/.test(key)) {
      return "greTaken";
    }
    if (/^gmat$/.test(key)) {
      return "gmatTaken";
    }
    if (/外语种类|外语语种|语言类型|语种/.test(key)) {
      return "languageType";
    }
    if (/证书名称技能名称|证书名称|技能名称/.test(key) && /外语|语言|英语|六级|四级|cet|toefl|ielts|gre|gmat/i.test(key)) {
      return "languageCertificate";
    }
    if (/掌握程度|熟练程度|语言水平|外语水平/.test(key)) {
      return "proficiency";
    }
    if (/听说能力|听说/.test(key)) {
      return "listeningSpeaking";
    }
    if (/读写能力|读写/.test(key)) {
      return "readingWriting";
    }
    if (/证书类别|证书类型|资格证书类别/.test(key)) {
      return "certificateCategory";
    }
    if (/证书编号|证书号码/.test(key)) {
      return "certificateNumber";
    }
    if (/证书获得时间|证书取得时间|获得时间|获取日期|取得时间/.test(key) && /证书|技能|外语|语言|英语|六级|四级|cet|toefl|ielts|gre|gmat/i.test(key)) {
      return "certificateDate";
    }
    if (/授予单位|颁发单位|发证机构|证书颁发单位/.test(key)) {
      return "certificateIssuer";
    }
    if (/证书说明|证书描述|证书备注/.test(key)) {
      return "certificateNote";
    }
    if (/考试分数|高考分数|分数/.test(key)) {
      return "examScore";
    }
    if (/项目名称|实践名称/.test(key)) {
      return "projectName";
    }
    if (/参与人数|团队人数|项目人数/.test(key)) {
      return "projectPeople";
    }
    if (/项目内容|项目描述|项目简述/.test(key)) {
      return "projectDescription";
    }
    if (/工作职责|工作内容/.test(key)) return "description";
    if (/本人职责|个人职责|职责/.test(key)) {
      return "responsibility";
    }
    if (/项目成果|项目绩效|实践成果|工作成果|实习成果/.test(key)) {
      return "result";
    }
    if (/项目链接|项目地址|作品链接/.test(key)) {
      return "projectUrl";
    }
    if (/工作内容描述|工作内容|实践内容|职责描述/.test(key)) {
      return "description";
    }
    if (/奖惩解除时间|处分解除时间|解除时间/.test(key)) {
      return "awardReleaseDate";
    }
    if (/奖惩时间|获奖时间|奖励时间/.test(key)) {
      return "awardDate";
    }
    if (/奖惩名称|获奖名称|奖励名称|奖项名称|荣誉名称/.test(key) || normalizeMatchKey(text) === "奖项") {
      return "awardName";
    }
    if (/颁奖单位|授奖单位|奖惩单位/.test(key)) {
      return "awardIssuer";
    }
    if (/奖励等级|奖项等级|奖励级别|奖惩层级|获奖级别/.test(key)) {
      return "awardLevel";
    }
    if (/奖惩描述|获奖描述|奖励描述|奖惩原因/.test(key)) {
      return "awardDescription";
    }
    if (/培训名称|培训项目/.test(key)) {
      return "trainingName";
    }
    if (/培训机构|培训单位/.test(key)) {
      return "trainingOrg";
    }
    if (/培训地点|培训城市|培训地址/.test(key)) {
      return "trainingPlace";
    }
    if (/培训课程/.test(key)) {
      return "trainingCourse";
    }
    if (/培训获得证书|培训证书/.test(key)) {
      return "trainingCertificate";
    }
    if (/培训内容|培训描述/.test(key)) {
      return "trainingDescription";
    }
    if (/刊物名称|期刊名称|发表刊物/.test(key)) {
      return "publication";
    }
    if (/刊物层级|期刊层级/.test(key)) {
      return "publicationLevel";
    }
    if (/论文名称|论文题目|文章名称/.test(key)) {
      return "paperName";
    }
    if (/论文描述|论文摘要|论文说明/.test(key)) {
      return "paperDescription";
    }
    if (/专利名称|专利题目/.test(key)) {
      return "patentName";
    }
    if (/专利编号|专利号/.test(key)) {
      return "patentNumber";
    }
    if (/专利类型/.test(key)) {
      return "patentType";
    }
    if (/专利成果|专利描述|专利说明/.test(key)) {
      return "patentResult";
    }
    if (/是否退休|有无退休/.test(key)) {
      return "retired";
    }
    if (/爱好及专长|特长爱好/.test(key)) {
      return "hobby";
    }
    if (/社会校园活动|社会活动|校园活动/.test(key)) {
      return "activity";
    }
    if (/受到奖励|学术成果|奖励学术成果/.test(key)) {
      return "achievement";
    }
    if (/自我评价|个人评价/.test(key)) {
      return "selfEvaluation";
    }
    if (/招聘信息来源|简历来源|信息来源/.test(key)) {
      return "source";
    }
    return "";
  }

  function getFirstSemanticBucket(parts, category = "") {
    for (const part of parts || []) {
      const bucket = getSemanticBucket(part, category);
      if (bucket) {
        return bucket;
      }
    }
    return "";
  }

  function getFieldSemanticBucket(field, fieldLabel, fieldCategory) {
    if (fieldCategory === "工作经历" && /^(工作职责|工作内容)$/.test(normalizeMatchKey(fieldLabel))) return "description";
    if (fieldCategory === "项目经历") {
      const label = normalizeMatchKey(fieldLabel || field?.label || "");
      // Explicit project labels must not inherit neighbouring date/role semantics.
      if (label === "职务") return "role";
      if (/^(项目名称|项目角色|担任角色|职位|项目职责|本人职责|职责|项目链接|项目描述|项目内容|项目简述|描述|开始时间|结束时间)$/.test(label)) {
        return getSemanticBucket(label, fieldCategory);
      }
    }
    if (field?.siteAdapterId === "zhiye" && fieldCategory !== "家庭信息") {
      const explicit = normalizeMatchKey(fieldLabel || field.label || "");
      if (fieldCategory === "教育经历" && /^(学历|学位|学历形式|学习形式|学习方式|是否挂科|班级排名|专业排名|成绩gpa|gpa|绩点|成绩)$/.test(explicit)) return getSemanticBucket(explicit, fieldCategory);
      if (/^(姓名|学校名称|专业名称|公司名称|职位名称|职务|项目绩效|项目成果|开始时间|结束时间)$/.test(explicit)) {
        return getSemanticBucket(explicit, fieldCategory);
      }
    }
    const useSemanticGroupContext =
      ["家庭信息", "绩效考核", "教育经历", "实习经历", "工作经历", "项目经历", "奖惩情况"].includes(fieldCategory) ||
      isLikelyFamilyMemberContext(field, fieldLabel);
    const semanticField = useSemanticGroupContext
      ? field
      : { ...field, groupText: "" };
    const contextualBucket = getContextualSemanticBucket(semanticField, fieldLabel, fieldCategory);
    if (contextualBucket) {
      return contextualBucket;
    }

    return getFirstSemanticBucket(
      [
        fieldLabel,
        field?.label,
        field?.placeholder,
        field?.name,
        field?.id,
        field?.nearbyText,
        field?.groupText,
        getFieldOptionLabelsText(field, 180)
      ],
      fieldCategory
    );
  }

  function getEntrySemanticBucket(entry) {
    return getFirstSemanticBucket(
      [
        entry?.label,
        entry?.subsection,
        ...(entry?.aliases || [])
      ],
      entry?.category
    );
  }

  function canProjectEntryValueToFieldBucket(fieldBucket, entryBucket) {
    const projectionMap = {
      nativePlace: ["nativeProvince", "nativeCity"],
      nativeProvince: ["nativePlace"],
      nativeCity: ["nativePlace"],
      sourcePlace: ["sourceProvince", "sourceCity"],
      sourceProvince: ["sourcePlace"],
      sourceCity: ["sourcePlace"],
      hukouPlace: ["hukouProvince", "hukouCity"],
      hukouProvince: ["hukouPlace"],
      hukouCity: ["hukouPlace"],
      currentResidenceCity: ["currentResidenceAddress"],
      workProvince: ["workPlace"],
      workCity: ["workPlace"],
      examProvince: ["examPlace"],
      examCity: ["examPlace"]
    };
    return (projectionMap[fieldBucket] || []).includes(entryBucket);
  }

  function splitAdministrativeLocation(value) {
    const text = normalizeText(value, 160).replace(/\s+/g, "");
    if (!text) {
      return [];
    }

    const parts =
      text.match(
        /(?:香港特别行政区|澳门特别行政区|北京市|上海市|天津市|重庆市|[^省]+省|[^自治区]+自治区|[^特别行政区]+特别行政区|[^市]+市|[^区县旗州盟]+(?:区|县|旗|州|盟))/g
      ) || [];

    return parts.map((part) => normalizeText(part, 40)).filter(Boolean);
  }

  function isMunicipalityLike(value) {
    return /^(北京市|上海市|天津市|重庆市|香港特别行政区|澳门特别行政区)$/.test(normalizeText(value, 40));
  }

  function getProvinceLevelLocationPart(parts) {
    const first = normalizeText(parts?.[0] || "", 40);
    if (!first) {
      return "";
    }
    return /省|自治区|特别行政区|市$/.test(first) ? first : "";
  }

  function getCityLevelLocationPart(parts) {
    const first = normalizeText(parts?.[0] || "", 40);
    const second = normalizeText(parts?.[1] || "", 40);
    if (!first) {
      return "";
    }
    if (isMunicipalityLike(first)) {
      return first;
    }
    if (/省|自治区|特别行政区/.test(first)) {
      return second || first;
    }
    if (/市$/.test(first)) {
      return first;
    }
    return second || first;
  }

  function projectAdministrativeLocationValue(value, fieldBucket) {
    const parts = splitAdministrativeLocation(value);
    if (parts.length === 0) {
      return "";
    }

    if (/Province$/.test(fieldBucket)) {
      return getProvinceLevelLocationPart(parts);
    }
    if (/City$/.test(fieldBucket) || fieldBucket === "currentResidenceCity") {
      return getCityLevelLocationPart(parts) || getProvinceLevelLocationPart(parts);
    }
    return "";
  }

  function areSemanticBucketsCompatible(fieldBucket, entryBucket) {
    if (!fieldBucket || !entryBucket) {
      return true;
    }
    return fieldBucket === entryBucket || canProjectEntryValueToFieldBucket(fieldBucket, entryBucket);
  }

  function resolveEntryValueForField(field, entry, fieldLabel, fieldCategory) {
    const rawValue = entry?.value == null ? "" : String(entry.value).trim();
    if (!rawValue) {
      return "";
    }

    const personalKind = getPersonalFieldKind(fieldLabel);
    if (personalKind === "englishLevel") {
      const level = rawValue.match(/CET[-－]?(?:4|6|8|四|六|八)/i) ||
        rawValue.match(/(?:四级|六级|八级|IELTS|TOEFL|TEM[-－]?(?:4|8|四|八))/i);
      if (level) {
        return level[0].replace(/[－]/g, "-");
      }
    }

    // “现居住地” is a single page field in some ATS forms, while the local
    // profile keeps the city and the detailed address separately. Combine the
    // two values only when they belong to the same basic-information record.
    if (
      personalKind === "basic" &&
      /^(现居住地|当前居住地|居住地|现居地|所在地)$/.test(normalizeMatchKey(fieldLabel)) &&
      entry.label === "现居住城市"
    ) {
      const detail = getCurrentProfileEntries().find((sibling) =>
        sibling.label === "现居住详细地址" &&
        sibling.hasValue &&
        sibling.valuePath?.sectionKey === entry.valuePath?.sectionKey &&
        sibling.valuePath?.itemIndex === entry.valuePath?.itemIndex
      );
      if (!["combobox", "select"].includes(field.type) && detail?.value && !rawValue.includes(String(detail.value))) {
        return `${rawValue}，${String(detail.value).trim()}`;
      }
    }

    if (entry.category === "项目经历" && (entry.label === "项目描述" || field.singleProjectDescription)) {
      const siblings = getCurrentProfileEntries().filter((e) => e.category === entry.category && e.hasValue &&
        e.valuePath?.sectionKey === entry.valuePath?.sectionKey && e.valuePath?.itemIndex === entry.valuePath?.itemIndex);
      const parts = [];
      if (entry.label === "项目描述") parts.push(rawValue.replace(/\s*(【[^】]+】)/g, "\n\n$1\n").replace(/\n{3,}/g, "\n\n").trim());
      else for (const label of ["项目内容", "本人职责", "项目成果"]) {
        const value = siblings.find((e) => e.label === label)?.value;
        if (value) parts.push(`【${label}】\n${value}`);
      }
      const url = siblings.find((e) => e.label === "项目链接")?.value;
      if (url && !parts.join("\n").includes(String(url))) parts.push(`【项目链接】\n${url}`);
      return parts.join("\n\n");
    }
    if (field.githubTarget === "platform") return "GitHub";
    if (field.siteAdapterId === "feishu-jobs" && fieldLabel === "奖惩时间年") return rawValue.match(/\b\d{4}\b/)?.[0] || "";
    if (field?.siteAdapterId === "moka") {
      const dateComponent = getMokaDateComponent(rawValue, fieldLabel);
      if (dateComponent) {
        return dateComponent;
      }
    }

    const fieldBucket = getFieldSemanticBucket(field, fieldLabel, fieldCategory);
    const entryBucket = getEntrySemanticBucket(entry);
    if (fieldBucket === entryBucket || !canProjectEntryValueToFieldBucket(fieldBucket, entryBucket)) {
      return rawValue;
    }
    if (["nativePlace", "sourcePlace", "hukouPlace"].includes(fieldBucket)) {
      return rawValue;
    }

    return projectAdministrativeLocationValue(rawValue, fieldBucket);
  }

  function getMokaDateComponent(value, fieldLabel) {
    const label = String(fieldLabel || "").replace(/\s+/g, "");
    if (!/(开始|结束|奖惩|获奖)时间(年|月)$/.test(label)) {
      return "";
    }
    const match = String(value || "").match(/(\d{4})(?:\s*年|[./-])\s*(\d{1,2})/);
    if (!match) {
      return "";
    }
    return /年$/.test(label) ? match[1] : String(Number(match[2]));
  }

  function getFamilyRelationFromText(value) {
    const text = compactText(value);
    if (!text) {
      return "";
    }
    if (/父亲|爸爸/.test(text)) {
      return "父亲";
    }
    if (/母亲|妈妈/.test(text)) {
      return "母亲";
    }
    if (/配偶|妻子|丈夫|爱人/.test(text)) {
      return "配偶";
    }
    if (/兄弟|姐妹|哥哥|姐姐|弟弟|妹妹/.test(text)) {
      return "兄弟姐妹";
    }
    if (/子女|儿子|女儿/.test(text)) {
      return "子女";
    }
    return "";
  }

  function getFieldFamilyRelation(field) {
    const textRelation = getFamilyRelationFromText([
      field?.nearbyText,
      field?.section,
      field?.groupText,
      field?.label,
      field?.placeholder
    ].join(" "));
    if (textRelation) {
      return textRelation;
    }

    const element = getElementByFieldRuntimeId(field);
    const siblingRelation = getNearbyLabeledControlValue(element, /关系|与本人关系|亲属关系/);
    return getFamilyRelationFromText(siblingRelation);
  }

  function getEntryFamilyRelation(entry) {
    return getFamilyRelationFromText([
      entry?.familyRelation,
      entry?.subsection,
      entry?.label,
      entry?.value,
      ...(entry?.aliases || [])
    ].join(" "));
  }

  function requiresFamilyRelationGate(fieldLabel) {
    return isFamilyMemberDetailLabel(fieldLabel) && !isFamilyRelationLabel(fieldLabel);
  }

  function isFamilyCandidateAllowed(field, entry, fieldLabel, fieldCategory) {
    if (!isFamilyScopedField(field, fieldLabel, fieldCategory)) {
      return true;
    }

    if (entry?.category !== "家庭信息") {
      return false;
    }

    if (!requiresFamilyRelationGate(fieldLabel)) {
      return true;
    }

    const fieldRelation = getFieldFamilyRelation(field);
    const entryRelation = getEntryFamilyRelation(entry);
    return Boolean(fieldRelation && entryRelation && fieldRelation === entryRelation);
  }

  function getFamilyRelationMatchBonus(field, entry, fieldCategory) {
    const fieldLabel = field?.inferredLabel || inferFieldLabel(field);
    if (!isFamilyScopedField(field, fieldLabel, fieldCategory)) {
      return 0;
    }

    if (entry?.category !== "家庭信息") {
      return -999;
    }

    if (!requiresFamilyRelationGate(fieldLabel)) {
      return 0;
    }

    const fieldRelation = getFieldFamilyRelation(field);
    const entryRelation = getEntryFamilyRelation(entry);
    if (!fieldRelation || !entryRelation) {
      return -999;
    }
    return fieldRelation === entryRelation ? 18 : -999;
  }

  function getElementByFieldRuntimeId(field) {
    if (!field?.fieldId) {
      return null;
    }
    try {
      return document.querySelector(`[${FIELD_ATTR}="${CSS.escape(field.fieldId)}"]`);
    } catch {
      return null;
    }
  }

  function getNearbyLabeledControlValue(element, labelPattern) {
    const root = findRepeatItemRoot(element);
    if (!root) {
      return "";
    }

    const controls = collectVisibleControls(root);

    for (const control of controls) {
      if (control === element) {
        continue;
      }
      const container = findFieldContainer(control);
      const label = normalizeFieldLabelText(getControlAdapterLabel(control) || extractFieldContainerLabel(container) || getAdapterLabelText(control) || getNearbyText(control));
      if (labelPattern.test(label)) {
        const value = getControlCurrentValue(control);
        if (value) {
          return value;
        }
      }
    }

    return "";
  }

  function findRepeatItemRoot(element) {
    if (!element) {
      return null;
    }

    if (getActiveSiteAdapter()?.id === "zhiye" && element.closest(".form[name]")) {
      return element.closest(".form[name]");
    }
    if (getActiveSiteAdapter()?.id === "hotjob" && element.closest(".form-cell")) {
      return element.closest(".form-cell-inner");
    }

    const { repeatItemSelector } = getAdapterSelectors();
    if (repeatItemSelector) {
      const adapterRoot = element.closest(repeatItemSelector);
      if (isRepeatItemRootCandidate(adapterRoot)) {
        return adapterRoot;
      }
    }

    let current = element.parentElement;
    let best = null;
    for (let depth = 0; current && depth < 8; depth += 1, current = current.parentElement) {
      if (current.closest?.(`#${PANEL_ID}`)) {
        break;
      }

      const text = getTextWithoutControls(current);
      if (isRepeatItemRootCandidate(current)) {
        best = current;
      }
      if (/家庭|社会关系|亲属/.test(text) && isRepeatItemRootCandidate(current)) {
        return current;
      }
    }

    return best;
  }

  function getRepeatItemOccurrenceInfo(element) {
    if (element && getActiveSiteAdapter()?.id === "zhiye") {
      const root = element.closest(".form[name]");
      if (root && getPhoenixSection(element)) {
        const roots = Array.from(document.querySelectorAll(".form[name]"))
          .filter((node) => node.getAttribute("name") === root.getAttribute("name"));
        return { index: roots.indexOf(root) + 1, total: roots.length };
      }
    }
    if (element && getActiveSiteAdapter()?.id === "hotjob") {
      const section = element.closest(".form-cell");
      const root = element.closest(".form-cell-inner");
      const roots = Array.from(section?.querySelectorAll(".form-cell-inner") || [])
        .filter((node) => node.closest(".form-cell") === section);
      const index = roots.indexOf(root);
      return { index: index + 1, total: roots.length };
    }
    if (!element || getActiveSiteAdapter()?.id !== "moka") {
      return { index: 0, total: 0 };
    }

    const root = findRepeatItemRoot(element);
    const section = root?.closest?.("[class*='apply-block-']");
    if (!root || !section) {
      return { index: 0, total: 0 };
    }

    const roots = Array.from(
      section.querySelectorAll("[class*='apply-fields-'][class*='multi-']")
    ).filter(
      (candidate) =>
        candidate.closest?.("[class*='apply-block-']") === section &&
        isRepeatItemRootCandidate(candidate)
    );
    const index = roots.indexOf(root);
    return index >= 0
      ? { index: index + 1, total: roots.length }
      : { index: 0, total: roots.length };
  }

  function isSemanticallyIncompatible(field, entry, fieldLabel, fieldCategory) {
    const fieldBucket = getFieldSemanticBucket(field, fieldLabel, fieldCategory);
    const entryBucket = getEntrySemanticBucket(entry);

    if (areSemanticBucketsCompatible(fieldBucket, entryBucket)) {
      return false;
    }

    return true;
  }

  function getEntryOccurrenceIndex(entry) {
    const itemIndex = entry?.valuePath?.itemIndex;
    if (Number.isInteger(itemIndex) && itemIndex >= 0) {
      return itemIndex + 1;
    }

    const text = normalizeText([entry?.subsection, entry?.category].filter(Boolean).join(" "), 120);
    const match = text.match(/(?:经历|信息|证书|奖惩|家庭|教育|工作\/实习|实习|项目|社团|学生工作)?\s*(\d+)/);
    if (!match) {
      return 0;
    }
    return Number(match[1]) || 0;
  }

  function getOccurrenceMatchBonus(field, entry) {
    if (["hotjob", "zhiye", "feishu-jobs"].includes(field?.siteAdapterId) && Number.isInteger(field.hotjobProfileIndex)) {
      return isRepeatOccurrenceCompatible(field, entry) ? 24 : -1000;
    }
    const repeatItemIndex = Number(field?.repeatItemIndex || 0);
    const repeatItemTotal = Number(field?.repeatItemTotal || 0);
    const fieldIndex = repeatItemIndex || Number(field?.fieldOccurrenceIndex || 0);
    const fieldTotal = repeatItemTotal || Number(field?.fieldOccurrenceTotal || 0);
    const entryIndex = getEntryOccurrenceIndex(entry);

    if (!fieldIndex || fieldTotal <= 1 || !entryIndex) {
      return 0;
    }

    if (
      repeatItemIndex &&
      ["moka", "zhiye"].includes(field?.siteAdapterId) &&
      ["教育经历", "实习经历", "工作经历", "项目经历", "奖惩情况"].includes(field?.inferredCategory)
    ) {
      // A field in record N must only consume values from profile record N.
      // Falling back to another record is what caused the visible cascade.
      return fieldIndex === entryIndex ? 24 : -1000;
    }

    return fieldIndex === entryIndex ? 18 : -14;
  }

  function isRepeatOccurrenceCompatible(field, entry, fieldCategory = "") {
    if (["hotjob", "zhiye", "feishu-jobs"].includes(field?.siteAdapterId) && Number.isInteger(field.hotjobProfileIndex)) {
      return field.hotjobProfileIndex >= 0 && entry?.valuePath?.itemIndex === field.hotjobProfileIndex &&
        entry?.valuePath?.sectionKey === field.hotjobProfileSectionKey;
    }
    const fieldIndex = Number(field?.repeatItemIndex || 0);
    const entryIndex = getEntryOccurrenceIndex(entry);
    const category = fieldCategory || field?.inferredCategory || "";
    if (
      !fieldIndex ||
      !entryIndex ||
      !["moka", "zhiye"].includes(field?.siteAdapterId) ||
      !["教育经历", "实习经历", "工作经历", "项目经历", "奖惩情况"].includes(category)
    ) {
      return true;
    }
    return fieldIndex === entryIndex;
  }

  function buildCandidateLabels(fieldLabel, fieldCategory) {
    const labels = new Set();
    const normalized = normalizeText(fieldLabel, 120);
    if (normalized) {
      labels.add(normalized);
      labels.add(normalizeMatchKey(normalized));
    }

    const base = normalizeMatchKey(normalized);
    const add = (values) => {
      for (const value of values || []) {
        const text = normalizeText(value, 120);
        if (text) {
          labels.add(text);
          labels.add(normalizeMatchKey(text));
        }
      }
    };

    if (fieldCategory === "项目经历" && base === "职务") {
      add(["职位"]);
    }
    if (fieldCategory === "项目经历" && base === "项目简述") {
      add(["项目内容"]);
    }

    const mapped = [];
    for (const [key, aliases] of Object.entries(PROFILE_LABEL_ALIASES)) {
      if (normalizeMatchKey(key) === base || key === normalized) {
        mapped.push(key, ...aliases);
      }
    }
    add(mapped);

    return Array.from(labels).filter(Boolean);
  }

  function shouldUseRepeatGroupContext(field, fieldLabel, fieldCategory) {
    if (!field?.groupText) {
      return false;
    }

    const labelKey = normalizeMatchKey(fieldLabel || field?.label || "");
    if (!labelKey || isGenericFieldLabel(fieldLabel) || isOptionOnlyLabel(fieldLabel)) {
      return true;
    }

    if (["家庭信息", "绩效考核", "教育经历", "实习经历", "工作经历", "项目经历"].includes(fieldCategory)) {
      return true;
    }

    return /^(姓名|电话|手机号|联系方式|工作单位|单位名称|公司|职务|职位|岗位|地址|住址|联系地址|通讯地址|关系|联系人|证明人|推荐人|学校|专业|学历|学位|部门|地点|城市|开始时间|结束时间)$/.test(labelKey);
  }

  function scoreAutofillCandidate(field, entry, fieldLabel, fieldCategory) {
    if (!field || !entry) {
      return 0;
    }

    if (Object.prototype.hasOwnProperty.call(field, "manualProjectBinding")) {
      const binding = field.manualProjectBinding;
      if (!binding || entry.category !== "项目经历" || entry.valuePath?.sectionKey !== binding.sectionKey || entry.valuePath?.itemIndex !== binding.itemIndex) return -1000;
      if (field.singleProjectDescription) return entry.label === "项目描述" ? 125 : entry.label === "项目内容" ? 120 : -1000;
      const bucket = getSemanticBucket(fieldLabel, "项目经历");
      return normalizeMatchKey(fieldLabel) === normalizeMatchKey(entry.label) || (bucket && bucket === getSemanticBucket(entry.label, "项目经历")) ? 120 : -1000;
    }
    if (fieldCategory === "教育经历" && /^(学历|学位|学历形式|学习形式|学习方式|是否挂科|班级排名|专业排名|成绩gpa|gpa|绩点|成绩)$/.test(normalizeMatchKey(fieldLabel))) {
      if (entry.category !== "教育经历" || getSemanticBucket(fieldLabel, fieldCategory) !== getSemanticBucket(entry.label, entry.category)) return -1000;
    }

    const personalKind = getPersonalFieldKind(fieldLabel);
    const entryLabelKey = normalizeMatchKey(entry.label || "");
    if (personalKind === "selfEvaluation" && !/自我评价|自我描述|自我介绍/.test(entryLabelKey)) {
      return 0;
    }
    if (personalKind === "hobby" && !/特长爱好|爱好及专长|兴趣爱好|特长|爱好/.test(entryLabelKey)) {
      return 0;
    }
    if (personalKind === "graduateCohort" && !/第几届应届生|应届生届次|毕业届次|届次|毕业年份/.test(entryLabelKey)) {
      return 0;
    }
    if (personalKind === "highestSchoolQualification" && !/学校类别|院校资质|院校类别|学校类型/.test(entryLabelKey)) {
      return 0;
    }
    if (personalKind === "highestEducation" && !/最高学历|最高全日制学历|学历层次/.test(entryLabelKey)) {
      return 0;
    }
    if (personalKind === "height" && !/身高|净身高/.test(entryLabelKey)) {
      return 0;
    }
    if (personalKind === "weight" && !/体重/.test(entryLabelKey)) {
      return 0;
    }
    if (personalKind === "profileSource" && !/招聘信息来源|简历来源|信息来源/.test(entryLabelKey)) {
      return 0;
    }
    if (personalKind === "interviewSite" && !/面试站点|面试城市|面试地点|可面试城市/.test(entryLabelKey)) {
      return 0;
    }
    if (personalKind === "highestEnglishCertificate" && !/证书名称|证书|英语|外语/.test(entryLabelKey)) {
      return 0;
    }
    if (personalKind === "englishLevel" && !/证书名称|证书说明|英语|外语|掌握程度|语言水平|语言类型/.test(entryLabelKey)) {
      return 0;
    }
    if (personalKind === "highestEnglishCertificate" && !/证书名称|技能名称/.test(entryLabelKey)) {
      return 0;
    }
    if (personalKind === "englishLevel" && !/证书名称|证书说明|语言水平|掌握程度/.test(entryLabelKey)) {
      return 0;
    }
    if ((personalKind === "highestEnglishCertificate" || personalKind === "englishLevel") &&
        !["证书技能", "外语能力"].includes(entry.category)) {
      return 0;
    }
    if ((personalKind === "internshipStart" || personalKind === "internshipPeriod") && entry.category !== "实习经历") {
      return 0;
    }
    if (personalKind === "internshipStart" && !/^开始时间$|实习开始时间|入职时间/.test(entryLabelKey)) {
      return 0;
    }
    // “实习周期” is a distinct field. A start date alone is not a safe
    // substitute; leave it for the completion reminder when absent.
    if (personalKind === "internshipPeriod" && !/实习周期|实习时间|实习起止时间|实习时长/.test(entryLabelKey)) {
      return 0;
    }

    // Zhiye often renders the internship and project repeaters with the same
    // labels (职位、开始时间、结束时间、内容).  Once the page has identified
    // the repeater as 实习经历, those fields must stay within the internship
    // section; otherwise a project date/role can win on literal label overlap.
    if (
      fieldCategory === "实习经历" &&
      /单位名称|公司名称|职位名称|职位|开始时间|结束时间|实习内容|工作内容|工作成果|地点|行业|实习周期|实习开始时间/.test(entryLabelKey) &&
      entry.category !== "实习经历"
    ) {
      return 0;
    }

    if (field.singleProjectDescription) {
      if (entry.category !== "项目经历" || !isRepeatOccurrenceCompatible(field, entry)) return -1000;
      return entry.label === "项目描述" ? 115 : entry.label === "项目内容" ? 110 : -1000;
    }
    if (field.githubTarget) return entry.label === "GitHub" && /^https:\/\/github\.com\/[^/]+\/?$/i.test(String(entry.value || "")) ? 110 : -1000;
    if (Number.isInteger(field.feishuAwardIndex) && (entry.category !== "奖惩情况" || entry.valuePath?.itemIndex !== field.feishuAwardIndex)) return -1000;
    const familyScoped = isFamilyScopedField(field, fieldLabel, fieldCategory);
    if (familyScoped && entry.category !== "家庭信息") {
      return 0;
    }

    const optionText = getFieldOptionLabelsText(field, 180);
    const useGroupContext = shouldUseRepeatGroupContext(field, fieldLabel, fieldCategory);
    const fieldText = compactText([
      fieldLabel,
      field.nearbyText,
      field.placeholder,
      field.name,
      field.id,
      optionText,
      familyScoped || useGroupContext ? field.groupText : ""
    ].join(" "));
    const entryText = compactText([entry.label, entry.subsection, entry.category, ...(entry.aliases || [])].join(" "));
    if (!fieldText || !entryText) {
      return 0;
    }

    if (isExplanatoryField(fieldText) && !isExplanatoryEntry(entryText)) {
      return 0;
    }

    if (!isCategoryCompatibleForMapping(fieldCategory, entry.category)) {
      return 0;
    }

    // The page's personal fields frequently use a generic semantic bucket
    // (for example “英语等级” backed by a certificate note). The source-label
    // gates below already constrain these mappings, so do not reject them on
    // a secondary bucket mismatch.
    const personalSemanticOverride = [
      "selfEvaluation",
      "hobby",
      "graduateCohort",
      "highestSchoolQualification",
      "highestEducation",
      "height",
      "weight",
      "profileSource",
      "interviewSite",
      "highestEnglishCertificate",
      "englishLevel",
      "internshipStart",
      "internshipPeriod"
    ].includes(personalKind);

    if (!isFamilyCandidateAllowed(field, entry, fieldLabel, fieldCategory)) {
      return 0;
    }

    if (!isRepeatOccurrenceCompatible(field, entry, fieldCategory)) {
      return 0;
    }

    const relationBonus = getFamilyRelationMatchBonus(field, entry, fieldCategory);
    if (relationBonus <= -999) {
      return 0;
    }

    const candidateLabels = buildCandidateLabels(fieldLabel, fieldCategory);
    let directScore = 0;
    let labelDirectScore = 0;

    directScore = Math.max(directScore, textMatchScore(fieldText, entry.label));
    directScore = Math.max(directScore, textMatchScore(fieldText, entry.subsection));
    directScore = Math.max(directScore, textMatchScore(fieldLabel, entry.label));
    directScore = Math.max(directScore, textMatchScore(fieldLabel, entry.subsection));
    labelDirectScore = Math.max(labelDirectScore, textMatchScore(fieldLabel, entry.label));
    labelDirectScore = Math.max(labelDirectScore, textMatchScore(fieldLabel, entry.subsection));

    for (const alias of entry.aliases || []) {
      directScore = Math.max(directScore, textMatchScore(fieldText, alias));
      directScore = Math.max(directScore, textMatchScore(fieldLabel, alias));
      labelDirectScore = Math.max(labelDirectScore, textMatchScore(fieldLabel, alias));
    }

    for (const candidateLabel of candidateLabels) {
      directScore = Math.max(directScore, textMatchScore(entryText, candidateLabel));
      directScore = Math.max(directScore, textMatchScore(entry.label, candidateLabel));
      labelDirectScore = Math.max(labelDirectScore, textMatchScore(entry.label, candidateLabel));
    }

    const fieldSemanticBucket = getFieldSemanticBucket(field, fieldLabel, fieldCategory);
    const entrySemanticBucket = getEntrySemanticBucket(entry);
    const strictProjectSemanticMismatch = fieldCategory === "项目经历" &&
      fieldSemanticBucket && entrySemanticBucket && fieldSemanticBucket !== entrySemanticBucket;
    if (
      !personalSemanticOverride &&
      (strictProjectSemanticMismatch || (isSemanticallyIncompatible(field, entry, fieldLabel, fieldCategory) && labelDirectScore < 5))
    ) {
      return 0;
    }

    // These fields are often named by the employer rather than by the
    // profile schema. Their category and the restricted source labels above
    // are stronger evidence than a literal label overlap.
    if (directScore <= 0 && personalKind && [
      "selfEvaluation",
      "hobby",
      "graduateCohort",
      "highestSchoolQualification",
      "highestEducation",
      "height",
      "weight",
      "profileSource",
      "interviewSite",
      "highestEnglishCertificate",
      "englishLevel",
      "internshipStart",
      "internshipPeriod"
    ].includes(personalKind)) {
      directScore = 5;
    }
    if (personalKind && [
      "selfEvaluation",
      "hobby",
      "graduateCohort",
      "highestSchoolQualification",
      "highestEducation",
      "height",
      "weight",
      "profileSource",
      "interviewSite",
      "highestEnglishCertificate",
      "englishLevel",
      "internshipStart",
      "internshipPeriod"
    ].includes(personalKind)) {
      directScore = Math.max(directScore, 5);
    }

    if (directScore <= 0) {
      return 0;
    }

    let score = directScore * 10;
    // Explicit project text fields take precedence over their legacy aliases.
    // Keep alias fallback for profiles that only provide one of these fields.
    const exactProjectLabel = normalizeMatchKey(fieldLabel);
    if (entry.category === "项目经历"
      && /^(项目描述|项目内容|项目简述)$/.test(exactProjectLabel)
      && (exactProjectLabel === "项目简述" ? "项目内容" : exactProjectLabel) === normalizeMatchKey(entry.label)) {
      score += 12;
    }
    const fieldBucket = getFieldSemanticBucket(field, fieldLabel, fieldCategory);
    const entryBucket = getEntrySemanticBucket(entry);
    if (fieldBucket && entryBucket && fieldBucket === entryBucket) {
      score += 8;
    }
    score += relationBonus;
    score += textMatchScore(fieldText, entry.category) * 2;
    score += textMatchScore(fieldText, entry.subsection) * 8;

    if (fieldCategory === entry.category) {
      score += 4;
    } else {
      score += getEntryCategoryBonus(fieldCategory, entry.category);
    }

    if (personalKind === "highestEnglishCertificate" && /证书名称|技能名称/.test(entryLabelKey)) {
      score += 12;
    }
    if (personalKind === "highestEducation" && entryLabelKey === "最高学历") {
      score += 12;
    }
    if (personalKind === "englishLevel" && /证书名称|证书说明/.test(entryLabelKey)) {
      score += 8;
      if (entry.category === "外语能力") score += 8;
    }

    score += getOccurrenceMatchBonus(field, entry);

    if (field.required) {
      score += 2;
    }

    if (field.hasCurrentValue) {
      score -= 5;
    }

    if (entry.hasValue) {
      score += 1;
    }

    if (/上传|附件|照片|证件照|简历附件/.test(fieldText)) {
      score = -999;
    }

    if (/是否|有无|能否|接受|服从/.test(fieldText) && entry.category === "有关声明") {
      score += 6;
    }

    if (/出生日期|出生年月|开始时间|结束时间|取得毕业证时间|获取日期|竞赛时间/.test(fieldText) && /日期|时间|年月/.test(entry.label)) {
      score += 5;
    }

    return score;
  }

  function guessAutofillValueFieldType(field) {
    const labelText = compactText([field?.inferredLabel || inferFieldLabel(field), field?.label, field?.placeholder].join(" "));
    const optionText = getFieldOptionLabelsText(field, 160);
    const contextText = compactText([field?.nearbyText, field?.section, field?.groupText, optionText].join(" "));
    if (/开始时间|结束时间|出生日期|出生年月|取得毕业证时间|获取日期|取得时间|竞赛时间|获得时间|有效期/.test(labelText)) {
      return "date";
    }
    if (/是否|有无|能否|接受|服从|未参加|参加过|长期有效|填写有效期/.test(labelText)) {
      return "choice";
    }
    if (/性别/.test(labelText)) {
      return "choice";
    }
    if (/男|女|是|否|有|无|未婚|已婚|离婚|丧偶|本科|硕士|博士|父亲|母亲|配偶|党员|团员|群众/.test(optionText)) {
      return "choice";
    }
    if (
      !labelText &&
      /开始时间|结束时间|出生日期|出生年月|取得毕业证时间|获取日期|取得时间|竞赛时间|获得时间|有效期/.test(contextText)
    ) {
      return "date";
    }
    if (
      !labelText &&
      /是否|有无|能否|接受|服从|未参加|参加过|长期有效|填写有效期|性别/.test(contextText)
    ) {
      return "choice";
    }
    if (/证书|语言|学历|学位|民族|政治面貌|生源地|居住地|地址|院校|院系|学校|单位|部门|职务|岗位/.test(labelText)) {
      return "text";
    }
    return "text";
  }

  function normalizeControlKind(currentType, aiKind) {
    const type = String(currentType || "").toLowerCase();
    const kind = String(aiKind || "").toLowerCase();

    if (!kind || kind === "unknown") {
      return type || "text";
    }

    if (["text", "textarea", "select", "search-select", "radio", "checkbox", "date", "file"].includes(kind)) {
      return kind === "search-select" ? "combobox" : kind;
    }

    if (kind.includes("select")) {
      return "select";
    }
    if (kind.includes("radio")) {
      return "radio";
    }
    if (kind.includes("checkbox")) {
      return "checkbox";
    }
    if (kind.includes("date")) {
      return "date";
    }
    if (kind.includes("search")) {
      return "combobox";
    }

    return type || "text";
  }

  function getAutoFillScoreThreshold(field, fieldLabel, fieldCategory) {
    if (field.feishuProjectCorrection && /^(项目名称|项目链接|描述|项目描述|项目内容)$/.test(fieldLabel)) return 55;
    if (isFamilyScopedField(field, fieldLabel, fieldCategory) && requiresFamilyRelationGate(fieldLabel)) {
      return field.hasCurrentValue ? 90 : 62;
    }
    if (
      field.hasCurrentValue &&
      field.siteAdapterId === "moka" &&
      field.groupText &&
      ["教育经历", "实习经历", "工作经历", "项目经历", "奖惩情况"].includes(fieldCategory)
    ) {
      return 72;
    }
    return field.hasCurrentValue ? 84 : 55;
  }

  function createAutofillCandidate(field, entry, score) {
    const fieldLabel = field?.inferredLabel || inferFieldLabel(field);
    const fieldCategory = field?.inferredCategory || inferMatchSection(field);
    const value = resolveEntryValueForField(field, entry, fieldLabel, fieldCategory);
    const confidence = score >= 40 ? Math.max(0, Math.min(0.99, 0.45 + score / 100)) : Math.max(0, score / 120);
    const text = compactText([fieldLabel, fieldCategory, field.nearbyText, field.placeholder, field.name, field.id].join(" "));
    const writeMode = guessAutofillValueFieldType(field);
    const autoFillScoreThreshold = getAutoFillScoreThreshold(field, fieldLabel, fieldCategory);
    const phoneField = /电话|手机|联系方式/.test(fieldLabel);
    const alreadyMatches = field.manualProjectBinding
      ? String(field.currentValue || "").trim() === String(value).trim()
      : phoneField
      ? Boolean(field.currentValue) && String(field.currentValue).replace(/[\s()-]/g, "") === String(value).replace(/[\s()-]/g, "")
      : field.siteAdapterId === "hotjob"
      ? hotjobValuesEquivalent(field.currentValue, value, field.type, writeMode)
      : valuesLookEquivalent(field.currentValue, value);
    const shouldAutoFill =
      (alreadyMatches || score >= autoFillScoreThreshold) &&
      value !== "" &&
      field.canFill &&
      !/上传|附件|照片|证件照|简历附件/.test(text);

    return {
      id: `candidate_${field.fieldId}`,
      fieldId: field.fieldId,
      field,
      fieldLabel,
      fieldCategory,
      sourceLabel: entry?.label || "",
      sourceCategory: entry?.category || "",
      sourceSubsection: entry?.subsection || "",
      sourceItemId: entry?.itemId || "",
      value,
      preview: formatCandidateValue(value, 140),
      confidence,
      writeMode,
      mappingSource: "本地规则",
      reason: "",
      shouldAutoFill,
      canAutoFill: Boolean(value) && field.canFill && (alreadyMatches || score >= 32),
      alreadyMatches,
      warning: buildCandidateWarning(field, entry, score, writeMode),
      score
    };
  }

  function createAiAutofillCandidate(mapping, scan, entries) {
    const field = getScanFieldById(scan, mapping?.fieldId);
    const entry = getProfileEntryByPath(entries, mapping?.sourcePath);
    if (!field || !entry?.hasValue) {
      return null;
    }

    const fieldLabel = field?.inferredLabel || inferFieldLabel(field);
    const fieldCategory = field?.inferredCategory || inferMatchSection(field);
    const personalKind = getPersonalFieldKind(fieldLabel);
    if (field.githubTarget || Number.isInteger(field.feishuAwardIndex) || isPersonalFieldLabel(fieldLabel)) {
      if (scoreAutofillCandidate(field, entry, fieldLabel, fieldCategory) < 32) return null;
    }
    if (!field.githubTarget && !isCategoryCompatibleForMapping(fieldCategory, entry.category)) {
      return null;
    }
    const personalSemanticOverride = [
      "selfEvaluation",
      "hobby",
      "graduateCohort",
      "highestSchoolQualification",
      "highestEducation",
      "height",
      "weight",
      "profileSource",
      "interviewSite",
      "highestEnglishCertificate",
      "englishLevel",
      "internshipStart",
      "internshipPeriod"
    ].includes(personalKind);
    if (!personalSemanticOverride && isSemanticallyIncompatible(field, entry, fieldLabel, fieldCategory) &&
        scoreAutofillCandidate(field, entry, fieldLabel, fieldCategory) < 18) {
      return null;
    }
    if (!isFamilyCandidateAllowed(field, entry, fieldLabel, fieldCategory)) {
      return null;
    }
    if (!isRepeatOccurrenceCompatible(field, entry, fieldCategory)) {
      return null;
    }

    const confidence = Math.max(0, Math.min(1, Number(mapping.confidence || 0)));
    const score = Math.round(confidence * 100);
    const candidate = createAutofillCandidate(field, entry, Math.max(score, 35));
    if (!candidate.value) {
      return null;
    }
    candidate.confidence = confidence;
    candidate.score = score;
    candidate.mappingSource = "AI 优先匹配";
    candidate.reason = normalizeText(mapping.reason || "", 160);
    candidate.shouldAutoFill = (candidate.alreadyMatches || confidence >= (field.hasCurrentValue ? 0.86 : 0.68)) && Boolean(candidate.value) && field.canFill;
    candidate.canAutoFill = (candidate.alreadyMatches || confidence >= 0.42) && Boolean(candidate.value) && field.canFill;
    candidate.warning = buildAiCandidateWarning(candidate, mapping);
    return candidate;
  }

  function buildAiCandidateWarning(candidate, mapping) {
    const notes = [];
    if (candidate.field?.hasCurrentValue) {
      notes.push(candidate.shouldAutoFill ? "当前字段已有内容，自动填写时会覆盖" : "当前字段已有内容，已转为待处理");
    }
    if (candidate.writeMode !== "text") {
      notes.push(candidate.writeMode === "date" ? "日期字段需要核对格式" : "选择控件需要核对选项");
    }
    if (candidate.confidence < 0.68) {
      notes.push("AI 判断不够确定，已转为待处理");
    }
    if (mapping?.reason) {
      notes.push(`原因：${normalizeText(mapping.reason, 120)}`);
    }
    return notes.join("；");
  }

  function buildCandidateWarning(field, entry, score, writeMode) {
    const notes = [];
    if (!field.canFill) {
      notes.push("当前控件暂不支持自动填写");
    }
    if (field.hasCurrentValue) {
      notes.push(score >= getAutoFillScoreThreshold(field, field.inferredLabel || inferFieldLabel(field), field.inferredCategory || inferMatchSection(field)) ? "当前字段已有内容，自动填写时会覆盖" : "当前字段已有内容，已转为待处理");
    }
    if (writeMode !== "text") {
      if (writeMode === "date") {
        notes.push("日期字段需要核对格式");
      } else {
        notes.push("可能需要手动点开选择，已转为待处理");
      }
    }
    if (score < 40) {
      notes.push("匹配不够确定，已转为待处理");
    }
    if (!entry?.hasValue) {
      notes.push("本地资料未填写");
    }
    return notes.join("；");
  }

  function formatCandidateValue(value, maxLength = 120) {
    if (value == null || value === "") {
      return "";
    }
    if (typeof value === "string") {
      return normalizeText(value, maxLength);
    }
    if (typeof value === "object") {
      try {
        return normalizeText(JSON.stringify(value), maxLength);
      } catch {
        return normalizeText(String(value), maxLength);
      }
    }
    return normalizeText(String(value), maxLength);
  }

  function normalizeComparableValue(value) {
    const text = normalizeText(value, 120);
    if (!text) {
      return "";
    }

    return normalizeChoiceLabel(normalizeDateValue(text))
      .replace(/大学本科/g, "本科")
      .replace(/学校级/g, "校级")
      .replace(/学院级/g, "院级")
      .replace(/离异/g, "离婚")
      .replace(/厘米|cm|CM|千克|公斤|kg|KG|万元|万/g, "");
  }

  function hotjobValuesEquivalent(left, right, type, writeMode) {
    if (!String(left || "").trim() || !String(right || "").trim()) return false;
    if (["combobox", "select", "radio"].includes(type)) return choiceTextMatches(left, right);
    if (writeMode === "date") return normalizeDateValue(left) === normalizeDateValue(right);
    // A partially parsed description is not equivalent to the full profile text.
    return normalizeText(left, Infinity) === normalizeText(right, Infinity);
  }

  function valuesLookEquivalent(left, right) {
    const normalizedLeft = normalizeComparableValue(left);
    const normalizedRight = normalizeComparableValue(right);
    if (!normalizedLeft || !normalizedRight) {
      return false;
    }
    return (
      normalizedLeft === normalizedRight ||
      normalizedLeft.includes(normalizedRight) ||
      normalizedRight.includes(normalizedLeft)
    );
  }

  function summarizeDebugField(field) {
    const label = field?.inferredLabel || inferFieldLabel(field);
    const category = field?.inferredCategory || inferMatchSection(field);
    return {
      fieldId: field?.fieldId || "",
      label: normalizeText(label || "", 120),
      category: normalizeText(category || "", 80),
      type: normalizeText(field?.type || "", 40),
      controlAdapterId: normalizeText(field?.controlAdapterId || "", 40),
      controlAdapterName: normalizeText(field?.controlAdapterName || "", 80),
      canFill: Boolean(field?.canFill),
      hasCurrentValue: Boolean(field?.hasCurrentValue),
      required: Boolean(field?.required),
      placeholder: normalizeText(field?.placeholder || "", 80),
      section: normalizeText(field?.section || "", 120),
      groupText: normalizeText(field?.groupText || "", 160)
    };
  }

  function summarizeDebugSourceSubsection(value, category = "") {
    const text = normalizeText(value || "", 120);
    const occurrence = text.match(/(?:经历|信息|证书|奖惩|家庭|教育|工作|实习|项目)?\s*(\d+)/);
    if (occurrence) {
      return `${normalizeText(category || "资料", 40)} ${occurrence[1]}`;
    }
    return normalizeText(category || "", 40);
  }

  function summarizeDebugCandidate(candidate) {
    return {
      fieldId: candidate.fieldId,
      fieldLabel: normalizeText(candidate.fieldLabel || "", 120),
      fieldCategory: normalizeText(candidate.fieldCategory || "", 80),
      sourceLabel: normalizeText(candidate.sourceLabel || "", 120),
      sourceCategory: normalizeText(candidate.sourceCategory || "", 80),
      sourceSubsection: summarizeDebugSourceSubsection(candidate.sourceSubsection, candidate.sourceCategory),
      score: Number(candidate.score || 0),
      confidence: Number(candidate.confidence || 0),
      writeMode: candidate.writeMode || "",
      mappingSource: candidate.mappingSource || "",
      shouldAutoFill: Boolean(candidate.shouldAutoFill),
      canAutoFill: Boolean(candidate.canAutoFill),
      alreadyMatches: Boolean(candidate.alreadyMatches),
      hasCurrentValue: Boolean(candidate.field?.hasCurrentValue),
      warning: normalizeText(candidate.warning || "", 180),
      reason: normalizeText(candidate.reason || "", 180)
    };
  }

  function summarizeMappingDiagnostic(diagnostic) {
    return {
      fieldId: diagnostic?.fieldId || "",
      fieldLabel: normalizeText(diagnostic?.fieldLabel || "", 120),
      fieldCategory: normalizeText(diagnostic?.fieldCategory || "", 80),
      occurrenceIndex: Number(diagnostic?.occurrenceIndex || 0),
      occurrenceTotal: Number(diagnostic?.occurrenceTotal || 0),
      state: normalizeText(diagnostic?.state || "", 40),
      reason: normalizeText(diagnostic?.reason || "", 220),
      bestSourceLabel: normalizeText(diagnostic?.bestSourceLabel || "", 120),
      bestSourceCategory: normalizeText(diagnostic?.bestSourceCategory || "", 80),
      bestSourceSubsection: summarizeDebugSourceSubsection(diagnostic?.bestSourceSubsection, diagnostic?.bestSourceCategory),
      bestScore: Number.isFinite(Number(diagnostic?.bestScore)) ? Number(diagnostic.bestScore) : null
    };
  }

  function summarizeDebugProfile(entries) {
    const byCategory = new Map();
    for (const entry of Array.isArray(entries) ? entries : []) {
      const category = normalizeText(entry?.category || "未分类", 80);
      const label = normalizeText(entry?.label || "", 120);
      if (!byCategory.has(category)) {
        byCategory.set(category, { category, entryCount: 0, labels: new Set() });
      }
      const summary = byCategory.get(category);
      summary.entryCount += 1;
      if (label) {
        summary.labels.add(label);
      }
    }
    return {
      entryCount: Array.isArray(entries) ? entries.length : 0,
      categories: Array.from(byCategory.values()).map((item) => ({
        category: item.category,
        entryCount: item.entryCount,
        labels: Array.from(item.labels)
      }))
    };
  }

  function summarizeDebugResult(result) {
    return {
      id: result?.id || "",
      ok: Boolean(result?.ok),
      note: normalizeText(result?.note || "", 180)
    };
  }

  function updateAutofillDebugPlan(plan, meta = {}) {
    if (!plan) {
      return;
    }

    const candidates = Array.isArray(plan.candidates) ? plan.candidates.map(summarizeDebugCandidate) : [];
    const fields = Array.isArray(plan.scan?.fields) ? plan.scan.fields.map(summarizeDebugField) : [];
    const autoFillCount = candidates.filter((candidate) => candidate.shouldAutoFill).length;
    const confirmCount = candidates.filter((candidate) => !candidate.shouldAutoFill && candidate.canAutoFill).length;
    const ignoredCount = Math.max(0, candidates.length - autoFillCount - confirmCount);
    const aiUsage = sanitizeAutofillAiUsage(meta.aiUsage || getAutofillAiSnapshot());

    lastAutofillDebug = {
      version: SCRIPT_VERSION,
      page: {
        url: plan.page?.url || location.href,
        title: plan.page?.title || document.title,
        hostname: plan.page?.hostname || location.hostname
      },
      generatedAt: new Date().toISOString(),
      mappingSource: plan.mappingSource || "",
      missingProfileFields: Array.isArray(plan.missingProfileFields) ? plan.missingProfileFields.slice() : [],
      aiStatus: normalizeText(meta.aiStatus || aiUsage.message || "", 300),
      aiUsage,
      profileSummary: summarizeDebugProfile(plan.entries),
      scan: {
        fieldCount: fields.length,
        expandedEditCards: Number(plan.scan?.expandedEditCards || 0),
        siteAdapter: plan.scan?.siteAdapter || null,
        fields
      },
      counts: {
        candidates: candidates.length,
        autoFill: autoFillCount,
        needsConfirm: confirmCount,
        ignored: ignoredCount
      },
      mappingDiagnostics: Array.isArray(plan.mappingDiagnostics)
        ? plan.mappingDiagnostics.map(summarizeMappingDiagnostic)
        : [],
      candidates,
      summary: null,
      results: []
    };
    void queueAutofillDebugPersistence();
  }

  function updateAutofillDebugResults(summary, results) {
    if (!lastAutofillDebug) {
      lastAutofillDebug = {
        version: SCRIPT_VERSION,
        page: {
          url: location.href,
          title: document.title,
          hostname: location.hostname
        },
        generatedAt: new Date().toISOString(),
        counts: {},
        candidates: [],
        results: []
      };
    }

    lastAutofillDebug.summary = {
      attempted: Number(summary?.attempted || 0),
      filled: Number(summary?.filled || 0),
      failed: Number(summary?.failed || 0),
      skipped: Number(summary?.skipped || 0),
      pending: Number(summary?.pending ?? Number(summary?.failed || 0) + Number(summary?.skipped || 0)),
      total: Number(summary?.total || 0),
      message: normalizeText(summary?.message || "", 160),
      missingProfileFields: Array.isArray(summary?.missingProfileFields) ? summary.missingProfileFields.slice() : [],
      aiUsage: sanitizeAutofillAiUsage(summary?.aiUsage || getAutofillAiSnapshot())
    };
    lastAutofillDebug.aiUsage = sanitizeAutofillAiUsage(summary?.aiUsage || lastAutofillDebug.aiUsage || getAutofillAiSnapshot());
    lastAutofillDebug.aiStatus = lastAutofillDebug.aiUsage.message;
    lastAutofillDebug.results = Array.isArray(results) ? results.map(summarizeDebugResult) : [];
    lastAutofillDebug.finishedAt = new Date().toISOString();
    void queueAutofillDebugPersistence();
  }

  function getAutofillCandidateSectionRank(category) {
    const index = AUTO_FILL_SECTION_ORDER.indexOf(category);
    return index === -1 ? 999 : index;
  }

  function compareAutofillCandidates(leftCandidate, rightCandidate) {
    const leftRank = getAutofillCandidateSectionRank(leftCandidate.fieldCategory);
    const rightRank = getAutofillCandidateSectionRank(rightCandidate.fieldCategory);
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }
    return Number(rightCandidate.score || 0) - Number(leftCandidate.score || 0);
  }

  function buildAutofillPlan(scan) {
    const entries = getCurrentProfileEntries();
    const visibleFields = Array.isArray(scan?.fields) ? scan.fields.filter((field) => field && field.canFill) : [];
    const fieldCounters = new Map();
    const fieldTotals = new Map();
    const enrichedFields = visibleFields.map((field) => {
      const fieldLabel = inferFieldLabel(field);
      const fieldCategory = inferMatchSection(field);
      const occurrenceKey = `${fieldCategory || "未分类"}|${normalizeMatchKey(fieldLabel) || field.fieldId}`;
      fieldTotals.set(occurrenceKey, (fieldTotals.get(occurrenceKey) || 0) + 1);
      return {
        ...field,
        inferredLabel: fieldLabel,
        inferredCategory: fieldCategory,
        occurrenceKey
      };
    });
    const candidates = [];
    const mappingDiagnostics = [];

    prepareFeishuRecords(enrichedFields, entries);
    bindHotjobRecords(enrichedFields, entries);
    for (const field of enrichedFields) {
      if (!Object.prototype.hasOwnProperty.call(field, "manualProjectBinding")) continue;
      field.hotjobProfileIndex = field.manualProjectBinding?.itemIndex ?? -1;
      field.hotjobProfileSectionKey = field.manualProjectBinding?.sectionKey;
    }
    // AI candidates are built from scan.fields, not the enriched local copies.
    // Share the same identity gate so AI cannot bypass record boundaries.
    const hotjobBindings = new Map(enrichedFields.filter((field) => Number.isInteger(field.hotjobProfileIndex) || Number.isInteger(field.feishuAwardIndex) || field.githubTarget)
      .map((field) => [field.fieldId, field]));
    for (const field of scan?.fields || []) {
      const bound = hotjobBindings.get(field.fieldId);
      if (bound) {
        for (const key of ["inferredLabel", "inferredCategory", "feishuAwardIndex", "githubTarget", "feishuProjectCorrection", "singleProjectDescription"]) field[key] = bound[key];
        field.hotjobProfileIndex = bound.hotjobProfileIndex;
        field.hotjobProfileSectionKey = bound.hotjobProfileSectionKey;
      }
    }

    for (const field of enrichedFields) {
      const fieldLabel = field.inferredLabel || inferFieldLabel(field);
      const fieldCategory = field.inferredCategory || inferMatchSection(field);
      const nextOccurrenceIndex = (fieldCounters.get(field.occurrenceKey) || 0) + 1;
      fieldCounters.set(field.occurrenceKey, nextOccurrenceIndex);
      field.fieldOccurrenceIndex = Number(field.repeatItemIndex || 0) || nextOccurrenceIndex;
      field.fieldOccurrenceTotal = Number(field.repeatItemTotal || 0) || fieldTotals.get(field.occurrenceKey) || 1;
      let bestEntry = null;
      let bestScore = -9999;

      for (const entry of entries) {
        if (!entry?.hasValue) {
          continue;
        }

        const score = scoreAutofillCandidate(field, entry, fieldLabel, fieldCategory);
        if (score > bestScore) {
          bestScore = score;
          bestEntry = entry;
        }
      }

      if (!bestEntry || bestScore < 18) {
        mappingDiagnostics.push({
          fieldId: field.fieldId,
          fieldLabel,
          recordBinding: field.hotjobProfileIndex === -1 ? "经历名称未唯一对应本机资料，禁止按序号串填" : "",
          fieldCategory,
          occurrenceIndex: field.fieldOccurrenceIndex,
          occurrenceTotal: field.fieldOccurrenceTotal,
          state: "unmatched",
          reason: bestEntry
            ? `最高匹配分 ${bestScore}，低于候选门槛 18`
            : "本机资料中没有可参与匹配的非空字段",
          bestSourceLabel: bestEntry?.label || "",
          bestSourceCategory: bestEntry?.category || "",
          bestSourceSubsection: bestEntry?.subsection || "",
          bestScore
        });
        continue;
      }

      const candidate = createAutofillCandidate(field, bestEntry, bestScore);
      if (!candidate.value) {
        mappingDiagnostics.push({
          fieldId: field.fieldId,
          fieldLabel,
          fieldCategory,
          occurrenceIndex: field.fieldOccurrenceIndex,
          occurrenceTotal: field.fieldOccurrenceTotal,
          state: "unmatched",
          reason: "匹配到资料字段，但解析后的写入值为空",
          bestSourceLabel: bestEntry.label || "",
          bestSourceCategory: bestEntry.category || "",
          bestSourceSubsection: bestEntry.subsection || "",
          bestScore
        });
        continue;
      }
      candidates.push(candidate);
      mappingDiagnostics.push({
        fieldId: field.fieldId,
        fieldLabel,
        fieldCategory,
        occurrenceIndex: field.fieldOccurrenceIndex,
        occurrenceTotal: field.fieldOccurrenceTotal,
        state: candidate.shouldAutoFill ? "auto-fill" : candidate.canAutoFill ? "pending" : "ignored",
        reason: candidate.alreadyMatches
          ? "当前值已与本机资料一致"
          : candidate.shouldAutoFill
            ? `匹配分 ${bestScore}，达到自动填写门槛`
            : candidate.canAutoFill
              ? `匹配分 ${bestScore}，未达到自动填写门槛`
              : `匹配分 ${bestScore}，低于待处理门槛`,
        bestSourceLabel: bestEntry.label || "",
        bestSourceCategory: bestEntry.category || "",
        bestSourceSubsection: bestEntry.subsection || "",
        bestScore
      });
    }

    candidates.sort(compareAutofillCandidates);

    const plan = {
      createdAt: new Date().toISOString(),
      mappingSource: "本地规则",
      page: {
        url: scan?.url || "",
        title: scan?.title || "",
        hostname: scan?.hostname || ""
      },
      scan,
      entries,
      candidates,
      mappingDiagnostics,
      autoFillIds: new Set(candidates.filter((candidate) => candidate.shouldAutoFill).map((candidate) => candidate.id))
    };
    plan.missingProfileFields = collectMissingProfileFields(plan);
    return plan;
  }

  function sortAutofillCandidates(candidates) {
    return candidates.slice().sort(compareAutofillCandidates);
  }

  function cloneLocalFallbackCandidate(candidate) {
    return {
      ...candidate,
      mappingSource: "本地规则兜底"
    };
  }

  function shouldFallbackToLocalCandidate(aiCandidate, localCandidate) {
    if (!aiCandidate || !localCandidate) {
      return false;
    }
    if (aiCandidate.shouldAutoFill) {
      return false;
    }
    if (aiCandidate.confidence >= 0.58) {
      return false;
    }
    if (localCandidate.shouldAutoFill && localCandidate.score >= 55) {
      return true;
    }
    if (!aiCandidate.canAutoFill && localCandidate.canAutoFill && localCandidate.score >= 45) {
      return true;
    }
    return false;
  }

  function buildAiFirstPlan(localPlan, aiCandidates, notes = []) {
    if (!localPlan || !Array.isArray(aiCandidates) || aiCandidates.length === 0) {
      return localPlan;
    }

    const selectedByFieldId = new Map();
    const localByFieldId = new Map((localPlan.candidates || []).map((candidate) => [candidate.fieldId, candidate]));
    let aiPrimaryCount = 0;
    let localFallbackCount = 0;

    for (const aiCandidate of aiCandidates) {
      const localCandidate = localByFieldId.get(aiCandidate.fieldId);
      if (shouldFallbackToLocalCandidate(aiCandidate, localCandidate)) {
        selectedByFieldId.set(aiCandidate.fieldId, cloneLocalFallbackCandidate(localCandidate));
        localFallbackCount += 1;
        continue;
      }
      selectedByFieldId.set(aiCandidate.fieldId, aiCandidate);
      aiPrimaryCount += 1;
    }

    for (const localCandidate of localPlan.candidates || []) {
      if (selectedByFieldId.has(localCandidate.fieldId)) {
        continue;
      }
      selectedByFieldId.set(localCandidate.fieldId, cloneLocalFallbackCandidate(localCandidate));
      localFallbackCount += 1;
    }

    const candidates = sortAutofillCandidates(Array.from(selectedByFieldId.values()));
    return {
      ...localPlan,
      mappingSource: localFallbackCount > 0 ? "AI 优先 + 本地规则兜底" : "AI 优先匹配",
      aiNotes: notes,
      aiPrimaryCount,
      localFallbackCount,
      candidates,
      autoFillIds: new Set(candidates.filter((candidate) => candidate.shouldAutoFill).map((candidate) => candidate.id))
    };
  }

  function buildPlanMatchSummary(plan) {
    const aiPrimaryCount = Number(plan?.aiPrimaryCount || 0);
    const localFallbackCount = Number(plan?.localFallbackCount || 0);
    if (plan?.mappingSource === "AI 优先 + 本地规则兜底") {
      return `AI 优先匹配 ${aiPrimaryCount} 项，本地规则兜底 ${localFallbackCount} 项`;
    }
    if (plan?.mappingSource === "AI 优先匹配") {
      return `AI 优先匹配 ${aiPrimaryCount} 项`;
    }
    if (plan?.mappingSource === "AI 表单字段识别 + 本地规则") {
      return "AI 已识别表单结构，本地规则完成字段匹配";
    }
    return "本地规则完成字段匹配";
  }

  async function enhancePlanWithAi(scan, localPlan) {
    const entries = Array.isArray(localPlan?.entries) ? localPlan.entries : getCurrentProfileEntries();
    const profileCatalog = buildProfileCatalogFromEntries(entries);
    if (profileCatalog.fields.length === 0) {
      return { plan: localPlan };
    }

    setAutofillAiTrying("字段理解");
    setAutofillProgress("AI 匹配字段", 76, "正在用 AI 优先匹配页面字段，本地规则会兜底剩余字段");
    setProfilePanelStatus("正在用 AI 优先匹配页面字段，只发送字段名称，不发送资料值...");
    const response = await sendRuntimeMessage({
      type: "OJAF_MAP_FIELDS",
      payload: {
        scan,
        profileCatalog
      }
    });

    const mappings = Array.isArray(response?.mappings) ? response.mappings : [];
    const aiCandidates = mappings
      .map((mapping) => createAiAutofillCandidate(mapping, scan, entries))
      .filter(Boolean);
    if (aiCandidates.length === 0) {
      setAutofillAiNoResult("字段理解", "AI 未返回可用字段匹配");
      setAutofillProgress("本地兜底匹配", 82, "AI 未返回可用匹配，正在切换本地规则兜底");
      return {
        plan: localPlan
      };
    }

    const enhancedPlan = buildAiFirstPlan(localPlan, aiCandidates, response?.notes || []);
    setAutofillAiUsed("字段理解");
    setAutofillProgress("AI 匹配字段", 86, buildPlanMatchSummary(enhancedPlan));

    return {
      plan: enhancedPlan
    };
  }

  async function enhanceScanWithAi(scan) {
    try {
      setAutofillAiTrying("表单字段识别");
      setAutofillProgress("AI 识别表单字段", 50, "正在识别字段名称和控件类型");
      setProfilePanelStatus("正在用 AI 识别表单结构，只发送字段信息...");
      const response = await sendRuntimeMessage({
        type: "OJAF_ANALYZE_PAGE_STRUCTURE",
        payload: {
          scan
        }
      });

      const hints = Array.isArray(response?.fieldHints) ? response.fieldHints : [];
      if (hints.length === 0) {
        setAutofillAiNoResult("表单字段识别", "AI 未返回可用字段建议");
        setAutofillProgress("整理表单字段", 60, "AI 没有提供可用建议，继续使用本地规则兜底");
        return { scan };
      }

      const fieldMap = new Map((scan.fields || []).map((field) => [field.fieldId, field]));
      for (const hint of hints) {
        const field = fieldMap.get(hint.fieldId);
        if (!field) {
          continue;
        }
        if (field.siteAdapterId === "hotjob" && field.section && field.label) {
          continue; // Explicit HotJob labels/headings outrank shorter AI guesses.
        }
        if (hint.label && (!field.label || field.label.length < 2 || (hint.confidence >= 0.68 && hint.label.length < field.label.length))) {
          field.label = hint.label;
        }
        if (hint.section && (!field.section || field.section.length < 2 || (hint.confidence >= 0.68 && hint.section.length < field.section.length))) {
          field.section = hint.section;
        }
        if (hint.controlKind && hint.controlKind !== "unknown") {
          field.type = normalizeControlKind(field.type, hint.controlKind);
        }
        field.aiHint = {
          confidence: hint.confidence,
          note: hint.note
        };
      }

      setAutofillAiUsed("表单字段识别");
      setAutofillProgress("AI 识别表单字段", 60, `已识别 ${hints.length} 项`);

      return {
        scan: {
          ...scan,
          fields: Array.from(fieldMap.values()),
          aiStructure: {
            siteType: response.siteType || "generic",
            confidence: response.confidence || 0,
            notes: response.notes || []
          }
        }
      };
    } catch (error) {
      setAutofillAiFallback("表单字段识别", error);
      setAutofillProgress("整理表单字段", 58, "AI 不可用，已使用本地规则继续");
      setProfilePanelStatus("AI 不可用，已使用本地规则继续识别表单字段。");
      return {
        scan
      };
    }
  }

  function getProjectOverwriteGroups(scan) {
    const groups = [];
    let active = null;
    for (const field of scan.fields || []) {
      if (!field.canFill || inferMatchSection(field) !== "项目经历") { active = null; continue; }
      const label = inferFieldLabel(field);
      if (label === "项目名称" || !active || (field.repeatItemIndex != null && field.repeatItemIndex !== active.repeatIndex)) {
        active = { fields: [], repeatIndex: field.repeatItemIndex }; groups.push(active);
      }
      active.fields.push(field);
    }
    return groups;
  }

  function assignProjectOverwrite(group, identity) {
    const narratives = group.fields.filter((f) => /^(描述|项目描述|项目内容|项目简述|本人职责|项目职责|职责|项目成果|项目绩效)$/.test(inferFieldLabel(f)));
    for (const field of group.fields) {
      field.manualProjectBinding = identity ? { ...identity.valuePath } : null;
      field.singleProjectDescription = narratives.length === 1 && narratives[0] === field && /^(描述|项目描述|项目内容|项目简述)$/.test(inferFieldLabel(field));
    }
  }

  async function chooseProjectOverwrites(scan) {
    const groups = getProjectOverwriteGroups(scan);
    if (!groups.length) return true;
    const identities = getCurrentProfileEntries().filter((e) => e.category === "项目经历" && e.label === "项目名称" && e.hasValue && Number.isInteger(e.valuePath?.itemIndex));
    return new Promise((resolve) => {
      // Isolate the extension UI from the recruiting page's button/select CSS.
      const host = document.createElement("div");
      const shadow = host.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      const fontUrl = chrome.runtime?.getURL?.("assets/fonts/Manrope-Variable.ttf");
      style.textContent = `${fontUrl ? `@font-face{font-family:Manrope;src:url("${fontUrl}") format("truetype");font-weight:200 800}` : ""}
        :host{color-scheme:light}
        *{box-sizing:border-box}
        dialog{--accent:#4361ee;--ink:#0a0a0a;--muted:#5a6478;--rule:#d8dde6;width:min(760px,calc(100vw - 32px));max-height:calc(100dvh - 40px);padding:0;margin:auto;border:1px solid var(--rule);border-radius:22px;background:#fff;color:var(--ink);box-shadow:0 24px 100px #0004;font:14px/1.6 Manrope,"Avenir Next","PingFang SC",sans-serif;overflow:hidden}
        dialog::backdrop{background:#0a0a0a80;backdrop-filter:blur(4px)}
        .shell{display:flex;flex-direction:column;max-height:calc(100dvh - 42px)}
        header{padding:26px 28px 22px;border-bottom:1px solid var(--rule)}
        .brandline{display:flex;align-items:center;gap:10px;font-size:11px;font-weight:800;letter-spacing:.1em;color:var(--muted)}
        .brand{display:grid;place-items:center;width:28px;height:28px;border-radius:8px;background:var(--ink);color:#fff;font-size:11px;letter-spacing:-.5px}
        .close{margin-left:auto;width:32px;height:32px;border:0;border-radius:8px;background:#f5f7fb;color:var(--muted);font-size:22px;line-height:1}
        h2{font-size:24px;letter-spacing:-.6px;line-height:1.3;margin:18px 0 8px;font-weight:800}
        p{margin:0;color:var(--muted);font-size:13px}
        .list{padding:20px 28px;overflow:auto;overscroll-behavior:contain;min-height:0;display:grid;gap:12px;background:#f5f7fb}
        .card{padding:18px;border:1px solid var(--rule);border-radius:14px;background:#fff}
        .card.chosen{border-color:#4361ee55}
        .card-top{display:flex;align-items:center;gap:8px;margin-bottom:12px;font-size:11px;font-weight:700;color:var(--muted)}
        .number{font-variant-numeric:tabular-nums;color:var(--accent);font-weight:800}
        .state{margin-left:auto;background:#f5f7fb;border-radius:5px;padding:2px 7px;font-size:10px;letter-spacing:.02em}
        .chosen .state{background:#4361ee12;color:var(--accent)}
        .mapping{display:grid;grid-template-columns:minmax(0,1fr) 18px minmax(0,1.2fr);gap:14px;align-items:center}
        .label{display:block;font-size:11px;color:var(--muted);margin-bottom:6px;font-weight:600}
        .name{font-size:14px;line-height:1.6;font-weight:650;overflow-wrap:anywhere}
        .arrow{color:#98a0b0;font-size:18px;margin-top:20px}
        select{width:100%;min-height:42px;border:1px solid var(--rule);border-radius:9px;padding:8px 10px;background:#fff;color:var(--ink);font:inherit;font-size:13px;cursor:pointer;text-overflow:ellipsis}
        button{font-family:inherit;cursor:pointer;transition:background .15s}
        button:focus-visible,select:focus-visible{outline:3px solid #4361ee55;outline-offset:3px}
        footer{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 28px;border-top:1px solid var(--rule);background:#fff}
        .summary{font-size:12px;color:var(--muted)}
        .actions{display:flex;gap:10px;flex-shrink:0}
        .secondary,.primary{border:1px solid var(--rule);border-radius:9px;padding:10px 16px;font-size:13px;font-weight:700;background:white;color:var(--ink)}
        .primary{background:var(--accent);border-color:var(--accent);color:white}
        .primary:hover{background:#3552d7}.secondary:hover,.close:hover{background:#e8ecf3}
        @media(max-width:560px){header{padding:20px}.list{padding:16px}.mapping{grid-template-columns:1fr;gap:12px}.arrow{display:none}h2{font-size:21px}.card{padding:14px}footer{padding:16px;flex-wrap:wrap}.actions{width:100%;justify-content:flex-end}.summary{width:100%}}
      `;
      const make = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text) node.textContent = text; return node; };
      const dialog = make("dialog");
      dialog.setAttribute("aria-labelledby", "project-mapping-title");
      dialog.setAttribute("aria-describedby", "project-mapping-help");
      const shell = make("div", "shell"), header = make("header");
      const brandline = make("div", "brandline");
      const close = make("button", "close", "×"); close.type = "button"; close.setAttribute("aria-label", "取消本次填写");
      brandline.append(make("span", "brand", "OJ"), make("span", "", "OPENJOBAUTOFILL / 项目填写"), close);
      const title = make("h2", "", "确认项目对应关系"); title.id = "project-mapping-title";
      const help = make("p", "", `发现 ${groups.length} 个项目框。选择本机项目后，将更新名称、描述、链接和日期；跳过的项目保持原样。`); help.id = "project-mapping-help";
      header.append(brandline, title, help);
      const list = make("div", "list"), footer = make("footer"), summary = make("div", "summary"); summary.setAttribute("aria-live", "polite");
      const selects = [];
      const updateSummary = () => { const count = selects.filter((select) => select.value !== "").length; summary.textContent = `${count} 个项目待更新 · ${groups.length - count} 个跳过`; };
      groups.forEach((group, index) => {
        const name = group.fields.find((f) => inferFieldLabel(f) === "项目名称")?.currentValue || "未填写名称";
        const card = make("section", "card"), top = make("div", "card-top"), state = make("span", "state");
        top.append(make("span", "number", String(index + 1).padStart(2, "0")), make("span", "", "项目框"), state);
        const mapping = make("div", "mapping"), current = make("div");
        current.append(make("span", "label", "网页中的项目"), make("div", "name", name));
        const label = make("label"); label.append(make("span", "label", "使用本机资料"));
        const select = make("select"); select.setAttribute("aria-label", `第 ${index + 1} 个项目：${name}`);
        const skip = make("option", "", "跳过，不修改"); skip.value = ""; select.append(skip);
        identities.forEach((entry, i) => { const option = make("option", "", entry.value); option.value = String(i); select.append(option); });
        const ranked = identities.map((entry,i) => ({i,score:projectNameSimilarity(name,entry.value)})).sort((a,b)=>b.score-a.score);
        const suggested = ranked[0]?.score >= 0.72 && (!ranked[1] || ranked[0].score-ranked[1].score >= 0.1);
        if (suggested) select.value = String(ranked[0].i);
        const updateCard = (manual = false) => { card.classList.toggle("chosen", select.value !== ""); state.textContent = select.value === "" ? "已跳过" : manual ? "已指定" : "建议对应"; updateSummary(); };
        select.addEventListener("change", () => updateCard(true));
        selects.push(select); updateCard();
        label.append(select); mapping.append(current, make("span", "arrow", "→"), label); card.append(top, mapping); list.append(card);
      });
      const finish = (ok) => { dialog.close(); host.remove(); resolve(ok); };
      const cancel = make("button", "secondary", "取消填写"); cancel.type = "button"; cancel.onclick = () => finish(false); close.onclick = cancel.onclick;
      const apply = make("button", "primary", "确认并继续"); apply.type = "button";
      apply.onclick = () => { groups.forEach((group,i) => assignProjectOverwrite(group, selects[i].value === "" ? null : identities[Number(selects[i].value)])); finish(true); };
      dialog.addEventListener("cancel", (event) => { event.preventDefault(); finish(false); });
      const actions = make("div", "actions"); actions.append(cancel, apply); footer.append(summary, actions); shell.append(header, list, footer); dialog.append(shell); shadow.append(style, dialog); document.body.append(host); dialog.showModal();
    });
  }

  async function generateAutofillPlan(options = {}) {
    const ownsRun = !options.continueRun;
    let runId = Number(options.runId || 0);

    if (ownsRun) {
      runId = startAutofillRun("扫描页面并准备填写");
      if (!runId) {
        setProfilePanelStatus("当前已有扫描任务在运行，请稍候。", true);
        return { ok: false, reason: "busy" };
      }
    } else if (!isCurrentAutofillRun(runId)) {
      return { ok: false, reason: "busy" };
    }

    try {
      setAutofillProgress("读取本机资料", 8, "本地读取简历资料");
      await refreshCurrentProfile({ force: true });
      setAutofillProgress("扫描当前页面", 24, "本地扫描页面字段并展开可编辑区域");
      setProfilePanelStatus("正在本地扫描当前页面并准备自动填写...");
      const baseScan = await scanForm();
      setAutofillProgress("整理表单字段", 42, `本地已发现 ${baseScan.fields.length} 个可见字段`);
      const aiStructure = await enhanceScanWithAi(baseScan);
      const scan = aiStructure.scan || baseScan;
      if (options.chooseProjects && !await chooseProjectOverwrites(scan)) return { ok: false, reason: "cancelled" };
      const localPlan = buildAutofillPlan(scan);
      let plan = localPlan;

      try {
        const aiResult = await enhancePlanWithAi(scan, localPlan);
        plan = aiResult.plan || plan;
      } catch (error) {
        setAutofillAiFallback("字段理解", error);
        setAutofillProgress("本地兜底匹配", 84, `AI 不可用，正在用本地规则兜底 ${scan.fields.length} 个字段`);
      }

      const manualIds = new Set(scan.fields.filter((f) => Object.prototype.hasOwnProperty.call(f, "manualProjectBinding")).map((f) => f.fieldId));
      if (manualIds.size) {
        plan.candidates = [...plan.candidates.filter((c) => !manualIds.has(c.fieldId)), ...localPlan.candidates.filter((c) => manualIds.has(c.fieldId))];
        plan.autoFillIds = new Set(plan.candidates.filter((c) => c.shouldAutoFill).map((c) => c.id));
      }

      if (plan.mappingSource === "本地规则" && (autofillAiState.usedPhases || []).includes("表单字段识别")) {
        plan = {
          ...plan,
          mappingSource: "AI 表单字段识别 + 本地规则"
        };
      }

      // AI may add a candidate for a field that local matching could not
      // resolve. Recompute the reminder from the final plan so the notice is
      // actionable and does not report fields that were successfully filled.
      plan = {
        ...plan,
        missingProfileFields: collectMissingProfileFields(plan)
      };

      const aiUsage = getAutofillAiSnapshot();
      const aiStatus = aiUsage.message;
      const matchSummary = buildPlanMatchSummary(plan);
      setAutofillProgress("整理匹配结果", 90, appendMissingProfileReminder(`${matchSummary}，共匹配 ${plan.candidates.length} 项`, plan.missingProfileFields));
      updateAutofillDebugPlan(plan, { aiStatus, aiUsage });

      const autoFillCount = plan.autoFillIds.size;
      setProfilePanelStatus(
        plan.candidates.length > 0
          ? appendMissingProfileReminder(`${aiStatus} ${matchSummary}，共匹配 ${plan.candidates.length} 项，将自动填写 ${autoFillCount} 项。`, plan.missingProfileFields)
          : appendMissingProfileReminder(`${aiStatus} 没有找到可自动匹配的字段。`, plan.missingProfileFields)
      );
      setAutofillProgress("匹配完成", 90, appendMissingProfileReminder(`${matchSummary}，准备自动填写当前网页`, plan.missingProfileFields));
      return {
        ok: true,
        plan,
        aiStatus,
        aiUsage,
        aiUsed: aiUsage.used,
        aiFallbackReason: aiUsage.fallbackReason,
        autoFillCount
      };
    } catch (error) {
      renderProfilePanel();
      setProfilePanelStatus(`准备填写失败：${error.message}`, true);
      return { ok: false, reason: error.message };
    } finally {
      if (ownsRun) {
        clearAutofillProgress();
      }
    }
  }

  async function runOneClickAutofill() {
    const runId = startAutofillRun("开始填写");
    if (!runId) {
      setProfilePanelStatus("当前已有填写任务在运行，请稍候。", true);
      return { ok: false, reason: "busy" };
    }

    try {
      clearMarks();
      setProfilePanelStatus("正在扫描页面并准备一键填写...");
      const planResult = await generateAutofillPlan({ runId, continueRun: true, chooseProjects: true });
      if (!planResult?.ok) {
        return planResult || { ok: false, reason: "plan failed" };
      }

      const plan = planResult.plan;
      const aiUsage = sanitizeAutofillAiUsage(planResult.aiUsage || getAutofillAiSnapshot());
      const autoFillIds = plan?.autoFillIds instanceof Set
        ? plan.autoFillIds
        : new Set(Array.isArray(plan?.autoFillIds) ? plan.autoFillIds : []);

      if (!plan || autoFillIds.size === 0) {
        const missingProfileFields = plan?.missingProfileFields || [];
        setProfilePanelStatus(
          appendMissingProfileReminder("本页没有自动填写项，橙色字段需要手动处理。可以打开资料面板查看和复制资料。", missingProfileFields),
          true
        );
        const skippedCount = await markDeferredPlanCandidates(plan, autoFillIds);
        await markMissingProfileFields(plan);
        const summary = {
          attempted: 0,
          filled: 0,
          failed: 0,
          skipped: skippedCount || plan?.candidates?.length || 0,
          total: plan?.candidates?.length || 0,
          message: appendMissingProfileReminder("没有找到可自动填写的字段，橙色标记需要手动处理。", missingProfileFields),
          missingProfileFields,
          aiUsage
        };
        setAutofillSummary(summary);
        updateAutofillDebugResults(summary, []);
        return {
          ok: false,
          reason: "no candidates",
          aiUsage,
          aiUsed: aiUsage.used,
          aiFallbackReason: aiUsage.fallbackReason
        };
      }

      setAutofillProgress("填写匹配项", 94, `本地准备填写 ${autoFillIds.size} 项`);
      const beforeCount = autoFillIds.size;
      const fillResult = await applyAutofillPlan(plan, autoFillIds, { runId });
      if (profilePanelVisible) {
        renderProfilePanel();
      }
      if (!fillResult?.ok) {
        return fillResult || { ok: false, reason: "fill failed" };
      }
      return {
        ok: true,
        autoFilled: beforeCount,
        filled: fillResult.filled || 0,
        failed: fillResult.failed || 0,
        skipped: fillResult.skipped || 0,
        total: fillResult.total || 0,
        aiUsage,
        aiUsed: aiUsage.used,
        aiFallbackReason: aiUsage.fallbackReason
      };
    } catch (error) {
      setProfilePanelStatus(`一键填写失败：${error.message}`, true);
      throw error;
    } finally {
      clearAutofillProgress();
    }
  }

  async function applyAutofillPlan(plan, autoFillIds, options = {}) {
    const runId = Number(options.runId || 0);
    if (autofillInProgress && !isCurrentAutofillRun(runId)) {
      setProfilePanelStatus("当前正在处理其他填写任务，请稍候。", true);
      return { ok: false, reason: "busy" };
    }

    const autoFillSet = autoFillIds instanceof Set ? autoFillIds : new Set(autoFillIds || []);
    if (!plan || autoFillSet.size === 0) {
      setProfilePanelStatus("没有找到可自动填写的匹配项。", true);
      return { ok: false, reason: "no autofill candidates" };
    }

    const autoFillCandidates = plan.candidates.filter((candidate) => autoFillSet.has(candidate.id));
    if (autoFillCandidates.length === 0) {
      setProfilePanelStatus("没有找到可自动填写项。", true);
      return { ok: false, reason: "empty autofill candidates" };
    }

    setProfilePanelStatus("正在把匹配项填写到当前网页...");
    if (isCurrentAutofillRun(runId)) {
      setAutofillProgress("填写匹配项", 94, `本地准备填写 ${autoFillCandidates.length} 项`);
    }
    const results = [];

    for (let index = 0; index < autoFillCandidates.length; index += 1) {
      const candidate = autoFillCandidates[index];
      const field = candidate.field;
      let element = await resolveFieldElement(field);
      let ok = false;
      let note = "";

      if (element) {
        if (candidate.alreadyMatches) {
          ok = true;
          note = "当前值已匹配本机资料";
        } else {
          const fillResult = await fillElementSmart(element, candidate.value, field, candidate);
          ok = Boolean(fillResult?.ok);
          note = fillResult?.reason || fillResult?.warning || "";
        }
      } else {
        note = "未找到可自动填写控件";
      }

      if (element) {
        markElement(element, ok ? "filled" : "uncertain", `${ok ? "自动填写" : "待处理"}: ${candidate.fieldLabel || candidate.sourceLabel || candidate.id}`);
      }

      if (isCurrentAutofillRun(runId)) {
        const percent = 94 + Math.round(((index + 1) / autoFillCandidates.length) * 6);
        setAutofillProgress("填写匹配项", percent, `本地已处理 ${index + 1}/${autoFillCandidates.length} 项`);
      }

      results.push({
        id: candidate.id,
        ok,
        note
      });
    }

    const filledCount = results.filter((result) => result.ok).length;
    const failedCount = results.length - filledCount;
    const skippedCount = await markDeferredPlanCandidates(plan, autoFillSet);
    await markMissingProfileFields(plan);
    const summary = {
      attempted: results.length,
      filled: filledCount,
      failed: failedCount,
      skipped: skippedCount,
      pending: failedCount + skippedCount,
      total: plan?.candidates?.length || results.length,
      message: appendMissingProfileReminder("页面已标记：绿色为已填写，橙色为待处理。", plan?.missingProfileFields || []),
      missingProfileFields: plan?.missingProfileFields || [],
      aiUsage: getAutofillAiSnapshot()
    };
    setProfilePanelStatus(appendMissingProfileReminder(`已自动填写 ${filledCount} 项，待处理 ${summary.pending} 项。`, summary.missingProfileFields));
    setAutofillSummary(summary);
    updateAutofillDebugResults(summary, results);
    await persistProfilePanelState(getProfilePanelStateSnapshot());
    return {
      ok: true,
      attempted: results.length,
      filled: filledCount,
      failed: failedCount,
      skipped: skippedCount,
      total: plan?.candidates?.length || results.length,
      aiUsage: summary.aiUsage,
      results
    };
  }

  async function markDeferredPlanCandidates(plan, autoFillIds) {
    if (!plan || !Array.isArray(plan.candidates)) {
      return 0;
    }

    const autoFillSet = autoFillIds instanceof Set ? autoFillIds : new Set(autoFillIds || []);
    let count = 0;
    for (const candidate of plan.candidates) {
      if (autoFillSet.has(candidate.id)) {
        continue;
      }
      if (!candidate.canAutoFill) {
        continue;
      }
      const element = findFieldElement(candidate.field);
      if (!element) {
        continue;
      }
      markElement(element, "uncertain", `待处理: ${candidate.fieldLabel || candidate.sourceLabel || candidate.id}`);
      count += 1;
      if (count % 12 === 0) {
        await sleep(0);
      }
    }
    return count;
  }

  async function markMissingProfileFields(plan) {
    const missing = new Set(Array.isArray(plan?.missingProfileFields) ? plan.missingProfileFields : []);
    if (!missing.size) {
      return 0;
    }

    let count = 0;
    for (const field of Array.isArray(plan?.scan?.fields) ? plan.scan.fields : []) {
      const label = field?.inferredLabel || inferFieldLabel(field);
      const category = field?.inferredCategory || inferMatchSection(field);
      if (!field?.canFill || field.hasCurrentValue || !missing.has(label) || category === "家庭信息" || isLikelyFamilyMemberContext(field, label)) {
        continue;
      }
      const element = findFieldElement(field);
      if (!element) {
        continue;
      }
      markElement(element, "uncertain", `资料待补全：${label}`);
      count += 1;
      if (count % 12 === 0) {
        await sleep(0);
      }
    }
    return count;
  }

  function getLayuiOptionElements(select) {
    const proxy = findLayuiProxyForSelect(select);
    if (!proxy) {
      return [];
    }

    return Array.from(proxy.querySelectorAll("dl > dd[lay-value], dd[lay-value]")).filter(isVisible);
  }

  async function waitForLayuiOption(select, target, timeout = 1400) {
    const startedAt = Date.now();
    let options = [];
    let matched = null;
    while (Date.now() - startedAt < timeout) {
      options = getLayuiOptionElements(select);
      matched = options.find((option) => {
        const label = getElementText(option);
        const optionValue = option.getAttribute("lay-value") || "";
        return choiceTextMatches(label, target) || choiceTextMatches(optionValue, target);
      }) || null;
      if (matched) {
        break;
      }
      await sleep(100);
    }
    return { options, matched };
  }

  async function tryFillLayuiSelect(element, value, field) {
    const adapter = getFieldControlAdapter(element);
    if (adapter?.id !== "layui") {
      return { handled: false };
    }

    const select = getLogicalControlElement(element);
    if (!(select instanceof HTMLSelectElement)) {
      return { handled: false };
    }

    const target = normalizeChoiceValue(value, inferFieldLabel(field));
    const proxy = findLayuiProxyForSelect(select);
    const trigger = proxy?.querySelector(".layui-select-title,input:not([type='hidden'])") || proxy;
    if (trigger && isVisible(trigger)) {
      clickActionElement(trigger);
    }

    const { matched } = await waitForLayuiOption(select, target);

    if (matched) {
      clickActionElement(matched);
      await sleep(100);
      const selectedOption = Array.from(select.options).find((option) => option.selected);
      if (!selectedOption || choiceTextMatches(selectedOption.textContent || "", target) || choiceTextMatches(selectedOption.value || "", target)) {
        return { handled: true, ok: true, adapterId: "layui" };
      }
    }

    // If Layui has not rendered its proxy yet, preserve the native value as a
    // safe fallback. The change event still lets the page update its model.
    const matchedNative = Array.from(select.options).find((option) => {
      return choiceTextMatches(option.textContent || "", target) || choiceTextMatches(option.value || "", target);
    });
    if (matchedNative) {
      setNativeValue(select, matchedNative.value);
      return { handled: true, ok: true, warning: "Layui 代理未及时渲染，已通过原生 select 写入", adapterId: "layui" };
    }

    return { handled: true, ok: false, reason: "Layui 下拉选项尚未加载或没有匹配项", adapterId: "layui" };
  }

  async function fillPhoenixDate(element, value) {
    const root = getPhoenixDateRoot(element);
    const target = normalizeDateValue(value);
    const present = /^(至今|现在|目前|present|current|now)$/i.test(String(value).trim());
    const fail = (reason) => ({ ok: false, reason, adapterId: "phoenix-date" });
    if (!root) return fail("未找到 Phoenix 日期控件");
    const isMonthTarget = /^\d{4}-(0[1-9]|1[0-2])$/.test(target);
    const isDateTarget = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(target);
    if (!present && !isMonthTarget && !isDateTarget) {
      return fail("日期格式应为 YYYY-MM 或 YYYY-MM-DD，未写入无法确认的日期");
    }
    const checkbox = getPhoenixPresentCheckbox(root);
    if (present) {
      if (!checkbox || checkbox.disabled) return fail("该日期没有可用的至今选项");
      if (!checkbox.checked) checkbox.click();
      await sleep(80);
      return readPhoenixDate(root) === "至今" ? { ok: true } : fail("至今选项未生效");
    }
    if (checkbox?.checked) {
      checkbox.click();
      await sleep(80);
      if (checkbox.checked) return fail("未能取消至今选项");
    }
    if (readPhoenixDate(root) === target) return { ok: true };
    const surface = getPhoenixDateSurface(root);
    if (!surface || surface.classList?.contains("phoenix-select--disabled") || surface.getAttribute?.("aria-disabled") === "true") {
      return fail("日期控件不可用");
    }
    // Use the calendar's public DOM controls; input.value is only search text.
    const visible = (selector) => Array.from(document.querySelectorAll(selector)).filter(isVisible);
    const one = (selector) => { const nodes = visible(selector); return nodes.length === 1 ? nodes[0] : null; };
    const calendarSurfaces = Array.from(new Set([
      surface,
      root.querySelector?.(".phoenix-calendar-input-wrap"),
      root.querySelector?.(".phoenix-date-picker"),
      root
    ].filter(Boolean)));
    let calendarOpened = false;
    for (const candidate of calendarSurfaces) {
      candidate.click?.();
      for (let attempt = 0; attempt < 10; attempt += 1) {
        if (one(".phoenix-calendar-month-panel") || one(".phoenix-calendar-date-panel")) {
          calendarOpened = true;
          break;
        }
        await sleep(50);
      }
      if (calendarOpened) break;
    }
    let panel = one(".phoenix-calendar-month-panel");
    const openedDatePanel = !panel && isDateTarget;
    let datePanel = openedDatePanel ? one(".phoenix-calendar-date-panel") : null;
    if (!calendarOpened || (!panel && !datePanel)) return fail("未打开唯一的日期/月面板，请手动选择");
    const yearButton = panel
      ? Array.from(panel.querySelectorAll('[role="button"]')).find((node) => /^\d{4}$/.test(getElementText(node)))
      : datePanel.querySelector(".phoenix-calendar-year-select") ||
        Array.from(datePanel.querySelectorAll('[role="button"]')).find((node) => /^\d{4}$/.test(getElementText(node)));
    if (!yearButton) return fail("未识别日历年份入口");
    yearButton.click();
    await sleep(60);
    const [year, month] = target.split("-").map(Number);
    let selected = false;
    for (let attempt = 0; attempt < 25; attempt++) {
      panel = one(".phoenix-calendar-year-panel");
      if (!panel) break;
      const years = Array.from(panel.querySelectorAll(".phoenix-calendar-year-panel-year"));
      const match = years.find((node) => Number(getElementText(node)) === year);
      if (match) {
        if (/disabled/.test(match.parentElement.className)) return fail("目标年份不可选");
        match.click(); selected = true; await sleep(60); break;
      }
      const numbers = years.map((node) => Number(getElementText(node))).filter(Number.isFinite);
      if (!numbers.length) break;
      const direction = year < Math.min(...numbers) ? "prev" : "next";
      const nav = panel.querySelector(`.phoenix-calendar-year-panel-${direction}-decade-btn`);
      if (!nav) break;
      nav.click(); await sleep(60);
    }
    if (!selected) return fail("未能选择目标年份");
    if (openedDatePanel) {
      datePanel = one(".phoenix-calendar-date-panel");
      const monthButton = datePanel?.querySelector(".phoenix-calendar-month-select") ||
        Array.from(datePanel?.querySelectorAll?.('[role="button"]') || [])
          .find((node) => !/^\d{4}$/.test(getElementText(node)) && /月|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/i.test(getElementText(node)));
      if (!monthButton) return fail("未识别日历月份入口");
      monthButton.click();
      for (let attempt = 0; attempt < 10 && !one(".phoenix-calendar-month-panel"); attempt++) await sleep(50);
    }
    panel = one(".phoenix-calendar-month-panel");
    const monthNode = Array.from(panel?.querySelectorAll(".phoenix-calendar-month-panel-month") || [])
      .find((node) => getElementText(node) === `${month}月`);
    if (!monthNode || /disabled/.test(monthNode.parentElement.className)) return fail("目标月份不可选");
    monthNode.click();

    // Birth dates use the full date mode. Selecting a month only changes the
    // calendar view; select the exact day from the resulting date grid before
    // considering the field filled.
    if (isDateTarget) {
      const day = Number(target.slice(-2));
      for (let attempt = 0; attempt < 12; attempt++) {
        await sleep(50);
        const datePanel = one(".phoenix-calendar-date-panel");
        if (!datePanel) continue;
        const gridCells = Array.from(datePanel.querySelectorAll('[role="gridcell"]'));
        const dateCells = gridCells.length > 0
          ? gridCells
          : Array.from(datePanel.querySelectorAll(".phoenix-calendar-date"));
        const cells = dateCells
          .filter((node) => {
            const className = String(node.className || "");
            return !/disabled-cell|last-month|next-month|disabled/.test(className) &&
              (getElementText(node) === String(day) || getElementText(node.querySelector?.(".phoenix-calendar-date")) === String(day));
          });
        if (cells.length === 1) {
          cells[0].click();
          break;
        }
      }
    }
    for (let attempt = 0; attempt < 10; attempt++) {
      await sleep(50);
      if (readPhoenixDate(root) === target) return { ok: true };
    }

    // Some Phoenix builds expose a manual date input. It is safe to try it as
    // a final fallback, but still require a successful read-back so a search
    // string is never reported as a completed selection.
    const input = getPhoenixDateInput(root);
    if (input && !input.disabled) {
      input.focus?.();
      setNativeValue(input, target);
      input.dispatchEvent?.(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true }));
      input.blur?.();
      for (let attempt = 0; attempt < 6; attempt++) {
        await sleep(60);
        if (readPhoenixDate(root) === target) return { ok: true, warning: "通过 Phoenix 日期输入框回填并回读确认" };
      }
    }
    return fail("日历未确认目标日期，未标记为填写成功");
  }

  function readFeishuPeriod(element) {
    const text = getElementText(element).replace(/\s+/g, "");
    if (/至今/.test(text)) return "至今";
    const match = text.match(/^(\d{4})-(\d{1,2})$/);
    return match ? `${match[1]}-${match[2].padStart(2, "0")}` : "";
  }

  async function fillFeishuPeriod(element, value) {
    const fail = (reason) => ({ok: false, reason, adapterId: "feishu-period"});
    const present = /^(至今|现在|目前|present)$/i.test(String(value).trim());
    const date = String(value).match(/^(\d{4})[-/.年](\d{1,2})(?:月)?$/);
    if (!present && (!date || +date[2] < 1 || +date[2] > 12)) return fail("日期格式应为 YYYY-MM");
    const id = element.getAttribute("data-cy");
    if (!id || (present && !/End$/.test(id))) return fail("日期端点不支持此值");
    const expected = present ? "至今" : `${date[1]}-${date[2].padStart(2,"0")}`;
    if (readFeishuPeriod(element) === expected) return {ok:true, adapterId:"feishu-period"};
    element.click();
    await new Promise((resolve) => setTimeout(resolve, 120));
    const panel = () => Array.from(document.querySelectorAll(".atsx-date-picker-period-month-panel"))
      .find((e) => e.getAttribute("data-cy") === `${id}Dropdown` && isVisible(e));
    const choose = async (label) => {
      const option = Array.from(panel()?.querySelectorAll(".atsx-date-picker-period-month-panel-list-item") || [])
        .find((e) => getElementText(e).trim() === label && !/disabled/.test(e.className) && e.getAttribute("aria-disabled") !== "true");
      if (!option) return false;
      option.scrollIntoView({block:"nearest"}); option.click();
      await new Promise((resolve) => setTimeout(resolve, 120));
      return true;
    };
    if (present) {
      if (!await choose("至今")) return fail("未找到至今选项");
    } else {
      if (!await choose(date[1])) return fail("未找到目标年份");
      if (!await choose(date[2].padStart(2,"0"))) return fail("未找到目标月份");
    }
    return readFeishuPeriod(element) === expected
      ? {ok:true, adapterId:"feishu-period"}
      : fail("日期选择后回读不一致，需核对");
  }

  async function fillElementSmart(element, value, field, candidate) {
    if (!element) {
      return { ok: false, reason: "field not found" };
    }

    if (getFieldControlAdapter(element)?.id === "phoenix-radio") {
      const root = element.closest(".phoenix-radio-group");
      const target = normalizeChoiceValue(value, field?.label || "");
      const options = Array.from(root.querySelectorAll(".phoenix-radio"));
      const matches = options.filter((option) => choiceTextMatches(getElementText(option.querySelector(".phoenix-radio__radio-text")), target));
      if (matches.length !== 1) return { ok: false, reason: "Phoenix 单选未找到唯一选项" };
      clickActionElement(matches[0]);
      await sleep(100);
      return { ok: matches[0].classList.contains("phoenix-radio--checked"), reason: matches[0].classList.contains("phoenix-radio--checked") ? "" : "Phoenix 单选未确认选中" };
    }
    if (element.matches?.(".atsx-date-picker-period-month-label")) return fillFeishuPeriod(element, value);
    if (getPhoenixDateRoot(element)) {
      return fillPhoenixDate(element, value);
    }
    const type = getControlType(element);
    if (element.disabled || element.getAttribute("aria-disabled") === "true") {
      return { ok: false, reason: "field disabled" };
    }

    if (type === "file") {
      return { ok: false, reason: "file upload requires manual selection" };
    }

    if (field?.siteAdapterId === "hotjob") {
      if (element.closest?.(".ant-calendar-picker")) {
        return { ok: false, reason: "HotJob 只读日历需手动选择日期，未改写输入框" };
      }
      if (element.closest?.(".ant-select")) {
        return tryFillHotjobSelect(element, value);
      }
    }

    const adapterResult = await tryFillLayuiSelect(element, value, field);
    if (adapterResult.handled) {
      return adapterResult;
    }

    if (getFieldControlAdapter(element)?.id === "moka-sd-select") {
      const surface = getControlSurfaceElement(element);
      const choiceResult = await tryFillCustomChoiceField(surface || element, value, field);
      return choiceResult.ok
        ? { ...choiceResult, adapterId: "moka-sd-select" }
        : { ...choiceResult, ok: false, adapterId: "moka-sd-select" };
    }

    // Phoenix autocomplete controls are React-managed inputs. Writing their
    // value directly only changes the search text and leaves the form model
    // empty, so always open the option layer and click the exact item.
    if (getFieldControlAdapter(element)?.id === "phoenix-autocomplete") {
      const surface = getControlSurfaceElement(element);
      const choiceResult = await tryFillCustomChoiceField(surface || element, value, field);
      return choiceResult.ok
        ? { ...choiceResult, adapterId: "phoenix-autocomplete" }
        : { ...choiceResult, ok: false, adapterId: "phoenix-autocomplete" };
    }

    const editableTarget = resolveEditableTarget(element);
    if (editableTarget && editableTarget !== element) {
      element = editableTarget;
    }

    const text = compactText([candidate?.fieldLabel, field?.nearbyText, field?.placeholder, field?.name, field?.id, field?.section].join(" "));
    const isChoiceField = candidate?.writeMode === "choice" || /选择|请选择|下拉|选择项|单选/.test(text);

    if (candidate?.writeMode === "date") {
      setNativeValue(element, normalizeDateValue(value));
      return { ok: true };
    }

    if (element instanceof HTMLInputElement && ["checkbox", "radio"].includes(element.type)) {
      return fillBooleanOrRadioChoice(element, value, field, candidate);
    }

    if (element.getAttribute("role") === "radio" || element.getAttribute("role") === "checkbox") {
      return fillRoleChoice(element, value, field, candidate);
    }

    if (type === "combobox") {
      const choiceResult = await tryFillCustomChoiceField(element, value, field);
      if (choiceResult.ok) {
        return choiceResult;
      }

      const textInput = element.querySelector?.('input:not([type="hidden"]),textarea,[contenteditable="true"]');
      if (textInput && textInput !== element) {
        setNativeValue(textInput, value);
        return { ok: true, warning: "combobox fallback wrote into inner input only" };
      }
    }

    if (element instanceof HTMLSelectElement) {
      const matched = setSelectValue(element, value);
      return { ok: true, warning: matched ? "" : "下拉选项需要手动确认，已尝试按原值填写" };
    }

    if (element.isContentEditable) {
      setContentEditableValue(element, value);
      return { ok: true };
    }

    if (isChoiceField) {
      const choiceResult = await tryFillCustomChoiceField(element, value, field);
      if (choiceResult.ok) {
        return choiceResult;
      }
    }

    element.focus();
    setNativeValue(element, value);
    return { ok: true };
  }

  function resolveEditableTarget(element) {
    if (!element || !(element instanceof Element)) {
      return null;
    }

    if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement ||
      element.isContentEditable
    ) {
      return element;
    }

    const role = element.getAttribute("role");
    if (role === "radio" || role === "checkbox") {
      return element;
    }

    const input = element.querySelector?.('input:not([type="hidden"]),textarea,[contenteditable="true"]');
    return input || element;
  }

  function fillRoleChoice(element, value, field, candidate) {
    const role = element.getAttribute("role");
    const target = normalizeChoiceValue(value, candidate?.fieldLabel || field?.label || "");
    const root = findChoiceFieldContainer(element);
    const options = Array.from(root.querySelectorAll('[role="radio"],[role="checkbox"],label,button,[class*="radio"],[class*="checkbox"]'));
    const matched = options.find((option) => {
      const text = getElementText(option);
      return choiceTextMatches(text, target) || choiceTextMatches(option.getAttribute("aria-label") || "", target);
    });

    if (matched) {
      clickActionElement(matched);
      return { ok: true };
    }

    if (role === "checkbox" && /^(是|yes|true|1|on)$/i.test(target)) {
      clickActionElement(element);
      return { ok: true };
    }

    if (role === "radio") {
      clickActionElement(element);
      return { ok: true };
    }

    return { ok: false, reason: "no matching role choice found" };
  }

  function fillBooleanOrRadioChoice(element, value, field, candidate) {
    if (element instanceof HTMLInputElement && element.type === "checkbox") {
      setCheckboxOrRadio(element, value);
      return { ok: true };
    }

    if (!(element instanceof HTMLInputElement) || element.type !== "radio") {
      return { ok: false, reason: "unsupported choice field" };
    }

    const target = normalizeChoiceValue(value, candidate?.fieldLabel || field?.label || "");
    const group = element.name
      ? Array.from(document.querySelectorAll(`input[type="radio"][name="${CSS.escape(element.name)}"]`))
      : [element];
    let matched = null;

    for (const radio of group) {
      const radioLabel = normalizeChoiceLabel(getChoiceLabelText(radio));
      if (radioLabel && choiceTextMatches(radioLabel, target)) {
        matched = radio;
        break;
      }
    }

    if (!matched) {
      matched = group.find((radio) => String(radio.value || "").trim() === target || choiceTextMatches(radio.value || "", target)) || null;
    }

    if (!matched) {
      return { ok: false, reason: "no matching radio option" };
    }

    matched.click();
    matched.dispatchEvent(new Event("change", { bubbles: true }));
    return { ok: true };
  }

  function getChoiceLabelText(element) {
    if (!element) {
      return "";
    }

    const parent = element.closest("label") || element.parentElement;
    const siblings = [];
    if (parent) {
      siblings.push(getElementText(parent));
      if (parent.nextElementSibling) {
        siblings.push(getElementText(parent.nextElementSibling));
      }
      if (parent.previousElementSibling) {
        siblings.push(getElementText(parent.previousElementSibling));
      }
    }

    return normalizeText(siblings.filter(Boolean).join(" "), 120);
  }

  function normalizeChoiceLabel(value) {
    // Unlike field-name matching, option matching must preserve digits and negation.
    return normalizeText(value, Infinity).toLowerCase().replace(/[()（）[\]【】<>《》"'“”‘’、,，。·•\s|:：/\\-]/g, "")
      .replace(/大学本科/g, "本科")
      .replace(/^硕士研究生$/, "硕士")
      .replace(/^博士研究生$/, "博士")
      .replace(/^(大学)?英语四级$|^四级$/, "cet4")
      .replace(/^(大学)?英语六级$|^六级$/, "cet6")
      .replace(/学校级/g, "校级")
      .replace(/学院级/g, "院级")
      .replace(/离异/g, "离婚");
  }

  function normalizeChoiceValue(value, fallback = "") {
    const text = normalizeText(value == null ? fallback : value, 80);
    if (!text) {
      return "";
    }
    if (/^(是|yes|true|1|on)$/i.test(text)) {
      return "是";
    }
    if (/^(否|no|false|0|off)$/i.test(text)) {
      return "否";
    }
    return text;
  }

  function normalizeDateValue(value) {
    const text = normalizeText(value, 80);
    if (!text) {
      return "";
    }

    const yearMonthDay = text.match(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
    if (yearMonthDay) {
      const [, year, month, day] = yearMonthDay;
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }

    const yearMonth = text.match(/(\d{4})[./-](\d{1,2})/);
    if (yearMonth) {
      const [, year, month] = yearMonth;
      return `${year}-${String(month).padStart(2, "0")}`;
    }

    const chineseYearMonthDay = text.match(/(\d{4})年(\d{1,2})月(\d{1,2})日?/);
    if (chineseYearMonthDay) {
      const [, year, month, day] = chineseYearMonthDay;
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }

    const chineseYearMonth = text.match(/(\d{4})年(\d{1,2})月/);
    if (chineseYearMonth) {
      const [, year, month] = chineseYearMonth;
      return `${year}-${String(month).padStart(2, "0")}`;
    }

    return text;
  }

  function choiceTextMatches(label, target) {
    const left = normalizeChoiceLabel(label);
    const right = normalizeChoiceLabel(target);
    if (!left || !right) {
      return false;
    }
    return left === right;
  }

  async function tryFillHotjobSelect(element, value) {
    const root = element.closest(".ant-select");
    const surface = root?.querySelector('[role="combobox"]');
    if (!surface || root.classList.contains("ant-select-disabled")) {
      return { ok: false, reason: "HotJob 下拉框不可用" };
    }
    const selectedValue = () => getElementText(root.querySelector(".ant-select-selection-selected-value"));
    if (choiceTextMatches(selectedValue(), value)) return { ok: true };
    const popupId = surface.getAttribute("aria-controls") || surface.getAttribute("aria-owns");
    if (!popupId) return { ok: false, reason: "HotJob 下拉框缺少专属选项容器，未尝试全页匹配" };
    if (surface.getAttribute("aria-expanded") !== "true") clickActionElement(surface);
    const search = root.querySelector("input.ant-select-search__field");
    const previousSearch = search?.value || "";
    try {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        await sleep(150);
        const popup = document.getElementById(popupId);
        const options = Array.from(popup?.querySelectorAll('[role="option"],.ant-select-dropdown-menu-item') || [])
          .filter((option) => isVisible(option) && option.getAttribute("aria-disabled") !== "true" &&
            !option.classList.contains("ant-select-dropdown-menu-item-disabled"));
        const matches = options.filter((option) => choiceTextMatches(getElementText(option), value));
        if (matches.length === 1) {
          clickActionElement(matches[0]);
          await sleep(150);
          return choiceTextMatches(selectedValue(), value)
            ? { ok: true }
            : { ok: false, reason: "HotJob 选项点击后未确认选中值" };
        }
        if (attempt === 1 && search) setNativeValue(search, value);
      }
      return { ok: false, reason: "HotJob 未找到唯一精确选项，未将搜索文字当作已填写" };
    } finally {
      if (search) setNativeValue(search, previousSearch);
      if (surface.getAttribute("aria-expanded") === "true") {
        surface.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true }));
      }
    }
  }

  // Phoenix constant/region selectors render outside the field. Text labels
  // navigate; the adjacent icon selects, and the footer commits the selection.
  function getVisiblePhoenixSelector() {
    const layers = Array.from(document.querySelectorAll(".common-unmodeled-layer"))
      .filter((layer) => {
        const rect = layer.getBoundingClientRect();
        return isVisible(layer) && rect.right > 0 && rect.bottom > 0 &&
          layer.querySelector(".selector-footer-button,.phoenix-selectList");
      });
    return layers.length === 1 ? layers[0] : null;
  }

  function getPhoenixFooterButton(popup, text) {
    const wrapper = Array.from(popup.querySelectorAll(".selector-footer-button .button-container"))
      .find((node) => getElementText(node).trim() === text);
    if (!wrapper) return null;
    // Clicking a wrapper does not dispatch a click to its child button.
    const button = wrapper.querySelector?.("button,[role='button'],.phoenix-button");
    if (button) return button;
    const leaves = Array.from(wrapper.querySelectorAll?.("*") || [])
      .filter((node) => getElementText(node).trim() === text);
    return leaves[leaves.length - 1] || wrapper;
  }

  function closePhoenixSelector(popup) {
    const cancel = getPhoenixFooterButton(popup, "取消");
    if (cancel) cancel.click();
    else document.body?.click();
  }

  async function tryFillPhoenixSelector(element, value, popup) {
    const parts = splitHierarchicalChoiceValue(value);
    const route = parts.length ? parts : [value];
    const fail = (reason) => {
      closePhoenixSelector(popup);
      return { ok: false, reason };
    };
    for (let index = 0; index < route.length; index += 1) {
      let matches = [];
      for (let attempt = 0; attempt < 8; attempt += 1) {
        matches = Array.from(popup.querySelectorAll(".left-container .list-item-container"))
          .filter((row) => isVisible(row) && choiceTextMatches(
            getElementText(row.querySelector(".item-text-label")), route[index]));
        if (matches.length === 1) break;
        await sleep(100);
      }
      if (matches.length !== 1) return fail("Phoenix 未找到唯一地区/常量选项，未提交部分选择");
      const row = matches[0];
      if (index < route.length - 1) {
        row.querySelector(".item-text-label").click();
      } else {
        const icon = row.querySelector(".icon-container");
        if (!icon) return fail("Phoenix 选项缺少选择图标");
        if (!icon.querySelector(".RadioChecked")) icon.click();
      }
      await sleep(180);
    }
    const confirm = getPhoenixFooterButton(popup, "确定");
    if (!confirm) return fail("Phoenix 缺少弹层确认按钮");
    confirm.click();
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await sleep(100);
      const actual = getControlCurrentValue(element);
      if (choiceTextMatches(actual, value) || choiceTextMatches(actual, route[route.length - 1])) {
        return { ok: true };
      }
    }
    return fail("Phoenix 确认后未读到目标值");
  }

  async function tryFillCustomChoiceField(element, value, field) {
    const container = findChoiceFieldContainer(element);
    if (!container) {
      return { ok: false, reason: "no choice container found" };
    }

    const controlAdapter = getFieldControlAdapter(element);
    if (controlAdapter?.id === "phoenix-autocomplete") {
      const previous = getVisiblePhoenixSelector();
      if (previous) { closePhoenixSelector(previous); await sleep(120); }
    }
    container.scrollIntoView({ block: "center", inline: "nearest" });
    clickActionElement(element instanceof Element ? element : container);
    // Phoenix's trigger is the managed input itself. Clicking the outer
    // wrapper immediately afterwards can toggle the popup closed, so leave it
    // open and search its portal-rendered options.
    if (container !== element && controlAdapter?.id !== "phoenix-autocomplete") {
      clickActionElement(container);
    }
    await sleep(220);

    if (controlAdapter?.id === "phoenix-autocomplete") {
      let popup = null;
      for (let attempt = 0; attempt < 10 && !popup; attempt += 1) {
        popup = getVisiblePhoenixSelector();
        if (!popup) await sleep(100);
      }
      if (popup?.querySelector(".selector-footer-button")) return tryFillPhoenixSelector(element, value, popup);
      if (popup) {
        const target = normalizeChoiceValue(value, inferFieldLabel(field));
        const options = Array.from(popup.querySelectorAll(".phoenix-selectList__listItem"))
          .filter((option) => isVisible(option) && choiceTextMatches(getElementText(option), target));
        if (options.length !== 1) { closePhoenixSelector(popup); return { ok: false, reason: "Phoenix 普通下拉未找到唯一选项" }; }
        options[0].click();
        for (let attempt = 0; attempt < 8; attempt += 1) {
          await sleep(100);
          if (choiceTextMatches(getControlCurrentValue(element), target)) return { ok: true };
        }
        closePhoenixSelector(popup);
        return { ok: false, reason: "Phoenix 普通下拉点击后未回填" };
      }
      return { ok: false, reason: "Phoenix 未找到唯一活动弹层" };
    }

    const target = normalizeChoiceValue(value, inferFieldLabel(field));
    const confirmPhoenixSelection = async () => {
      if (controlAdapter?.id !== "phoenix-autocomplete") {
        return true;
      }
      for (let attempt = 0; attempt < 8; attempt += 1) {
        if (choiceTextMatches(getControlCurrentValue(element), target)) {
          return true;
        }
        await sleep(60);
      }
      return false;
    };
    const hierarchicalResult = await tryFillHierarchicalChoiceOptions(value, target, element);
    if (hierarchicalResult.ok) {
      return await confirmPhoenixSelection()
        ? hierarchicalResult : { ok: false, reason: "Phoenix 地区选择未回填" };
    }

    const options = findVisibleChoiceOptions(container, element);
    const matched = options.find((option) => choiceTextMatches(getElementText(option), target) || choiceTextMatches(option.getAttribute("aria-label") || "", target));

    if (matched) {
      clickActionElement(matched);
      await sleep(120);
      return await confirmPhoenixSelection()
        ? { ok: true }
        : { ok: false, reason: "Phoenix 下拉选项点击后未确认选中值" };
    }

    const searchInput =
      element instanceof HTMLInputElement
        ? element
        : container.querySelector?.('input:not([type="hidden"]),textarea,[contenteditable="true"]');
    if (searchInput && controlAdapter?.id !== "phoenix-autocomplete") {
      setNativeValue(searchInput, value);
      await sleep(160);
      const retryOptions = findVisibleChoiceOptions(container, element);
      const retryMatched = retryOptions.find((option) => choiceTextMatches(getElementText(option), target) || choiceTextMatches(option.getAttribute("aria-label") || "", target));
      if (retryMatched) {
        clickActionElement(retryMatched);
        await sleep(120);
        return await confirmPhoenixSelection()
          ? { ok: true }
          : { ok: false, reason: "Phoenix 下拉选项点击后未确认选中值" };
      }
    }

    return { ok: false, reason: "no matching option found" };
  }

  async function tryFillHierarchicalChoiceOptions(value, target, element = null) {
    const parts = splitHierarchicalChoiceValue(value);
    if (parts.length < 2) {
      return { ok: false, reason: "not hierarchical" };
    }

    let matchedAny = false;
    for (const part of parts) {
      const options = findVisibleChoiceOptions(document, element);
      const matched = options.find((option) => {
        const text = getElementText(option);
        return choiceTextMatches(text, part) || choiceTextMatches(text, target);
      });
      if (!matched) {
        return matchedAny ? { ok: true, warning: "hierarchical choice partially matched" } : { ok: false, reason: "no matching hierarchical option" };
      }

      clickActionElement(matched);
      matchedAny = true;
      await sleep(180);
    }

    return { ok: matchedAny };
  }

  function splitHierarchicalChoiceValue(value) {
    const text = normalizeText(value, 120);
    if (!/(省|自治区|北京市|上海市|天津市|重庆市|市|区|县)/.test(text)) {
      return [];
    }

    const parts = text.match(/[^省市区县]+(?:省|市|区|县)|[^自治区]+自治区/g) || [];
    const normalized = parts.map((part) => normalizeText(part, 40)).filter(Boolean);
    return normalized.length >= 2 ? normalized : [];
  }

  function findChoiceFieldContainer(element) {
    const choiceContainer = getControlAdapterChoiceContainer(element);
    if (choiceContainer) {
      return choiceContainer;
    }

    const controlContainer = getControlAdapterContainer(element);
    if (controlContainer) {
      return controlContainer;
    }

    const adapterSelectors = getAdapterSelectors();
    if (adapterSelectors.containerSelector) {
      const container = element.closest(adapterSelectors.containerSelector);
      if (container) {
        return container;
      }
    }

    let current = element;
    for (let depth = 0; current && depth < 5; depth += 1, current = current.parentElement) {
      if (
        current.matches?.("[role='combobox'],[role='listbox'],[role='radio'],[role='checkbox'],[class*='select'],[class*='picker'],[class*='dropdown'],label") ||
        /select|picker|dropdown|combobox|radio|checkbox|ant-select|el-select|rc-select|cascader|picker/i.test(String(current.className || ""))
      ) {
        return current;
      }
    }
    return element.parentElement || element;
  }

  function findVisibleChoiceOptions(container, element = null) {
    const adapter = getFieldControlAdapter(element || container);
    const selectors = [
      '[role="option"]',
      "[aria-selected]",
      "li",
      ".ant-select-item-option",
      ".rc-select-item-option",
      ".ant-cascader-menu-item",
      ".ant-picker-cell",
      '[class*="option"]',
      '[class*="Option"]',
      '[class*="select-item"]',
      '[class*="dropdown-item"]',
      ...getControlAdapterOptionSelectors(element || container)
    ].join(",");
    const roots = [container && container.querySelectorAll ? container : null, document].filter(Boolean);
    const surface = element ? getControlSurfaceElement(element) : null;
    const seen = new Set();
    const options = [];

    for (const scope of roots) {
      for (const option of Array.from(scope.querySelectorAll(selectors))) {
        if (!(option instanceof Element) || seen.has(option)) {
          continue;
        }
        seen.add(option);
        if (option.closest(`#${PANEL_ID}`)) {
          continue;
        }
        if (adapter?.id === "layui" && scope === document) {
          const optionProxy = option.closest(".layui-form-select");
          if (surface && optionProxy && optionProxy !== surface && !optionProxy.classList.contains("layui-form-selected")) {
            continue;
          }
        }
        if (!isVisible(option)) {
          continue;
        }
        const text = getElementText(option);
        if (text && text.length <= 120) {
          options.push(option);
        }
      }
    }

    return options;
  }

  function renderQuickCopyList(panel) {
    const list = panel.querySelector('[data-role="quick-copy-list"]');
    if (!list) {
      return;
    }

    list.textContent = "";

    if (!hasCurrentProfileData()) {
      const empty = document.createElement("div");
      empty.className = "arf-empty";
      empty.textContent = currentProfileLoadPromise
        ? "正在读取本机简历资料..."
        : "点击“设置”后先保存简历资料，这里会显示可参考和复制的内容。";
      list.append(empty);
      return;
    }

    const filterText = compactText(sidebarFilter);
    const allSections = getCurrentProfileSections();
    const sections = allSections
      .map((group) => ({
        ...group,
        items: filterText
          ? group.items.filter((item) => {
              return compactText(`${group.category} ${item.subsection || ""} ${item.label} ${item.value}`).includes(filterText);
            })
          : group.items
      }))
      .filter((group) => group.items.length > 0);

    if (sections.length === 0) {
      const empty = document.createElement("div");
      empty.className = "arf-empty";
      empty.textContent = sidebarFilter ? "没有匹配的资料项。" : "资料里还没有可展示的字段内容。";
      list.append(empty);
      return;
    }

    const activeSection = !filterText
      ? sections.find((section) => section.category === activeProfileCategory)
      : null;

    if (activeSection) {
      renderProfileReferenceDetail(list, activeSection);
      return;
    }

    if (filterText) {
      renderProfileReferenceSearchResults(list, sections);
      return;
    }

    renderProfileReferenceOverview(list, sections);
  }

  function renderProfileReferenceOverview(root, sections) {
    const overview = document.createElement("div");
    overview.className = "arf-overview";

    for (const section of sections) {
      const displayTitle = getProfileSectionTitle(section);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "arf-category-card";
      button.dataset.category = section.category;

      const main = document.createElement("div");
      const title = document.createElement("div");
      title.className = "arf-category-title";
      title.textContent = displayTitle;
      const note = document.createElement("div");
      note.className = "arf-category-note";
      note.textContent = summarizeProfileSection(section);
      main.append(title, note);

      const count = document.createElement("div");
      count.className = "arf-category-count";
      count.textContent = String(section.items.length);

      button.append(main, count);
      button.addEventListener("click", () => {
        activeProfileCategory = section.category;
        renderAndSaveProfilePanel();
      });
      overview.append(button);
    }

    root.append(overview);
  }

  function renderProfileReferenceSearchResults(root, sections) {
    const head = document.createElement("div");
    head.className = "arf-detail-head";
    const title = document.createElement("div");
    title.className = "arf-detail-title";
    const total = sections.reduce((sum, section) => sum + section.items.length, 0);
    title.textContent = `搜索结果 ${total} 条`;
    head.append(title);
    root.append(head);

    for (const section of sections) {
      renderProfileReferenceRows(root, section, { compactTitle: true });
    }
  }

  function renderProfileReferenceDetail(root, section) {
    const head = document.createElement("div");
    head.className = "arf-detail-head";

    const back = document.createElement("button");
    back.type = "button";
    back.className = "arf-back";
    back.textContent = "返回";
    back.addEventListener("click", () => {
      activeProfileCategory = "";
      renderAndSaveProfilePanel();
    });

    const title = document.createElement("div");
    title.className = "arf-detail-title";
    title.textContent = `${getProfileSectionTitle(section) || section.category} · ${section.items.length} 条`;
    head.append(back, title);
    root.append(head);

    renderProfileReferenceRows(root, section);
  }

  function cloneProfileV2(profileV2) {
    if (!profileV2 || typeof profileV2 !== "object") {
      throw new Error("本机资料尚未加载完成。");
    }

    if (typeof structuredClone === "function") {
      return structuredClone(profileV2);
    }

    return JSON.parse(JSON.stringify(profileV2));
  }

  function updateProfileV2ItemValue(profileV2, item, nextValue) {
    const valuePath = item?.valuePath;
    if (!valuePath?.sectionKey) {
      throw new Error("当前条目缺少可保存路径，请到设置页修改。");
    }

    const section = Number.isInteger(valuePath.customSectionIndex)
      ? profileV2.customSections?.[valuePath.customSectionIndex]
      : profileV2.sections?.[valuePath.sectionKey];
    if (!section) {
      throw new Error("找不到当前资料分类，请先刷新资料。");
    }

    const scope = Number.isInteger(valuePath.itemIndex)
      ? section.items?.[valuePath.itemIndex]
      : section;
    if (!scope) {
      throw new Error("找不到当前资料条目，请先刷新资料。");
    }

    const value = String(nextValue == null ? "" : nextValue).trim();
    if (valuePath.kind === "custom") {
      const rows = Array.isArray(scope.custom) ? scope.custom : [];
      const row = rows[valuePath.customIndex];
      if (!row) {
        throw new Error("找不到自定义资料条目，请先刷新资料。");
      }
      if (value) {
        row.value = value;
      } else {
        rows.splice(valuePath.customIndex, 1);
      }
    } else {
      const values = scope.values && typeof scope.values === "object" ? scope.values : {};
      if (value) {
        values[valuePath.label] = value;
      } else {
        delete values[valuePath.label];
      }
      scope.values = values;
    }

    profileV2.updatedAt = new Date().toISOString();
    return profileV2;
  }

  async function copyProfileItem(item) {
    if (!item?.hasValue) {
      setProfilePanelStatus("当前条目没有可复制的内容。", true);
      return;
    }

    try {
      await copyTextToClipboard(item.value);
      setProfilePanelStatus(`已复制：${item.label}`);
    } catch (error) {
      setProfilePanelStatus(`复制失败：${error.message}`, true);
    }
  }

  function beginProfileItemEdit(row, item) {
    if (!row || row.dataset.editing === "true") {
      return;
    }

    const value = row.querySelector(".arf-row-value");
    const actions = row.querySelector(".arf-row-actions");
    if (!value || !actions) {
      return;
    }

    row.dataset.editing = "true";
    value.textContent = "";
    value.classList.add("is-editing");

    const editor = item.value.includes("\n") || item.value.length > 96
      ? document.createElement("textarea")
      : document.createElement("input");
    editor.className = "arf-row-editor";
    editor.value = item.value;
    editor.setAttribute("aria-label", `编辑${item.label}`);
    if (editor instanceof HTMLTextAreaElement) {
      editor.rows = 4;
    }
    value.append(editor);

    actions.textContent = "";
    const save = document.createElement("button");
    save.type = "button";
    save.className = "arf-row-action is-primary";
    save.textContent = "保存";
    save.title = `保存${item.label}`;
    save.addEventListener("click", () => {
      void saveProfileItemEdit(row, item, editor);
    });

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "arf-row-action";
    cancel.textContent = "取消";
    cancel.title = `取消编辑${item.label}`;
    cancel.addEventListener("click", () => {
      renderProfilePanel();
    });
    actions.append(save, cancel);

    editor.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        renderProfilePanel();
        return;
      }
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        void saveProfileItemEdit(row, item, editor);
      }
    });

    editor.focus();
    if (typeof editor.select === "function") {
      editor.select();
    }
  }

  async function saveProfileItemEdit(row, item, editor) {
    if (!row || row.dataset.saving === "true") {
      return;
    }

    row.dataset.saving = "true";
    const buttons = row.querySelectorAll("button");
    buttons.forEach((button) => {
      button.disabled = true;
    });

    try {
      const nextProfile = updateProfileV2ItemValue(cloneProfileV2(currentProfileV2), item, editor.value);
      await sendRuntimeMessage({
        type: "OJAF_SAVE_SETTINGS",
        payload: { profileV2: nextProfile, profileSaveSource: "inline-edit" }
      });
      currentProfileV2 = nextProfile;
      renderAndSaveProfilePanel(`已保存：${item.label}`);
    } catch (error) {
      row.dataset.saving = "false";
      buttons.forEach((button) => {
        button.disabled = false;
      });
      setProfilePanelStatus(`保存失败：${error.message}`, true);
    }
  }

  function renderProfileReferenceRows(root, section, options = {}) {
    const groups = groupItemsBySubsection(section.items);
    for (const group of groups) {
      const card = document.createElement("div");
      card.className = "arf-detail-card arf-readable";

      const subtitle = document.createElement("div");
      subtitle.className = "arf-subsection-title";
      subtitle.textContent = group.subsection || (options.compactTitle ? getProfileSectionTitle(section) || section.category : "详情");
      card.append(subtitle);

      for (const item of group.items) {
        const row = document.createElement("div");
        row.className = "arf-row";

        const label = document.createElement("div");
        label.className = "arf-row-label";
        label.textContent = item.label;

        const value = document.createElement("div");
        value.className = `arf-row-value${item.hasValue ? "" : " is-empty"}`;
        value.textContent = item.hasValue ? item.value : "未填写";

        const valueMain = document.createElement("div");
        valueMain.className = "arf-row-main";
        valueMain.append(value);

        const actions = document.createElement("div");
        actions.className = "arf-row-actions";

        const copyButton = document.createElement("button");
        copyButton.type = "button";
        copyButton.className = "arf-row-action";
        copyButton.dataset.action = "copy-item";
        copyButton.textContent = "复制";
        copyButton.title = `一键复制${item.label}`;
        copyButton.setAttribute("aria-label", `一键复制${item.label}`);
        copyButton.addEventListener("click", () => {
          void copyProfileItem(item);
        });

        const editButton = document.createElement("button");
        editButton.type = "button";
        editButton.className = "arf-row-action";
        editButton.dataset.action = "edit-item";
        editButton.textContent = "编辑";
        editButton.title = `直接编辑${item.label}`;
        editButton.setAttribute("aria-label", `直接编辑${item.label}`);
        editButton.addEventListener("click", () => {
          beginProfileItemEdit(row, item);
        });

        actions.append(copyButton, editButton);
        row.append(label, valueMain, actions);
        card.append(row);
      }

      root.append(card);
    }
  }

  function groupItemsBySubsection(items) {
    const groups = [];
    for (const item of items) {
      const subsection = item.subsection || "";
      let group = groups.find((entry) => entry.subsection === subsection);
      if (!group) {
        group = { subsection, items: [] };
        groups.push(group);
      }
      group.items.push(item);
    }
    return groups;
  }

  function summarizeProfileSection(section) {
    const filled = section.items.filter((item) => item.hasValue);
    const source = filled.length > 0 ? filled : section.items;
    const labels = source.slice(0, 5).map((item) => item.label).join("、");
    if (!labels) {
      return "点开查看资料";
    }
    return labels;
  }

  async function copyActiveCategory() {
    const section = getCurrentProfileSections().find((item) => item.category === activeProfileCategory);
    if (!section) {
      setProfilePanelStatus("先点进一个分类，再复制本类内容。", true);
      return;
    }

    try {
      await copyTextToClipboard(formatProfileSectionForCopy(section));
      setProfilePanelStatus(`已复制：${getProfileSectionTitle(section) || section.category}`);
    } catch (error) {
      setProfilePanelStatus(`复制失败：${error.message}`, true);
    }
  }

  function formatProfileSectionForCopy(section) {
    const title = getProfileSectionTitle(section) || section.category;
    const lines = [`## ${title}`];
    for (const group of groupItemsBySubsection(section.items)) {
      if (group.subsection) {
        lines.push("", `### ${group.subsection}`);
      }
      for (const item of group.items) {
        lines.push(`- ${item.label}：${item.value || ""}`);
      }
    }
    return `${lines.join("\n").trim()}\n`;
  }

  function renderProfilePanel() {
    const panel = ensureProfilePanel();
    const status = panel.querySelector('[data-role="status"]');
    const collapseBtn = panel.querySelector('[data-action="collapse"]');
    const homeBtn = panel.querySelector('[data-action="home"]');
    const copyCategoryBtn = panel.querySelector('[data-action="copy-category"]');
    const searchInput = panel.querySelector('[data-role="quick-copy-search"]');
    const progress = panel.querySelector('[data-role="progress"]');
    const progressFill = panel.querySelector('[data-role="progress-fill"]');
    const progressStage = panel.querySelector('[data-role="progress-stage"]');
    const progressDetail = panel.querySelector('[data-role="progress-detail"]');
    const sections = getCurrentProfileSections();
    const activeSection = sections.find((section) => section.category === activeProfileCategory);
    const inProgress = Boolean(autofillInProgress || autofillProgress.active);
    if (activeProfileCategory && !activeSection) {
      activeProfileCategory = "";
    }
    panel.setAttribute(PANEL_COLLAPSED_ATTR, profilePanelCollapsed ? "true" : "false");
    if (collapseBtn) {
      collapseBtn.textContent = profilePanelCollapsed ? "资料" : "收起";
      collapseBtn.title = profilePanelCollapsed ? "展开 OpenJobAutofill 资料面板" : "收起 OpenJobAutofill 资料面板";
    }
    if (copyCategoryBtn) {
      copyCategoryBtn.disabled = !activeSection;
    }
    if (homeBtn) {
      homeBtn.disabled = false;
    }
    if (searchInput && searchInput.value !== sidebarFilter) {
      searchInput.value = sidebarFilter;
    }
    if (progress && progressFill && progressStage && progressDetail) {
      progress.hidden = !autofillProgress.active;
      progressFill.style.width = `${getDisplayedProgressPercent()}%`;
      progressStage.textContent = autofillProgress.active
        ? getAutofillProgressTitle() || "处理中"
        : "";
      progressDetail.textContent = autofillProgress.active ? getAutofillProgressDetail() : "";
    }
    if (status) {
      status.style.color = "var(--arf-muted)";
      const totalItems = sections.reduce((sum, group) => sum + group.items.length, 0);
      const adapter = getActiveSiteAdapter();
      const adapterLabel = adapter ? `${adapter.name || adapter.id || "通用"} · ` : "";
      if (autofillProgress.active) {
        status.textContent = `${adapterLabel}${getAutofillProgressDetail() || getAutofillProgressTitle() || autofillProgress.stage || "正在处理"}`;
      } else {
        status.textContent = activeSection
          ? `${adapterLabel}正在查看：${getProfileSectionTitle(activeSection) || activeSection.category}。内容可直接选中复制。`
          : totalItems > 0
            ? `${adapterLabel}已加载 ${sections.length} 个分类、${totalItems} 条本地资料。`
            : `${adapterLabel}资料只从本机读取。`;
      }
    }

    renderQuickCopyList(panel);
    if (!currentProfileV2 && !currentProfileLoadPromise) {
      void refreshCurrentProfile();
    }
  }

  async function copyTextToClipboard(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.documentElement.appendChild(textarea);
    textarea.select();
    const success = document.execCommand("copy");
    textarea.remove();
    if (!success) {
      throw new Error("Clipboard unavailable.");
    }
  }

  if (chrome?.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local" || !changes.profileV2) {
        return;
      }

      currentProfileV2 = changes.profileV2.newValue || null;
      if (profilePanelVisible) {
        renderProfilePanel();
      }
    });
  }

  void restoreProfilePanelState();

  function setNativeValue(element, value) {
    const stringValue = value == null ? "" : String(value);
    const prototype =
      element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : element instanceof HTMLSelectElement
          ? HTMLSelectElement.prototype
          : element instanceof HTMLInputElement
            ? HTMLInputElement.prototype
            : null;

    const descriptor = prototype ? Object.getOwnPropertyDescriptor(prototype, "value") : null;
    if (descriptor && descriptor.set) {
      descriptor.set.call(element, stringValue);
    } else {
      element.value = stringValue;
    }

    if (element.setAttribute && element instanceof HTMLInputElement) {
      element.setAttribute("value", stringValue);
    }
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  function setCheckboxOrRadio(element, value) {
    if (element instanceof HTMLInputElement && element.type === "radio") {
      const target = normalizeChoiceValue(value, getChoiceLabelText(element));
      const group = element.name ? Array.from(document.querySelectorAll(`input[type="radio"][name="${CSS.escape(element.name)}"]`)) : [element];
      const matched = group.find((radio) => choiceTextMatches(getChoiceLabelText(radio), target) || choiceTextMatches(radio.value || "", target));
      if (matched) {
        matched.click();
        matched.dispatchEvent(new Event("change", { bubbles: true }));
      }
      return;
    }

    const normalized = String(value).trim().toLowerCase();
    const shouldCheck = ["true", "yes", "是", "1", "checked", "on"].includes(normalized);
    element.checked = shouldCheck;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function setSelectValue(element, value) {
    const stringValue = String(value || "").trim();
    const normalizedTarget = normalizeChoiceLabel(stringValue);
    const matchedOption = Array.from(element.options).find((option) => {
      const optionValue = normalizeText(option.value || "", 120);
      const optionLabel = normalizeText(option.textContent || "", 120);
      return (
        option.value === stringValue ||
        optionLabel === stringValue ||
        normalizeChoiceLabel(optionValue) === normalizedTarget ||
        normalizeChoiceLabel(optionLabel) === normalizedTarget ||
        optionLabel.includes(stringValue) ||
        stringValue.includes(optionLabel)
      );
    });

    if (matchedOption) {
      setNativeValue(element, matchedOption.value);
      return true;
    }

    setNativeValue(element, stringValue);
    return false;
  }

  function setContentEditableValue(element, value) {
    element.focus();
    element.textContent = value == null ? "" : String(value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  function findElementByCssPath(cssPath) {
    if (!cssPath) {
      return null;
    }

    try {
      const element = document.querySelector(cssPath);
      return element && isControlVisible(element) ? getLogicalControlElement(element) : null;
    } catch {
      return null;
    }
  }

  function scoreControlForField(element, field) {
    if (!field || !element) {
      return 0;
    }

    const nearbyText = getNearbyText(element);
    const sectionText = getSectionText(element);
    const currentValue = normalizeText(element.value || element.textContent || "", 180);
    let score = 0;

    score += textMatchScore(nearbyText, field.label) * 4;
    score += textMatchScore(nearbyText, field.nearbyText) * 2;
    score += textMatchScore(sectionText, field.section) * 2;
    score += textMatchScore(element.getAttribute("placeholder"), field.placeholder) * 3;
    score += textMatchScore(element.getAttribute("name"), field.name) * 3;
    score += textMatchScore(element.getAttribute("id"), field.id) * 3;
    score += textMatchScore(currentValue, field.value) * 2;

    if (field.type && getControlType(element) === field.type) {
      score += 2;
    }

    return score;
  }

  function findControlByMetadata(field) {
    const controls = collectVisibleControls();
    let best = null;
    let bestScore = 0;

    for (const element of controls) {
      const score = scoreControlForField(element, field);
      if (score > bestScore) {
        best = element;
        bestScore = score;
      }
    }

    return bestScore >= 8 ? best : null;
  }

  function findFieldElement(field) {
    if (!field) {
      return null;
    }

    if (field.fieldId) {
      const direct = document.querySelector(`[${FIELD_ATTR}="${CSS.escape(field.fieldId)}"]`);
      if (direct && isControlVisible(direct)) {
        return getLogicalControlElement(direct);
      }
    }

    const cssPathMatch = findElementByCssPath(field.cssPath);
    if (cssPathMatch && cssPathMatch.matches(CONTROL_SELECTOR)) {
      return cssPathMatch;
    }

    return findControlByMetadata(field);
  }

  function scoreRootForField(root, field) {
    const text = getTextWithoutControls(root);
    let score = 0;

    score += textMatchScore(text, field?.label) * 4;
    score += textMatchScore(text, field?.nearbyText) * 2;
    score += textMatchScore(text, field?.section) * 3;
    score += textMatchScore(text, field?.placeholder) * 2;
    score += textMatchScore(text, field?.value) * 1;

    if (looksLikeEditableSummary(text)) {
      score += 2;
    }

    return score;
  }

  function findEditButtonForField(field) {
    const buttons = Array.from(
      document.querySelectorAll('button,[role="button"],input[type="button"],input[type="submit"]')
    ).filter((button) => isActionControl(button, getAdapterActionLabels("edit")));

    let best = null;
    let bestScore = 0;

    for (const button of buttons) {
      const root = findActionRoot(button);
      if (!root) {
        continue;
      }

      const score = scoreRootForField(root, field);
      if (score > bestScore) {
        best = button;
        bestScore = score;
      }
    }

    return bestScore >= 8 ? best : null;
  }

  async function openEditScopeForField(field) {
    const button = findEditButtonForField(field);
    if (!button) {
      return false;
    }

    button.setAttribute(EDIT_ATTEMPT_ATTR, "true");
    clickActionElement(button);
    await sleep(180);
    return true;
  }

  function fieldNeedsEditMode(element) {
    if (!element) {
      return true;
    }

    return Boolean(element.disabled || element.readOnly || element.getAttribute("aria-readonly") === "true");
  }

  async function resolveFieldElement(field) {
    let element = findFieldElement(field);

    if (!element || fieldNeedsEditMode(element)) {
      const opened = await openEditScopeForField(field);
      if (opened) {
        element = findFieldElement(field);
      }
    }

    return element;
  }

  async function handleContentMessage(message) {
    if (message.type === "OJAF_SHOW_PROFILE_PANEL") {
      showProfilePanel();
      renderProfilePanel();
      return { visible: true };
    }

    if (message.type === "OJAF_START_AUTOFILL") {
      return runOneClickAutofill();
    }

    if (message.type === "OJAF_GET_RUNTIME_STATE") {
      return getAutofillRuntimeState();
    }

    if (message.type === "OJAF_GET_DEBUG_SNAPSHOT") {
      return getAutofillDebugSnapshotForExport();
    }

    if (message.type === "OJAF_CLEAR_MARKS") {
      clearMarks();
      return {};
    }

    return undefined;
  }

  const messageHandler = (message, _sender, sendResponse) => {
    if (!message || typeof message.type !== "string" || !message.type.startsWith("OJAF_")) {
      return undefined;
    }

    handleContentMessage(message)
      .then((data) => {
        if (data === undefined) {
          sendResponse({ ok: false, error: `Unknown message type: ${message.type}` });
          return;
        }
        sendResponse({ ok: true, data });
      })
      .catch((error) => {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
      });

    return true;
  };

  if (window.__OJAF_AUTOFILL_MESSAGE_HANDLER__) {
    chrome.runtime.onMessage.removeListener(window.__OJAF_AUTOFILL_MESSAGE_HANDLER__);
  }
  window.__OJAF_AUTOFILL_MESSAGE_HANDLER__ = messageHandler;
  chrome.runtime.onMessage.addListener(messageHandler);
})();
