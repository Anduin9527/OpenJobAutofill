import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/content.js', import.meta.url), 'utf8');
function extract(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing production helper ${name}`);
  const brace = source.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') depth--;
    if (!depth) return source.slice(start, i + 1);
  }
  throw new Error(`unterminated helper ${name}`);
}
const ctx = {};
for (const name of ['normalizeText', 'compactText', 'normalizeMatchKey', 'normalizeFieldLabelText', 'normalizeChoiceLabel', 'choiceTextMatches']) {
  vm.runInNewContext(extract(name), ctx);
}
assert.equal(ctx.normalizeFieldLabelText('姓名*'), '姓名');
assert.equal(ctx.choiceTextMatches('CET-4', 'CET-6'), false);
assert.equal(ctx.choiceTextMatches('前10%', '前30%'), false);
assert.equal(ctx.choiceTextMatches('3.5', '35'), false);
assert.equal(ctx.choiceTextMatches('不接受', '接受'), false);
assert.equal(ctx.choiceTextMatches('非全日制', '全日制'), false);
assert.equal(ctx.choiceTextMatches('大学本科', '本科'), true);
assert.equal(ctx.choiceTextMatches('硕士研究生', '硕士'), true);
assert.equal(ctx.choiceTextMatches('大学英语六级', 'CET-6'), true);
assert.equal(ctx.choiceTextMatches('南京大学通达学院', '南京大学'), false);
const sandbox = {
  window: {}, chrome: { runtime: { onMessage: { addListener() {} } } },
  document: { querySelector: () => null },
  Element: class {}, HTMLInputElement: class {}, HTMLSelectElement: class {},
  location: { hostname: 'wecruit.hotjob.cn' }
};
vm.runInNewContext(source.replace(/\}\)\(\);\s*$/, `
  globalThis.api = { normalizeHotjobFieldLabel, normalizeHotjobSectionTitle,
    bindHotjobRecords, isRepeatOccurrenceCompatible, inferMatchSection,
    scoreAutofillCandidate, getRepeatItemOccurrenceInfo, disambiguateGroupedFieldLabel, hotjobValuesEquivalent,
    plan(fields, entries) {
      getCurrentProfileEntries = () => entries;
      return buildAutofillPlan({ fields });
    },
    selectAdapter() { currentSiteAdapter = { id: 'hotjob' }; }
  };
})();`), sandbox);
const api = sandbox.api;
for (const [label, expected] of [
  ['第一专业(专科以上必填）*', '专业名称'], ['企业名称', '单位名称'],
  ['项目职责', '本人职责'], ['工作描述', '工作内容'], ['GPA绩点*', 'GPA分数']
]) assert.equal(api.normalizeHotjobFieldLabel(label), expected);
assert.equal(api.normalizeHotjobSectionTitle('教育经历必填*必填信息集至少需要填写任意一项'), '教育经历');
assert.equal(api.inferMatchSection({ siteAdapterId: 'hotjob', section: '项目经历', nearbyText: '教育经历 学历 姓名' }), '项目经历');

// Sanitized fixture: a reordered subset, not a copy of the user's resume.
const entries = ['Project Alpha', 'Project Beta', 'Project Gamma'].flatMap((name, itemIndex) =>
  [['项目名称', name], ['本人职责', `Responsibilities ${itemIndex}`], ['项目描述', `Description ${itemIndex}`]].map(([label, value]) => ({
    label, value, hasValue: true, category: '项目经历', subsection: `项目经历 ${itemIndex + 1}`,
    itemId: `${itemIndex}-${label}`, aliases: [], valuePath: { sectionKey: 'projects', itemIndex }
  })));
function record(index, name) {
  return [['项目名称', name], ['本人职责', '']].map(([label, currentValue]) => ({
    siteAdapterId: 'hotjob', section: '项目经历', inferredCategory: '项目经历',
    inferredLabel: label, label, currentValue, hasCurrentValue: !!currentValue,
    repeatItemIndex: index, repeatItemTotal: 2, type: 'text', canFill: true,
    fieldId: `${index}-${label}`, options: []
  }));
}
const fields = [...record(1, 'Project Gamma'), ...record(2, 'Project Alpha')];
api.bindHotjobRecords(fields, entries);
assert.equal(fields[0].hotjobProfileIndex, 2, 'subset must bind by identity, not position');
assert.equal(fields[2].hotjobProfileIndex, 0);
assert.equal(api.isRepeatOccurrenceCompatible(fields[1], entries[1]), false);
assert.equal(api.isRepeatOccurrenceCompatible(fields[1], entries[7]), true);
assert.ok(api.scoreAutofillCandidate(fields[1], entries[7], '本人职责', '项目经历') >= 18);
assert.equal(api.scoreAutofillCandidate(fields[1], entries[1], '本人职责', '项目经历'), 0);
const unknown = record(1, 'Unknown project');
api.bindHotjobRecords(unknown, entries);
assert.equal(unknown[0].hotjobProfileIndex, -1, 'unknown identity must not fall back to ordinal');
const ambiguous = record(1, 'Project Alpha');
api.bindHotjobRecords(ambiguous, [...entries, { ...entries[0], valuePath: { sectionKey: 'projects', itemIndex: 4 } }]);
assert.equal(ambiguous[0].hotjobProfileIndex, -1, 'duplicate identity must fail closed');
const blank = record(1, '');
api.bindHotjobRecords(blank, entries);
assert.equal(blank[0].hotjobProfileIndex, -1, 'blank subset must not assume full profile order');

api.selectAdapter();
const section = { querySelectorAll: () => roots };
const roots = [0, 1].map(() => ({ closest: () => section }));
const element = { closest: (selector) => selector === '.form-cell' ? section : roots[1] };
assert.equal(api.getRepeatItemOccurrenceInfo(element).index, 2);
assert.equal(api.getRepeatItemOccurrenceInfo(element).total, 2);
const plan = api.plan(fields, entries);
assert.equal(plan.candidates.find(c => c.fieldId === '1-本人职责')?.value, 'Responsibilities 2');
assert.equal(plan.candidates.find(c => c.fieldId === '2-本人职责')?.value, 'Responsibilities 0');
assert.equal(plan.candidates.find(c => c.fieldId === '1-本人职责')?.shouldAutoFill, true);
assert.equal(api.plan(unknown, entries).candidates.length, 0);
assert.equal(api.hotjobValuesEquivalent('职责摘要', '职责摘要，完整细节', 'textarea', 'text'), false);
assert.equal(api.hotjobValuesEquivalent('x'.repeat(150) + 'A', 'x'.repeat(150) + 'B', 'textarea', 'text'), false);
assert.equal(api.hotjobValuesEquivalent('接受', '不接受', 'radio', 'choice'), false);

// Execute the real async writer against a simulated old Ant select. No network
// or user data: the only popup reachable is the surface's aria-controls target.
async function checkSelect({ initial = '', options = ['CET-4', 'CET-6'], commit = true } = {}) {
  let selected = initial;
  let expanded = false;
  let clicked = [];
  const search = { value: '' };
  const surface = {
    getAttribute: (name) => name === 'aria-controls' ? 'own-popup' : String(expanded),
    dispatchEvent: () => { expanded = false; }
  };
  const optionNodes = options.map(text => ({ text, getAttribute: () => null, classList: { contains: () => false } }));
  const root = { classList: { contains: () => false }, querySelector: selector =>
    selector === '[role="combobox"]' ? surface : selector.startsWith('input') ? search : { text: selected } };
  const element = { closest: () => root };
  const writer = vm.runInNewContext(`(async ${extract('tryFillHotjobSelect')})`, {
    getElementText: n => n?.text || '', choiceTextMatches: ctx.choiceTextMatches,
    sleep: async () => {}, isVisible: () => true, KeyboardEvent: class {},
    setNativeValue: (node, value) => { node.value = value; },
    document: { getElementById: id => {
      assert.equal(id, 'own-popup');
      return { querySelectorAll: () => optionNodes };
    } },
    clickActionElement: node => {
      if (node === surface) expanded = true;
      else { clicked.push(node.text); if (commit) { selected = node.text; expanded = false; } }
    }
  });
  const result = await writer(element, 'CET-6');
  assert.equal(search.value, '', 'temporary search query must be restored');
  assert.equal(expanded, false, 'popup must not be left open');
  return { result, clicked };
}
assert.equal((await checkSelect()).result.ok, true);
assert.deepEqual((await checkSelect()).clicked, ['CET-6']);
assert.equal((await checkSelect({ options: ['CET-4'] })).result.ok, false);
assert.equal((await checkSelect({ options: ['CET-6', 'CET-6'] })).result.ok, false);
assert.equal((await checkSelect({ commit: false })).result.ok, false);
assert.deepEqual((await checkSelect({ initial: 'CET-6' })).clicked, []);
console.log('HotJob matching smoke passed');
