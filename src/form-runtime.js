// Small, dependency-free execution primitives shared by the content-script drivers.
// Observers exist only while an operation is waiting; there is no background scan.
(() => {
  const VERSION = "1.2.3";
  if (window.__OJAF_FORM_RUNTIME__?.version === VERSION) return;
  const pending = new Set();
  const stats = { waits: 0, activeWaits: 0, observers: 0, yields: 0 };

  function waitFor(read, { root, timeout = 1400, interval = 80, stableFor = 0, signal } = {}) {
    stats.waits += 1;
    return new Promise((resolve, reject) => {
      let timer, mutationTimer, deadline, observer, done = false, readySince = 0;
      const finish = (value, error) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        clearTimeout(mutationTimer);
        clearTimeout(deadline);
        if (observer) { observer.disconnect(); stats.observers -= 1; }
        signal?.removeEventListener("abort", abort);
        pending.delete(abort);
        stats.activeWaits -= 1;
        if (error) reject(error); else resolve(value);
      };
      const abort = () => finish(null);
      const check = () => {
        if (done) return;
        clearTimeout(timer);
        try {
          const value = read();
          if (value) {
            readySince ||= Date.now();
            if (!stableFor || Date.now() - readySince >= stableFor) return finish(value);
          } else readySince = 0;
        } catch (error) { return finish(null, error); }
        timer = setTimeout(check, interval);
      };
      stats.activeWaits += 1;
      pending.add(abort);
      if (signal?.aborted) return abort();
      signal?.addEventListener("abort", abort, { once: true });
      // Try synchronously first. The common ready case needs no observer/timer.
      check();
      if (done) return;
      const observeRoot = root || (typeof document !== "undefined" && document.documentElement);
      if (observeRoot && typeof MutationObserver !== "undefined") {
        observer = new MutationObserver(() => {
          // Coalesce mutation bursts; value-only changes are covered by polling.
          if (!mutationTimer) mutationTimer = setTimeout(() => { mutationTimer = null; check(); }, 16);
        });
        observer.observe(observeRoot, { childList: true, subtree: true, attributes: true, characterData: true });
        stats.observers += 1;
      }
      deadline = setTimeout(() => finish(null), timeout);
    });
  }

  function yieldToMain() {
    stats.yields += 1;
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  // Keep a field identity across framework re-renders. Never fall back to an
  // arbitrary field with the same label or position in a repeated record.
  function createElementHandle(element) {
    const doc = element?.ownerDocument || document;
    const identifiers = ['data-ojaf-field-id', 'id', 'name'].flatMap((attr) => {
      const value = element?.getAttribute?.(attr);
      return value ? [{ attr, value }] : [];
    });
    const ancestors = [];
    for (let node = element?.parentElement; node; node = node.parentElement) ancestors.push(node);
    return () => {
      if (element?.isConnected !== false) return element;
      const scope = ancestors.find((node) => node.isConnected) || doc;
      for (const { attr, value } of identifiers) {
        const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\a ');
        const matches = Array.from(scope.querySelectorAll(`[${attr}="${escaped}"]`))
          .filter((node) => node.tagName === element.tagName && node.getAttribute('type') === element.getAttribute('type'));
        if (matches.length === 1) return matches[0];
      }
      return null;
    };
  }

  const POPUPS = [
    '[role="listbox"]', '[role="tree"]', '.common-unmodeled-layer',
    '.ant-select-dropdown', '.rc-select-dropdown', '.ant-cascader-menus',
    '.ant-cascader-dropdown', '.el-select-dropdown', '.el-cascader__dropdown',
    '.arco-select-popup', '.arco-cascader-popup', '.t-select__dropdown',
    '.t-cascader__popup', '.phoenix-select-dropdown',
    // SD Menu is also rendered once PER OPTION. Include its real enclosing
    // popup so sibling option decorations cannot look like unrelated layers.
    '[class*="sd-Dropdown-dropdown-"]', '[class*="sd-Select-menu-"]',
    '[class*="sd-Menu-container-"]', '.atsx-select-dropdown'
  ].join(',');

  function createChoiceSession(trigger, { container = trigger, isVisible, popupSelector = POPUPS } = {}) {
    const doc = trigger.ownerDocument || document;
    const visible = (node) => {
      if (!node || node.isConnected === false || !isVisible(node)) return false;
      const rect = node.getBoundingClientRect?.();
      return !rect || (rect.right > 0 && rect.bottom > 0);
    };
    const layers = () => Array.from(doc.querySelectorAll(popupSelector)).filter(visible);
    const before = new Set(layers());
    const liveTrigger = createElementHandle(trigger);
    const liveContainer = createElementHandle(container);
    let owned = null;
    const oneRoot = (roots) => {
      const unique = [...new Set(roots)].filter(Boolean);
      // The portal may contain a listbox; treat the nested pair as one popup.
      const outer = unique.filter((node) => !unique.some((other) => other !== node && other.contains?.(node)));
      return outer.length === 1 ? outer[0] : null;
    };
    const resolvePopup = () => {
      const currentTrigger = liveTrigger(), currentContainer = liveContainer();
      const anchors = [currentTrigger, currentContainer, currentTrigger?.closest?.('[role="combobox"]'),
        ...Array.from(currentContainer?.querySelectorAll?.('[aria-controls],[aria-owns]') || [])];
      const linked = [];
      for (const anchor of anchors.filter(Boolean)) {
        for (const attr of ['aria-controls', 'aria-owns']) {
          for (const id of (anchor.getAttribute?.(attr) || '').split(/\s+/).filter(Boolean)) {
            const node = doc.getElementById(id);
            if (visible(node)) linked.push(node);
          }
        }
      }
      if (linked.length) return owned = oneRoot(linked);
      if (visible(owned)) return owned;
      const nested = Array.from(currentContainer?.querySelectorAll?.(popupSelector) || []).filter(visible);
      if (nested.length) return owned = oneRoot(nested);
      // Never steal a popup that was already visible before this field opened.
      return owned = oneRoot(layers().filter((node) => !before.has(node)));
    };
    const options = (selector, root = resolvePopup()) => {
      if (!root) return [];
      const enabled = (node) => {
        for (let current = node; current && current !== root; current = current.parentElement) {
          if (current.disabled || current.getAttribute?.('aria-disabled') === 'true' ||
              /(?:^|\s)\S*disabled\b/i.test(String(current.className || ''))) return false;
        }
        return true;
      };
      const nodes = Array.from(root.querySelectorAll(selector)).filter((node) => visible(node) && enabled(node));
      // A label and its option wrapper represent one choice, not ambiguity.
      return nodes.filter((node) => !nodes.some((other) => other !== node && node.contains?.(other)));
    };
    const close = () => {
      const root = resolvePopup();
      if (root) liveTrigger()?.dispatchEvent?.(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
    };
    return { resolvePopup, options, close, liveTrigger, waitFor: (read, config = {}) => waitFor(read, { root: doc.documentElement, ...config }) };
  }

  function uniqueOption(options, targets, matches, readText) {
    for (const target of targets) {
      const found = options.filter((option) => matches(readText(option), target) ||
        matches(option.getAttribute?.('aria-label') || '', target) ||
        matches(option.getAttribute?.('data-value') || '', target));
      if (found.length) return found.length === 1 ? found[0] : null;
    }
    return null;
  }

  // Adapted from ResumeFiller's primary-label and structural-wrapper handling.
  // See THIRD_PARTY_NOTICES.md. Sibling labels are context, never the field title.
  function primaryLabel(element) {
    const item = element.closest?.('.form-item--phoenix,.form-item,.phoenix-form-item,.beisen-form-item');
    const title = item?.querySelector?.('.form-item__title .form-item__text,.form-item__title label,.form-item__text,.phoenix-form-item__label,.beisen-form-item__label');
    if (title?.textContent?.trim()) return title.textContent.trim();
    const labels = Array.from(element.labels || []);
    return labels.filter((label) => !/sd-Input-container|sd-Select-container|sd-Checkbox|phoenix-radio|ant-radio-wrapper|el-radio|el-checkbox/.test(String(label.className || '')))
      .map((label) => label.textContent.trim()).filter(Boolean).join(' ');
  }

  function dispose() { for (const abort of [...pending]) abort(); }
  window.__OJAF_FORM_RUNTIME__?.dispose?.();
  window.__OJAF_FORM_RUNTIME__ = Object.freeze({ version: VERSION, waitFor, yieldToMain,
    createChoiceSession, createElementHandle, uniqueOption, primaryLabel, dispose, stats: () => ({ ...stats }) });
})();
