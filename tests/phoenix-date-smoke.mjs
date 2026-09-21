import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../src/content.js', import.meta.url), 'utf8');
let mode = '', year = 2026, decade = 2020, committed = '', ignoreCommit = false, yearPanelReturnMode = 'month';
const text = (innerText, click = () => {}) => ({ innerText, click, parentElement: { className: '' } });
const checkbox = { checked: false, click() { this.checked = !this.checked; } };
const box = { querySelector(s) { return s === '.phoenix-checkbox__text' ? text('至今') : checkbox; } };
const col = { querySelector() { return box; } };
const surface = { classList: { contains: () => false }, click() { mode = 'month'; } };
const root = {
  closest(s) { return s.includes('.form-item--phoenix') ? root : s.includes('.fields-col') ? col : null; },
  querySelector(s) {
    if (s.includes('.form-item__text')) return text('结束时间');
    return ({ '.phoenix-select': surface, '.form-item__text': text('结束时间'),
      '.phoenix-select__tipEle': text(committed) })[s] || null;
  }
};
const monthPanel = { querySelectorAll(s) {
  if (s === '[role="button"]') return [text(String(year), () => {mode = 'year';})];
  return Array.from({length:12}, (_,i) => text(`${i+1}月`, () => {
    mode = ''; if (!ignoreCommit) committed = `${year}-${String(i+1).padStart(2,'0')}`;
  }));
}};
const yearPanel = {
  querySelectorAll() { return Array.from({length:12}, (_,i) => text(String(decade-1+i), () => { year=decade-1+i;mode=yearPanelReturnMode; })); },
  querySelector(s) { return text('', () => { decade += s.includes('prev') ? -10 : 10; }); }
};
const datePanel = {
  querySelector(s) {
    if (s === '.phoenix-calendar-year-select') return text(String(year), () => { yearPanelReturnMode = 'date'; mode = 'year'; });
    if (s === '.phoenix-calendar-month-select') return text('11月', () => { mode = 'month'; });
    return null;
  },
  querySelectorAll() { return []; }
};
class FakeElement {
  constructor(className = '', parentElement = null) {
    this.className = className;
    this.parentElement = parentElement;
    this.children = [];
    this.attributes = {};
    if (parentElement?.children) parentElement.children.push(this);
  }
  matches(selector) {
    return selector.split(',').some((part) => {
      const value = part.trim();
      if (value.startsWith('.')) return value.slice(1).split(/[ >:\[]/)[0] === this.className;
      return value === this.tagName?.toLowerCase() || (value.startsWith('input') && this.tagName === 'INPUT');
    });
  }
  closest(selector) {
    for (let current = this; current; current = current.parentElement) {
      if (selector.includes('.phoenix-date-picker') && current.className === 'phoenix-date-picker') return current;
      if (selector.includes('.phoenix-auto-complete-container') && current.className === 'phoenix-auto-complete-container') return current;
      if (selector.includes('.form-item--phoenix') && current.className === 'form-item--phoenix') return current;
      if (selector.includes('.form-item') && current.className === 'form-item') return current;
      if (selector.includes('.fields-col') && current.className === 'fields-col') return current;
    }
    return null;
  }
  querySelector(selector) {
    if (this.queryMap && Object.prototype.hasOwnProperty.call(this.queryMap, selector)) return this.queryMap[selector];
    if (selector.includes('input:not') && this.inputChild) return this.inputChild;
    if (selector.includes('.form-item__text') && this.labelChild) return this.labelChild;
    return this.children.find((child) => child.matches(selector)) || null;
  }
  querySelectorAll() { return []; }
  getAttribute(name) { return this.attributes[name] || null; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  focus() {}
  blur() {}
  dispatchEvent() { return true; }
}
class FakeInput extends FakeElement {
  constructor(parentElement, value = '') {
    super('', parentElement);
    this.tagName = 'INPUT';
    this.type = 'text';
    this.value = value;
    this.disabled = false;
  }
}
const sandbox = {
  window:{}, chrome:{runtime:{onMessage:{addListener(){}}}},
  location:{hostname:'nlscan.zhiye.com'}, Element:FakeElement, HTMLInputElement:FakeInput,
  HTMLSelectElement:class extends FakeElement {}, HTMLTextAreaElement:class extends FakeElement {},
  Event: class {}, KeyboardEvent: class {}, MouseEvent: class {},
  document:{ querySelector:()=>null, querySelectorAll(s) {
    if (s === '.phoenix-calendar-month-panel' && mode==='month') return [monthPanel];
    if (s === '.phoenix-calendar-year-panel' && mode==='year') return [yearPanel];
    if (s === '.phoenix-calendar-date-panel' && mode==='date') return [datePanel];
    return [];
  }}
};
vm.runInNewContext(source.replace(/\}\)\(\);\s*$/, `
  sleep = async () => {}; isVisible = () => true;
  globalThis.api = { fillPhoenixDate, readPhoenixDate, getPhoenixDateRoot, getPhoenixSection,
    getPhoenixAutocompleteRoot, getFieldControlAdapter, getControlType, getControlCurrentValue,
    bindHotjobRecords, isRepeatOccurrenceCompatible,
    plan(fields, entries) { getCurrentProfileEntries = () => entries; return buildAutofillPlan({fields}); }
  };
})();`), sandbox);
const api = sandbox.api;
assert.equal(api.getPhoenixDateRoot(root), root);
assert.equal((await api.fillPhoenixDate(root,'2025-09')).ok,true);
assert.equal(committed,'2025-09');
assert.equal((await api.fillPhoenixDate(root,'2010-03')).ok,true);
assert.equal(committed,'2010-03');
assert.equal((await api.fillPhoenixDate(root,'至今')).ok,true);
assert.equal(api.readPhoenixDate(root),'至今');
assert.equal((await api.fillPhoenixDate(root,'2026-08')).ok,true);
assert.equal(checkbox.checked,false);
assert.equal(committed,'2026-08');
ignoreCommit = true;
assert.equal((await api.fillPhoenixDate(root,'2026-07')).ok,false,'search text must not count as a committed selection');
assert.equal((await api.fillPhoenixDate(root,'待确认')).ok,false);

// Current Zhiye pages use Phoenix date/autocomplete containers instead of the
// older `.phoenix-select` shape. Both controls must expose a logical adapter
// and preserve their current value for scan/match diagnostics.
const modernForm = new FakeElement('form-item');
const modernDate = new FakeElement('phoenix-date-picker', modernForm);
const modernDateWrap = new FakeElement('phoenix-calendar-input-wrap', modernDate);
const modernDateInput = new FakeInput(modernDateWrap, '1990-01-02');
modernDate.queryMap = { '.phoenix-calendar-input-wrap': modernDateWrap, '.phoenix-calendar-input-wrap input': modernDateInput };
modernDate.inputChild = modernDateInput;
modernForm.labelChild = text('出生日期');
assert.equal(api.getPhoenixDateRoot(modernDateInput), modernDate);
assert.equal(api.getFieldControlAdapter(modernDateInput)?.id, 'phoenix-date');
assert.equal(api.getControlCurrentValue(modernDateInput), '1990-01-02');
modernDateWrap.click = () => { mode = 'date'; };
modernDateInput.value = '';
const modernDateResult = await api.fillPhoenixDate(modernDateInput, '1990-01-02');
assert.equal(modernDateResult.ok, true);
assert.equal(api.getControlCurrentValue(modernDateInput), '1990-01-02');

const modernAutoForm = new FakeElement('form-item');
const modernAuto = new FakeElement('phoenix-auto-complete-container', modernAutoForm);
const modernAutoInput = new FakeInput(modernAuto, '示例民族');
modernAuto.inputChild = modernAutoInput;
assert.equal(api.getPhoenixAutocompleteRoot(modernAutoInput), modernAuto);
assert.equal(api.getFieldControlAdapter(modernAutoInput)?.id, 'phoenix-autocomplete');
assert.equal(api.getControlType(modernAutoInput), 'combobox');
assert.equal(api.getControlCurrentValue(modernAutoInput), '示例民族');

// Legacy Phoenix choice fields share `.form-item--phoenix > .phoenix-select`
// with the old month picker. They must not be mistaken for dates; otherwise
// values such as a non-date choice are rejected as invalid YYYY-MM input.
const legacyChoiceForm = new FakeElement('form-item--phoenix');
const legacyChoiceSurface = new FakeElement('phoenix-select', legacyChoiceForm);
legacyChoiceForm.queryMap = {
  '.phoenix-select': legacyChoiceSurface,
  '.form-item__text': text('民族'),
  '.phoenix-select__tipEle': text('请选择')
};
const legacyChoiceInput = new FakeInput(legacyChoiceForm, '');
legacyChoiceForm.inputChild = legacyChoiceInput;
assert.equal(api.getPhoenixDateRoot(legacyChoiceInput), null);
assert.equal(api.getPhoenixAutocompleteRoot(legacyChoiceInput), legacyChoiceForm);
assert.equal(api.getFieldControlAdapter(legacyChoiceInput)?.id, 'phoenix-autocomplete');
assert.equal(api.getControlType(legacyChoiceInput), 'combobox');
legacyChoiceForm.innerText = '民族 请选择';
assert.equal(api.getControlCurrentValue(legacyChoiceInput), '', 'wrapper label is not a selected value');
legacyChoiceForm.queryMap['.phoenix-select__tipEle,.phoenix-select__value,.phoenix-select__text'] = text('请选择民族');
assert.equal(api.getControlCurrentValue(legacyChoiceInput), '', 'placeholder is not a selected value');
legacyChoiceForm.queryMap['.phoenix-select__tipEle,.phoenix-select__value,.phoenix-select__text'] = text('示例民族');
assert.equal(api.getControlCurrentValue(legacyChoiceInput), '示例民族');

// Zhiye internship cards have no heading; the card labels themselves must
// provide the section and record identity so project entries cannot win.
const internshipRoot = {
  closest(selector) { return selector === '.form[name]' ? internshipRoot : null; },
  querySelectorAll(selector) {
    return selector === '.form-item__text'
      ? ['单位名称', '职位名称', '开始时间', '结束时间', '实习内容'].map((value) => text(value))
      : [];
  }
};
assert.equal(api.getPhoenixSection(internshipRoot), '实习经历');
const studentRoot = {
  closest(selector) { return selector === '.form[name]' ? studentRoot : null; },
  querySelectorAll(selector) {
    return selector === '.form-item__text'
      ? ['开始时间', '结束时间', '学校组织/团体名称', '职务名称', '职责和成就'].map((value) => text(value))
      : [];
  }
};
assert.equal(api.getPhoenixSection(studentRoot), '社团工作');
const internshipEntries = [
  { label: '公司', value: '中国科学院软件研究所 & 华为开源中心', hasValue: true, category: '实习经历',
    subsection: '实习经历 中国科学院软件研究所 & 华为开源中心', valuePath: { sectionKey: 'internship', itemIndex: 0 } },
  { label: '职位', value: '软件开发实习生', hasValue: true, category: '实习经历',
    subsection: '实习经历 中国科学院软件研究所 & 华为开源中心', valuePath: { sectionKey: 'internship', itemIndex: 0 } }
];
const internshipFields = ['单位名称', '职位名称'].map((label, index) => ({
  label, inferredLabel: label, inferredCategory: '实习经历', siteAdapterId: 'zhiye',
  repeatItemIndex: 1, repeatItemTotal: 1, hasCurrentValue: true,
  currentValue: index === 0 ? '中国科学院软件研究所 & 华为开源中心' : '软件开发实习生',
  canFill: true, fieldId: `internship-${index}`
}));
api.bindHotjobRecords(internshipFields, internshipEntries);
assert.equal(internshipFields[0].hotjobProfileIndex, 0);
assert.equal(internshipFields[1].hotjobProfileIndex, 0);
const entries = ['Alpha','Beta'].flatMap((name,itemIndex)=>[['项目名称',name],['开始时间',`2026-0${itemIndex+1}`],['结束时间',itemIndex ? '至今' : '2026-08']].map(([label,value])=>({label,value,hasValue:true,category:'项目经历',subsection:`项目经历 ${itemIndex+1}`,valuePath:{sectionKey:'project',itemIndex}})));
const fields=['Beta','Alpha'].flatMap((name,index)=>['项目名称','开始时间','结束时间'].map(label=>({label,inferredLabel:label,inferredCategory:'项目经历',section:'项目经历',siteAdapterId:'zhiye',repeatItemIndex:index+1,repeatItemTotal:2,hasCurrentValue:label==='项目名称',currentValue:label==='项目名称'?name:'',canFill:true,type:'text',fieldId:`${index}-${label}`,options:[]})));
const plan=api.plan(fields,entries);
for (let index=0;index<2;index++) for (const label of ['开始时间','结束时间']) {
 const candidate=plan.candidates.find(c=>c.fieldId===`${index}-${label}`);
 assert.equal(candidate?.sourceSubsection,`项目经历 ${2-index}`);
}
console.log('phoenix-date-smoke: ok');

// Fewer empty page cards than stored projects (Hairobotics): fill the prefix.
const emptyFields = fields.slice(0, 3).map(f => ({ ...f, hasCurrentValue: false, currentValue: '', repeatItemTotal: 1 }));
const emptyPlan = api.plan(emptyFields, entries);
assert.equal(emptyPlan.candidates.length, 3);
for (const c of emptyPlan.candidates) assert.equal(c.sourceSubsection, '项目经历 1');
// An unnamed but partially populated card must not guess a project.
const partial = emptyFields.map(f => ({ ...f, hotjobProfileIndex: undefined,
  hasCurrentValue: f.label === '开始时间', currentValue: f.label === '开始时间' ? '2025-01' : '' }));
assert.equal(api.plan(partial, entries).candidates.length, 0);
const unknown = emptyFields.map(f => ({ ...f, hotjobProfileIndex: undefined,
  hasCurrentValue: f.label === '项目名称', currentValue: f.label === '项目名称' ? 'Unknown' : '' }));
assert.equal(api.plan(unknown, entries).candidates.length, 0);
console.log('zhiye-empty-project-prefix: ok');
const dated = emptyFields.map(f => ({ ...f, hotjobProfileIndex: undefined,
  hasCurrentValue: f.label === '开始时间', currentValue: f.label === '开始时间' ? '2026-02' : '' }));
for (const c of api.plan(dated, entries).candidates) assert.equal(c.sourceSubsection, '项目经历 2');
assert.equal(api.plan(dated, entries).candidates.length, 3);
const duplicateDates = entries.map(e => e.label === '开始时间' ? {...e, value: '2026-02'} : e);
assert.equal(api.plan(dated, duplicateDates).candidates.length, 0, 'ambiguous dates must not guess');
console.log('zhiye-date-identity: ok');
