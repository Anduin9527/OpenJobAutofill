import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../src/content.js', import.meta.url), 'utf8');
const code = source.slice(source.indexOf('  function getVisiblePhoenixSelector()'), source.indexOf('  async function tryFillCustomChoiceField('));
let actual, selected, level, actions, reject, missing;
const node = (innerText, click = () => {}) => ({innerText, click});
const popup = {
  querySelectorAll(selector) {
    if (selector.includes('button-container')) return [node('取消', () => actions.push('cancel')), node('确定', () => {actions.push('confirm'); if (!reject) actual = selected;})];
    if (missing && level === 1) return [];
    const label = level === 0 ? '示例省' : '测试市';
    return [{querySelector(s) {
      if (s === '.item-text-label') return node(label, () => {actions.push('navigate'); level++;});
      if (s === '.icon-container') return {querySelector: () => null, click() {actions.push('select'); selected = label;}};
    }}];
  }
};
const context = vm.createContext({
  document: {querySelectorAll: () => []}, isVisible: () => true,
  choiceTextMatches: (a,b) => a === b,
  getElementText: n => n?.innerText || '',
  splitHierarchicalChoiceValue: value => value === '示例省测试市' ? ['示例省', '测试市'] : [],
  clickActionElement: n => n?.click(), sleep: async () => {}, getControlCurrentValue: () => actual
});
vm.runInContext(code + ';this.fill = tryFillPhoenixSelector;', context);
function reset() {actual = ''; selected = ''; level = 0; actions = []; reject = false; missing = false;}
reset();
assert.equal((await context.fill({}, '示例省测试市', popup)).ok, true);
assert.deepEqual(actions, ['navigate', 'select', 'confirm']);
assert.equal(actual, '测试市');
reset(); missing = true;
assert.equal((await context.fill({}, '示例省测试市', popup)).ok, false);
assert.deepEqual(actions, ['navigate', 'cancel']);
reset(); reject = true;
assert.equal((await context.fill({}, '示例省测试市', popup)).ok, false);
assert.ok(actions.includes('confirm'));
reset();
assert.equal((await context.fill({}, '示例省', popup)).ok, true);
assert.deepEqual(actions, ['select', 'confirm']);
// Offscreen retained portals must not win against the active popup.
const layer = right => ({getBoundingClientRect: () => ({right, bottom: right}), querySelector: () => ({})});
const hidden = layer(-9000), visible = layer(600);
context.document.querySelectorAll = () => [hidden, visible];
assert.equal(vm.runInContext('getVisiblePhoenixSelector()', context), visible);
context.document.querySelectorAll = () => [visible, layer(700)];
assert.equal(vm.runInContext('getVisiblePhoenixSelector()', context), null);
console.log('Phoenix selector: navigation, icon selection, confirmation, rejected commit, missing leaf, hidden/ambiguous portals passed');
// Exercise routing through the public choice helper, not just the modal helper.
vm.runInContext(source.slice(source.indexOf('  async function tryFillCustomChoiceField('), source.indexOf('  async function tryFillHierarchicalChoiceOptions(')) + ';this.fillChoice = tryFillCustomChoiceField;', context);
class Trigger {scrollIntoView() {} click() {}}
const trigger = new Trigger();
Object.assign(context, {Element: Trigger, findChoiceFieldContainer: () => trigger,
  getFieldControlAdapter: () => ({id: 'phoenix-autocomplete'}),
  normalizeChoiceValue: value => value, inferFieldLabel: () => '示例字段'});
const plain = {getBoundingClientRect: () => ({right: 500, bottom: 400}),
  querySelector: selector => selector.includes('phoenix-selectList') ? {} : null,
  querySelectorAll: () => [node('示例选项', () => {if (!reject) actual = '示例选项';})]};
reset(); context.document.querySelectorAll = () => [hidden, plain];
assert.equal((await context.fillChoice(trigger, '示例选项', {})).ok, true);
reset(); reject = true;
assert.equal((await context.fillChoice(trigger, '示例选项', {})).ok, false);
context.document.querySelectorAll = () => [];
assert.equal((await context.fillChoice(trigger, '示例选项', {})).ok, false);
console.log('Phoenix plain dropdown routing and committed-value verification passed');
// Real footer markup binds clicks to descendants; the layout wrapper is inert.
reset();
const nestedPopup = {
  querySelectorAll(selector) {
    const nodes = popup.querySelectorAll(selector);
    if (!selector.includes('button-container')) return nodes;
    return nodes.map(button => ({innerText:button.innerText, click(){throw new Error('inert wrapper clicked');}, querySelector:()=>button}));
  }
};
assert.equal((await context.fill({}, '示例省测试市', nestedPopup)).ok, true);
assert.deepEqual(actions, ['navigate','select','confirm']);
reset(); missing = true;
assert.equal((await context.fill({}, '示例省测试市', nestedPopup)).ok, false);
assert.deepEqual(actions, ['navigate','cancel']);
console.log('Nested footer confirm/cancel target regression passed');
