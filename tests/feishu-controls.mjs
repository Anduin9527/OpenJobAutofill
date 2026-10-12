const fixture = document.querySelector('#fixture'), results = document.querySelector('#results');
const eq = (actual, expected, message = '') => { if (actual !== expected) throw Error(`${message}: expected ${expected}, got ${actual}`); };
let passed = 0, failed = 0, id = 0;
window.fixtureLocation = { hostname: 'duodian.jobs.feishu.cn', href: location.href };
window.fixtureChrome = { runtime: { onMessage: { addListener() {}, removeListener() {} }, getURL: p => '/' + p,
  sendMessage: (m, cb) => cb({ ok: true, data: {} }) }, storage: { onChanged: { addListener() {}, removeListener() {} } } };
const source = await (await fetch('/src/content.js')).text();
const script = document.createElement('script');
script.textContent = source.replace('(() => {', '(() => { const chrome=window.fixtureChrome; const location=window.fixtureLocation;')
  .replace(/\}\)\(\);\s*$/, `window.api={scanForm,buildFieldMeta,fillElementSmart,applyAutofillPlan,buildProfileItemAliases,
    reset:()=>{currentSiteAdapter=null;},plan:(scan,entries)=>{getCurrentProfileEntries=()=>entries;return buildAutofillPlan(scan);}};})();`);
document.head.append(script);
const api = window.api;
const test = async (name, run) => {
  fixture.replaceChildren(); api.reset();
  const li = document.createElement('li'); results.append(li);
  try { await run(); eq(window.__OJAF_FORM_RUNTIME__.stats().activeWaits, 0); eq(window.__OJAF_FORM_RUNTIME__.stats().observers, 0);
    passed++; li.className = 'pass'; li.textContent = '✓ ' + name;
  } catch (error) { failed++; li.className = 'fail'; li.textContent = '✗ ' + name + ' ' + error.message; console.error(error); }
  document.querySelector('#summary').textContent = `${passed} 通过，${failed} 失败`;
};
const row = (label, control) => `<div class="atsx-row atsx-form-item"><div class="atsx-form-item-label"><label>${label}</label></div><div class="atsx-form-item-control-wrapper"><div class="atsx-form-item-control"><span class="atsx-form-item-children">${control}</span></div></div></div>`;
const text = (label, value = '', textarea = false) => row(label, textarea ? `<textarea class="atsx-input">${value}</textarea>` : `<input class="atsx-input atsx-input-lg" value="${value}">`);
const select = label => row(label, `<div class="atsx-select"><div class="atsx-select-selection" role="combobox" tabindex="0" title="待处理: 待处理" data-ojaf-mark="uncertain"><span class="atsx-select-selection-selected-value"></span><input aria-label="filter select" value=""></div></div>`);
function section(title, cards, cls = '') {
  const node = document.createElement('div'); node.className = 'createFormSection-container';
  node.innerHTML = `<div class="${cls} createFormSection__fixture"><div class="createFormSection-left">${title}</div><div class="createFormSection-right">${cards.map(card => `<div class="createFormSection-formList">${card}</div>`).join('')}</div></div>`;
  fixture.append(node); return node;
}
const entry = (label, value, index = 0, category = '实习经历') => {
  const e = { label, value, hasValue: true, category, subsection: `${category} ${index + 1}`, itemId: `entry-${++id}`,
    valuePath: { sectionKey: category, itemIndex: index } };
  e.aliases = api.buildProfileItemAliases({ category }, e); return e;
};
function widget(root, values, delay = 0) {
  const display = root.querySelector('.atsx-select-selection-selected-value'), search = root.querySelector('input');
  const popup = document.createElement('div'); popup.className = 'atsx-select-dropdown'; popup.hidden = true;
  popup.innerHTML = values.map(v => `<div class="atsx-select-dropdown-menu-item" role="option">${v}</div>`).join('');
  document.body.append(popup);
  root.querySelector('[role=combobox]').onclick = () => setTimeout(() => { popup.hidden = false; }, delay);
  for (const option of popup.children) option.onclick = () => { display.textContent = option.textContent; search.value = ''; popup.hidden = true; };
  root.onkeydown = e => { if (e.key === 'Escape') popup.hidden = true; };
  return { popup, display, search };
}

await test('个人字段读取本字段标签；下拉搜索框合并为一个控件', async () => {
  section('个人信息', [text('姓名') + text('邮箱') + text('年龄') + select('性别') + select('期望工作城市')], 'resumeEditForm-basicInfoSection');
  const scan = await api.scanForm(); eq(scan.fields.length, 5);
  eq(scan.fields.map(f => f.label).join(','), '姓名,邮箱,年龄,性别,期望工作城市');
  eq(scan.fields.every(f => f.section === '基本信息'), true);
  eq(scan.fields[3].controlAdapterId, 'feishu-select'); eq(scan.fields[0].controlAdapterId, 'feishu-text');
  eq(scan.fields.every(f => f.label !== 'filter select' && f.label !== '待处理'), true);
});
await test('姓名与邮箱直接写入文本，邻近选择提示不触发弹层流程', async () => {
  section('个人信息', [text('姓名') + text('邮箱') + select('性别')], 'resumeEditForm-basicInfoSection');
  for (const [input, value] of [...fixture.querySelectorAll('.atsx-input')].map((input, i) => [input, i ? 'fixture@example.test' : '虚构测试姓名'])) {
    const field = api.buildFieldMeta(input); field.nearbyText += ' | 请选择意向工作地';
    const result = await api.fillElementSmart(input, value, field, { writeMode: 'text' });
    eq(result.ok, true); eq(input.value, value);
  }
});
await test('性别下拉等待本字段异步菜单，搜索字不算正式值', async () => {
  section('个人信息', [select('性别')], 'resumeEditForm-basicInfoSection');
  const root = fixture.querySelector('.atsx-select'), w = widget(root, ['男', '女'], 60);
  try {
    w.search.value = '搜索中的文字'; eq(api.buildFieldMeta(root).currentValue, '');
    const scan = await api.scanForm(), plan = api.plan(scan, [entry('性别', '女', 0, '基本信息')]);
    eq(plan.candidates[0].sourceLabel, '性别'); eq(plan.candidates[0].shouldAutoFill, true);
    eq((await api.fillElementSmart(root, '女', scan.fields[0], plan.candidates[0])).ok, true);
    eq(api.buildFieldMeta(root).currentValue, '女');
  } finally { w.popup.remove(); }
});
await test('已有的其他菜单和重复选项不能被当作当前字段唯一选择', async () => {
  section('个人信息', [select('性别')], 'resumeEditForm-basicInfoSection');
  const root = fixture.querySelector('.atsx-select'), w = widget(root, ['女', '女']);
  const other = document.createElement('div'); other.className = 'atsx-select-dropdown'; other.innerHTML = '<div role="option">女</div>'; document.body.append(other);
  try { eq((await api.fillElementSmart(root, '女', api.buildFieldMeta(root), { writeMode: 'choice' })).ok, false); eq(w.display.textContent, ''); }
  finally { w.popup.remove(); other.remove(); }
});
await test('飞书搜索下拉先输入后加载候选，搜索中不发送 change 或 blur', async () => {
  section('个人信息', [select('期望工作城市')], 'resumeEditForm-basicInfoSection');
  const root = fixture.querySelector('.atsx-select'), search = root.querySelector('input'), display = root.querySelector('.atsx-select-selection-selected-value');
  const popup = document.createElement('div'); popup.className = 'atsx-select-dropdown'; popup.hidden = true; document.body.append(popup);
  let searchBlur = 0, change = 0, committed = false;
  search.onchange = () => { change++; };
  search.onblur = () => { if (!committed) { searchBlur++; popup.hidden = true; } search.value = ''; };
  search.oninput = () => { setTimeout(() => {
    popup.hidden = false; popup.innerHTML = '<div class="atsx-select-dropdown-menu-item">虚构城市</div>';
    popup.firstElementChild.onclick = () => { setTimeout(() => { committed = true; display.textContent = '虚构城市'; search.value = ''; popup.hidden = true; }, 60); };
  }, 60); };
  try {
    const result = await api.fillElementSmart(root, '虚构城市', api.buildFieldMeta(root), { writeMode: 'choice' });
    eq(result.ok, true); eq(change, 0); eq(searchBlur, 0); eq(api.buildFieldMeta(root).currentValue, '虚构城市');
    search.focus(); search.blur(); eq(api.buildFieldMeta(root).currentValue, '虚构城市');
  } finally { popup.remove(); }
});
await test('教育之后的工作、实习与自定义分区都读取自己的标题', async () => {
  section('教育经历', [text('学校名称') + text('专业')], 'resumeEditForm-educationSection');
  section('工作经历', [text('公司名称') + text('职位名称') + text('描述', '', true)]);
  section('实习经历', [text('公司名称') + text('职位名称') + text('描述', '', true)]);
  section('补充问题', [text('补充说明')]);
  const scan = await api.scanForm();
  eq(scan.fields.map(f => f.section).join(','), '教育经历,教育经历,工作经历,工作经历,工作经历,实习经历,实习经历,实习经历,补充问题');
});
const internship = (name = '', description = '') => text('公司名称', name) + text('职位名称') + text('开始时间') + text('结束时间') + text('描述', description, true);
const internships = [entry('公司', '虚构公司甲'), entry('职位', '岗位甲'), entry('开始时间', '2026-07'), entry('工作内容', '描述甲'),
  entry('公司', '虚构公司乙', 1), entry('职位', '岗位乙', 1), entry('开始时间', '2024-09', 1), entry('工作内容', '描述乙', 1), entry('结束时间', '2025-03', 1),
  entry('结束时间', '2027-06', 0, '项目经历')];
await test('导入实习顺序反转后，公司、职位、日期、描述仍来自同一记录', async () => {
  section('教育经历', [text('学校名称') + text('专业')]);
  const s = section('实习经历', [internship('虚构公司乙', '2024-09'), internship('虚构公司甲', '2026-07')]);
  const scan = await api.scanForm(), plan = api.plan(scan, internships);
  const selected = plan.candidates.filter(c => c.shouldAutoFill && !c.alreadyMatches);
  const result = await api.applyAutofillPlan(plan, selected.map(c => c.id));
  eq(result.failed, 0); eq(s.querySelectorAll('textarea')[0].value, '描述乙'); eq(s.querySelectorAll('textarea')[1].value, '描述甲');
  const controls = [...s.querySelectorAll('input')];
  eq(controls[1].value, '岗位乙'); eq(controls[2].value, '2024-09'); eq(controls[3].value, '2025-03');
  eq(controls[5].value, '岗位甲'); eq(controls[6].value, '2026-07'); eq(controls[7].value, '');
});
await test('空白实习可按顺序匹配；未对应的导入记录保持待处理', async () => {
  section('实习经历', [internship(), internship()]);
  let plan = api.plan(await api.scanForm(), internships); eq(plan.candidates.length, 9);
  fixture.replaceChildren(); api.reset(); section('实习经历', [internship('未知机构', '已有描述')]);
  plan = api.plan(await api.scanForm(), internships); eq(plan.candidates.length, 0);
});
await test('实际月份控件保留开始/结束端点，并用菜单完成选择', async () => {
  const period = row('时间', '<span class="atsx-date-picker-period-month-label" data-cy="internPeriodBegin">开始月份</span> — <span class="atsx-date-picker-period-month-label" data-cy="internPeriodEnd">结束月份</span>');
  const s = section('实习经历', [text('公司名称', '虚构公司乙') + text('职位名称') + period + text('描述', '', true)]);
  const begin = s.querySelector('[data-cy=internPeriodBegin]'), end = s.querySelector('[data-cy=internPeriodEnd]');
  const popup = document.createElement('div'); popup.className = 'atsx-date-picker-period-month-panel';
  popup.dataset.cy = 'internPeriodBeginDropdown'; popup.hidden = true; document.body.append(popup);
  let endClicks = 0; end.onclick = () => { endClicks++; };
  begin.onclick = () => {
    popup.hidden = false; popup.innerHTML = '<div class="atsx-date-picker-period-month-panel-list-item">2024</div>';
    popup.firstElementChild.onclick = () => {
      popup.innerHTML = '<div class="atsx-date-picker-period-month-panel-list-item">09</div>';
      popup.firstElementChild.onclick = () => { begin.textContent = '2024-09'; popup.hidden = true; };
    };
  };
  try {
    const scan = await api.scanForm(), plan = api.plan(scan, internships), f = scan.fields.find(f => f.controlAdapterId === 'feishu-period' && f.label === '开始时间');
    eq(scan.fields.filter(f => f.controlAdapterId === 'feishu-period').map(f => f.label).join(','), '开始时间,结束时间');
    const c = plan.candidates.find(c => c.fieldId === f.fieldId); eq(c.value, '2024-09');
    eq((await api.fillElementSmart(begin, c.value, f, c)).ok, true); eq(api.buildFieldMeta(begin).currentValue, '2024-09'); eq(endClicks, 0);
  } finally { popup.remove(); }
});
await test('未维护年龄时，不把出生日期或别的文本填进年龄', async () => {
  section('个人信息', [text('年龄')], 'resumeEditForm-basicInfoSection');
  const plan = api.plan(await api.scanForm(), [entry('出生日期', '2000-01-01', 0, '基本信息'), entry('邮箱', 'fixture@example.test', 0, '基本信息')]);
  eq(plan.candidates.length, 0);
});
document.querySelector('#summary').textContent = `完成：${passed} 通过，${failed} 失败`;
