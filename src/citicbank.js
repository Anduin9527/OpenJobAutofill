// CITIC's Way.js forms use Bootstrap Select inside the same-origin #myFram.
// Keep DOM-specific behavior separate from the generic matching/runtime layer.
(() => {
  window.__OJAF_CITICBANK__ = { create };
  function create({ runtime, hostname, isVisible, click, writeText, targets, matches }) {
    const active = () => hostname() === 'job.citicbank.com';
    const clean = value => String(value || '').replace(/^[*＊\s]+/, '').trim();
    const sections = { jbxxform:'基本信息', qwxzform:'求职意向', jyjlform:'教育经历',
      sxjlform:'实习经历', zxjlform:'在校经历', gzjlform:'工作经历', xmjlform:'项目经历',
      yynlform:'语言能力', zyzgrzform:'证书技能', jsjjnform:'计算机技能', pxjlform:'培训经历',
      jcqkform:'奖惩情况', jtgxform:'家庭信息', qtzyxxform:'其他信息', zwpjform:'自我描述' };
    const repeated = new Set(['jyjlform','sxjlform','zxjlform','gzjlform','xmjlform','yynlform','zyzgrzform','pxjlform','jcqkform','jtgxform']);
    const labels = { a0101:'姓名', a0188cate:'移动电话类别', a0118:'移动电话', a0102:'性别',
      nationality:'国籍', a0213:'身高', weight:'体重', email:'邮箱', yxsfzjlx:'证件类型',
      a5015:'证件号码', a0103:'出生日期', a0111:'户口所在地', originplace:'籍贯',
      a0112:'现居住城市', a0105:'婚姻状况', a0210:'政治面貌', a0209:'自我评价' };
    const educationLabels = { byyx:'学校名称', byyxqt:'学校名称', xl:'学历', xw:'学位',
      sxzy:'专业', rxsj:'开始时间', bysj:'结束时间', department:'所在院系' };
    const owned = e => active() && !!e?.closest?.('form') && !!e.closest('td');
    const bootstrap = e => e?.closest?.('.bootstrap-select');
    const selectOf = e => e?.matches?.('select') ? e : bootstrap(e)?.querySelector('select');
    const groupOf = e => {
      const group = e?.closest?.('.dis-flex');
      return group?.querySelector('select.dwArea,select.dwSecond') ? group : null;
    };
    const logical = e => groupOf(e) || selectOf(e) || e;
    const label = e => {
      const data = e.getAttribute('way-data') || e.querySelector?.(':scope > input[way-data]')?.getAttribute('way-data') || '';
      const key = data.split('.').pop() || e.getAttribute('name') || e.id;
      const form = e.closest('form')?.id;
      return (form === 'jbxxform' ? labels[key] : form === 'jyjlform' ? educationLabels[key] : '') ||
        clean(e.closest('td')?.querySelector(':scope > div:first-child')?.textContent);
    };
    const selectedText = select => Array.from(select.selectedOptions || [])
      .filter(o => o.value && !/^请选择/.test(clean(o.textContent))).map(o => clean(o.textContent)).join(' / ');
    const common = { getLogicalElement:logical, getFieldContainer:e=>e.closest('td'), getLabel:label };
    const fail = reason => ({ok:false, reason});
    function uniqueOption(select, value) {
      for (const target of targets(value)) {
        const options = Array.from(select.options).filter(o => o.value && !o.disabled && !o.parentElement?.disabled && matches(clean(o.textContent), target));
        if (options.length === 1) return options[0];
        if (options.length > 1) return null;
      }
      return null;
    }
    async function choose(select, value) {
      if (!select || select.disabled) return fail('下拉框不可用');
      const root = bootstrap(select), button = root?.querySelector(':scope > button');
      if (!button || button.disabled) return fail('未找到 Bootstrap 下拉按钮');
      const wanted = select.multiple ? (Array.isArray(value) ? value : String(value).split(/[、,，;；\n]/)).map(clean).filter(Boolean) : [value];
      const options = wanted.map(v => uniqueOption(select, v));
      if (!options.length || options.some(o => !o) || new Set(options).size !== options.length) return fail('没有唯一且可用的下拉选项');
      const desired = new Set(options.map(o => o.value));
      const committed = () => {
        const values = Array.from(select.selectedOptions).filter(o=>o.value).map(o=>o.value);
        const display = clean(root.querySelector('.filter-option-inner-inner')?.textContent);
        return values.length === desired.size && values.every(v=>desired.has(v)) &&
          (select.multiple ? !!display && !/^请选择/.test(display) : matches(display, clean(options[0].textContent)));
      };
      if (committed()) return {ok:true};
      const changes = select.multiple ? Array.from(select.options).filter(o=>o.value && o.selected !== desired.has(o.value)) : options;
      if (changes.some(o=>o.disabled || o.parentElement?.disabled)) return fail('现有禁用选项无法调整，请手动核对');
      const session = runtime.createChoiceSession(button, {container:root, isVisible});
      const search = root.querySelector('.bs-searchbox input');
      const previousSearch = search?.value || '';
      try {
        for (const option of changes) {
          if (!isVisible(root.querySelector('[role="listbox"]'))) click(button);
          if (search && isVisible(search)) await writeText(search, clean(option.textContent));
          const item = await session.waitFor(() => {
            const items = Array.from(root.querySelectorAll('a[role="option"]')).filter(node =>
              isVisible(node) && node.getAttribute('aria-disabled') !== 'true' && !node.closest('.disabled') &&
              clean(node.querySelector('.text')?.textContent || node.textContent) === clean(option.textContent));
            return items.length === 1 ? items[0] : null;
          }, {root, timeout:1600});
          if (!item) return fail('下拉选项未呈现或存在同名项，请手动选择');
          click(item);
          if (!await runtime.waitFor(() => option.selected === desired.has(option.value), {root, timeout:800})) return fail('页面没有确认选项');
        }
        const ok = !!await runtime.waitFor(committed, {root, timeout:800, stableFor:50});
        return ok ? {ok:true} : fail('下拉值与显示内容未同步');
      } finally {
        if (search?.isConnected && search.value !== previousSearch) await writeText(search, previousSearch);
        if (isVisible(root.querySelector('[role="listbox"]'))) click(button);
        session.close();
      }
    }
    async function choosePath(group, value) {
      // Explicit levels only. Never guess a province from a city or invent a district.
      const path = (Array.isArray(value) ? value : String(value).split(/\s*(?:\/|>|→|、)\s*/)).map(clean).filter(Boolean);
      const selects = Array.from(group.querySelectorAll('select'));
      if (path.length !== selects.length) return fail('联动字段需要完整路径（省 / 市 / 区县），请手动补全');
      for (let i=0; i<selects.length; i++) {
        const select = selects[i];
        const ready = await runtime.waitFor(() => !select.disabled && uniqueOption(select, path[i]), {root:group, timeout:1800, stableFor:80});
        if (!ready) return fail(`联动第 ${i+1} 级无唯一匹配；已选择的上级需核对`);
        const result = await choose(select, path[i]);
        if (!result.ok) return result;
      }
      return selects.every((s,i)=>matches(selectedText(s),path[i])) ? {ok:true} : fail('联动选择未保持完整路径');
    }
    async function date(e, value) {
      const match = String(value).trim().match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/);
      if (!match) return fail('网站需要完整年月日，未替资料推测日期');
      const [,y,m,d] = match.map(Number), check = new Date(Date.UTC(y,m-1,d));
      if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m-1 || check.getUTCDate() !== d) return fail('日期无效');
      return writeText(e, `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`);
    }
    const adapters = [
      {...common, id:'citicbank-path', name:'中信银行联动选择', matches:e=>owned(e)&&!!groupOf(e),
        getSurfaceElement:e=>groupOf(e), getChoiceContainer:e=>groupOf(e), getOptions:()=>[],
        getCurrentValue:e=>{const parts=Array.from(groupOf(e).querySelectorAll('select')).map(selectedText);return parts.every(Boolean)?parts.join(' / '):'';},
        fill:(e,v)=>choosePath(groupOf(e),v)},
      {...common, id:'citicbank-select', name:'中信银行 Bootstrap Select', matches:e=>owned(e)&&!!bootstrap(e),
        getSurfaceElement:e=>bootstrap(e)?.querySelector(':scope > button'), getChoiceContainer:bootstrap,
        getCurrentValue:e=>selectedText(selectOf(e)), isDisabled:e=>!!selectOf(e)?.disabled,
        fill:(e,v)=>choose(selectOf(e),v)},
      {...common, id:'citicbank-date', name:'中信银行完整日期', matches:e=>owned(e)&&e.matches('input')&&!!e.closest('.bs-datetime'),
        fill:date},
      {...common, id:'citicbank-text', name:'中信银行表格字段', matches:e=>owned(e)&&e.matches('input:not([type="file"]),textarea'),
        fill:(e,value,field,candidate)=>{
          if(e.id==='a0205' && !(/税前/.test(candidate?.sourceLabel||'') && /年薪/.test(candidate.sourceLabel) && /万元/.test(candidate.sourceLabel)))
            return fail('期望薪酬要求税前年薪（万元），请核对单位后手动填写');
          return writeText(e,value);
        }}
    ];
    function repeatRoot(e) {
      if (!active() || !repeated.has(e.closest('form')?.id)) return null;
      const root = e.closest('[way-scope]');
      return /^\d+$/.test(root?.getAttribute('way-scope') || '') && root.parentElement?.hasAttribute('way-repeat-wrapper') ? root : null;
    }
    return { adapters, active, label,
      site:{id:'citicbank',name:'中信银行招聘',urlPattern:/^job\.citicbank\.com$/i,
        indicators:['#jbxxform','#jyjlform'],containerSelector:'td',labelSelector:':scope > div:first-child',
        sectionSelector:'.leftDiv > .divTitle',editLabels:[],saveLabels:[]},
      section:e=>sections[e.closest('form')?.id] || '', repeatRoot,
      repeatInfo:e=>{const root=repeatRoot(e);if(!root)return {index:0,total:0};
        const siblings=Array.from(root.parentElement.children).filter(n=>/^\d+$/.test(n.getAttribute('way-scope')||''));
        return {index:siblings.indexOf(root)+1,total:siblings.length};},
      // A school's required high-school row must never consume a college record.
      bindRecords(fields, entries) {
        const groups=new Map();
        for(const field of fields.filter(f=>f.siteAdapterId==='citicbank'&&f.repeatItemTotal>0)) {
          const key=field.inferredCategory+'|'+field.repeatItemIndex;
          if(!groups.has(key))groups.set(key,[]);groups.get(key).push(field);
        }
        const identityLabels={教育经历:['学校名称','学校'],实习经历:['单位名称','公司名称','公司'],工作经历:['单位名称','公司名称','公司'],项目经历:['项目名称'],家庭信息:['姓名']};
        const proposals=[];
        for(const group of groups.values()) {
          const first=group[0], names=identityLabels[first.inferredCategory] || [];
          const identity=group.find(f=>names.includes(f.inferredLabel)&&f.hasCurrentValue);
          const candidates=entries.filter(e=>e.category===first.inferredCategory&&names.includes(e.label)&&e.hasValue&&Number.isInteger(e.valuePath?.itemIndex));
          let selected=identity ? candidates.filter(e=>clean(e.value)===clean(identity.currentValue)) :
            candidates.length===first.repeatItemTotal ? candidates.filter(e=>e.valuePath.itemIndex===first.repeatItemIndex-1) : [];
          if(first.inferredCategory==='教育经历') {
            const degree=group.find(f=>f.inferredLabel==='学历');
            const compatible=e=>degree && entries.some(d=>d.category===e.category&&d.valuePath?.sectionKey===e.valuePath.sectionKey&&d.valuePath?.itemIndex===e.valuePath.itemIndex&&d.label==='学历'&&d.hasValue&&degree.options?.some(o=>o.value&&targets(d.value).some(t=>matches(o.label,t))));
            selected=selected.filter(compatible);
            if (!identity && !selected.length) selected=candidates.filter(compatible);
          }
          const match=selected.length===1?selected[0]:null;
          proposals.push({group,match,identified:!!identity});
        }
        // Reordered populated rows take precedence over an empty positional row.
        // Never reuse one profile record in two form rows.
        for(const proposal of proposals) {
          let {match}=proposal;
          if(match) {
            const peers=proposals.filter(p=>p.match?.category===match.category && p.match?.valuePath.sectionKey===match.valuePath.sectionKey && p.match?.valuePath.itemIndex===match.valuePath.itemIndex);
            const identified=peers.filter(p=>p.identified);
            if(peers.length>1 && !(identified.length===1 && identified[0]===proposal)) match=null;
          }
          for(const field of proposal.group){field.hotjobProfileIndex=match?.valuePath.itemIndex??-1;field.hotjobProfileSectionKey=match?.valuePath.sectionKey;}
        }
      }
    };
  }
})();
