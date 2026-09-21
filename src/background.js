const DEFAULT_API_CONFIG = {
  mode: "openai-compatible",
  baseUrl: "https://api.openai.com/v1",
  endpointPath: "/chat/completions",
  apiKey: "",
  model: "your-model-name",
  useJsonResponseFormat: false,
  extraHeadersJson: "{}",
  customUrl: "",
  customMethod: "POST",
  customHeadersJson: "{}",
  customBodyTemplate:
    '{\n  "model": {{modelJson}},\n  "messages": {{messagesJson}},\n  "temperature": 0\n}',
  customResponsePath: "choices.0.message.content"
};

const PROFILE_SCHEMA_VERSION = 2;
const PROFILE_BACKUP_FORMAT = "OpenJobAutofillProfileBackup";
const MAX_PROFILE_BACKUP_HISTORY = 10;
const DEFAULT_PROFILE_V2 = {
  schemaVersion: PROFILE_SCHEMA_VERSION,
  updatedAt: "",
  sections: {},
  customSections: []
};

const DEFAULT_BACKUP_CONFIG = {
  autoDownloadEnabled: false,
  lastExternalBackupAt: "",
  lastExternalBackupFilename: ""
};

const STORAGE_KEYS = {
  profileV2: "profileV2",
  apiConfig: "apiConfig",
  profileBackupHistory: "profileBackupHistory",
  backupConfig: "backupConfig"
};

const PROFILE_PANEL_STATE_KEY = "OJAF_PROFILE_PANEL_STATE";
const MAX_PROFILE_PANEL_STATE_ITEMS = 20;
const AUTOFILL_DEBUG_HISTORY_KEY = "OJAF_AUTOFILL_DEBUG_HISTORY";
const MAX_AUTOFILL_DEBUG_HISTORY = 5;

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get([
    STORAGE_KEYS.profileV2,
    STORAGE_KEYS.apiConfig,
    STORAGE_KEYS.profileBackupHistory,
    STORAGE_KEYS.backupConfig
  ]);
  const next = {};

  if (!existing[STORAGE_KEYS.profileV2]) {
    next[STORAGE_KEYS.profileV2] = DEFAULT_PROFILE_V2;
  }

  if (!existing[STORAGE_KEYS.apiConfig]) {
    next[STORAGE_KEYS.apiConfig] = DEFAULT_API_CONFIG;
  }

  if (!Array.isArray(existing[STORAGE_KEYS.profileBackupHistory])) {
    next[STORAGE_KEYS.profileBackupHistory] = [];
  }

  if (!existing[STORAGE_KEYS.backupConfig]) {
    next[STORAGE_KEYS.backupConfig] = DEFAULT_BACKUP_CONFIG;
  }

  if (Object.keys(next).length > 0) {
    await chrome.storage.local.set(next);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message.type !== "string" || !message.type.startsWith("OJAF_")) {
    return undefined;
  }

  handleMessage(message)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    });

  return true;
});

async function handleMessage(message) {
  switch (message.type) {
    case "OJAF_GET_SETTINGS":
      return getSettings();
    case "OJAF_OPEN_OPTIONS":
      await chrome.runtime.openOptionsPage();
      return {};
    case "OJAF_SAVE_SETTINGS":
      return saveSettings(message.payload || {});
    case "OJAF_GET_DEBUG_HISTORY":
      return getAutofillDebugHistory();
    case "OJAF_SAVE_DEBUG_SNAPSHOT":
      return saveAutofillDebugSnapshot(message.payload || {});
    case "OJAF_CLEAR_DEBUG_HISTORY":
      return clearAutofillDebugHistory();
    case "OJAF_GET_PROFILE_BACKUPS":
      return getProfileBackups();
    case "OJAF_RESTORE_PROFILE_BACKUP":
      return restoreProfileBackup(message.payload || {});
    case "OJAF_SET_BACKUP_CONFIG":
      return setBackupConfig(message.payload || {});
    case "OJAF_DOWNLOAD_PROFILE_BACKUP":
      return downloadCurrentProfileBackup();
    case "OJAF_CLEAR_SETTINGS":
      return clearSettings();
    case "OJAF_MAP_FIELDS":
      return mapFields(message.payload || {});
    case "OJAF_ANALYZE_PAGE_STRUCTURE":
      return analyzePageStructure(message.payload || {});
    case "OJAF_SAVE_PROFILE_PANEL_STATE":
      return saveProfilePanelState(message.payload || {});
    case "OJAF_GET_PROFILE_PANEL_STATE":
      return getProfilePanelState(message.payload || {});
    case "OJAF_LIST_MODELS":
      return listModels(message.payload || {});
    case "OJAF_TEST_CONNECTION":
      return testApi(message.payload || {});
    default:
      throw new Error(`Unknown message type: ${message.type}`);
  }
}

async function getSettings() {
  const values = await chrome.storage.local.get([
    STORAGE_KEYS.profileV2,
    STORAGE_KEYS.apiConfig,
    STORAGE_KEYS.backupConfig
  ]);
  return {
    profileV2: normalizeProfileV2(values[STORAGE_KEYS.profileV2] || DEFAULT_PROFILE_V2),
    apiConfig: { ...DEFAULT_API_CONFIG, ...(values[STORAGE_KEYS.apiConfig] || {}) },
    backupConfig: normalizeBackupConfig(values[STORAGE_KEYS.backupConfig])
  };
}

async function saveSettings(payload) {
  const next = {};
  let backupResult = null;

  if (payload.profileV2) {
    const profileState = await chrome.storage.local.get([
      STORAGE_KEYS.profileBackupHistory,
      STORAGE_KEYS.backupConfig
    ]);
    const profileV2 = normalizeProfileV2(payload.profileV2);
    const backupConfig = normalizeBackupConfig(profileState[STORAGE_KEYS.backupConfig]);
    next[STORAGE_KEYS.profileV2] = profileV2;
    next[STORAGE_KEYS.profileBackupHistory] = appendProfileBackupHistory(
      profileState[STORAGE_KEYS.profileBackupHistory],
      profileV2,
      payload.profileSaveSource || "save"
    );

    if (backupConfig.autoDownloadEnabled) {
      backupResult = await tryDownloadProfileBackup(profileV2);
      if (backupResult.saved) {
        next[STORAGE_KEYS.backupConfig] = {
          ...backupConfig,
          lastExternalBackupAt: backupResult.exportedAt,
          lastExternalBackupFilename: backupResult.filename
        };
      }
    }
  }

  if (payload.apiConfig) {
    next[STORAGE_KEYS.apiConfig] = { ...DEFAULT_API_CONFIG, ...payload.apiConfig };
  }

  await chrome.storage.local.set(next);
  return { saved: Object.keys(next), backup: backupResult };
}

async function getProfileBackups() {
  const values = await chrome.storage.local.get([
    STORAGE_KEYS.profileBackupHistory,
    STORAGE_KEYS.backupConfig
  ]);
  const history = normalizeProfileBackupHistory(values[STORAGE_KEYS.profileBackupHistory]);
  return {
    config: normalizeBackupConfig(values[STORAGE_KEYS.backupConfig]),
    history: history.map((entry) => ({
      id: entry.id,
      savedAt: entry.savedAt,
      profileUpdatedAt: entry.profileV2.updatedAt || "",
      source: entry.source
    }))
  };
}

async function restoreProfileBackup(payload) {
  const backupId = String(payload.backupId || "");
  if (!backupId) {
    throw new Error("Missing profile backup id.");
  }

  const values = await chrome.storage.local.get([
    STORAGE_KEYS.profileV2,
    STORAGE_KEYS.profileBackupHistory,
    STORAGE_KEYS.backupConfig
  ]);
  const history = normalizeProfileBackupHistory(values[STORAGE_KEYS.profileBackupHistory]);
  const selected = history.find((entry) => entry.id === backupId);
  if (!selected) {
    throw new Error("The selected profile backup no longer exists.");
  }

  const currentProfile = normalizeProfileV2(values[STORAGE_KEYS.profileV2] || DEFAULT_PROFILE_V2);
  const restoredProfile = normalizeProfileV2(selected.profileV2);
  const nextHistory = appendProfileBackupHistory(history, currentProfile, "before-restore");
  const backupConfig = normalizeBackupConfig(values[STORAGE_KEYS.backupConfig]);
  const next = {
    [STORAGE_KEYS.profileV2]: restoredProfile,
    [STORAGE_KEYS.profileBackupHistory]: nextHistory
  };

  let backupResult = null;
  if (backupConfig.autoDownloadEnabled) {
    backupResult = await tryDownloadProfileBackup(restoredProfile);
    if (backupResult.saved) {
      next[STORAGE_KEYS.backupConfig] = {
        ...backupConfig,
        lastExternalBackupAt: backupResult.exportedAt,
        lastExternalBackupFilename: backupResult.filename
      };
    }
  }

  await chrome.storage.local.set(next);
  return { profileV2: restoredProfile, backup: backupResult };
}

async function setBackupConfig(payload) {
  const values = await chrome.storage.local.get(STORAGE_KEYS.backupConfig);
  const current = normalizeBackupConfig(values[STORAGE_KEYS.backupConfig]);
  const next = {
    ...current,
    autoDownloadEnabled: Boolean(payload.autoDownloadEnabled)
  };
  await chrome.storage.local.set({ [STORAGE_KEYS.backupConfig]: next });
  return next;
}

async function downloadCurrentProfileBackup() {
  const values = await chrome.storage.local.get([
    STORAGE_KEYS.profileV2,
    STORAGE_KEYS.backupConfig
  ]);
  const profileV2 = normalizeProfileV2(values[STORAGE_KEYS.profileV2] || DEFAULT_PROFILE_V2);
  const result = await downloadProfileBackup(profileV2);
  if (result.saved) {
    const backupConfig = normalizeBackupConfig(values[STORAGE_KEYS.backupConfig]);
    await chrome.storage.local.set({
      [STORAGE_KEYS.backupConfig]: {
        ...backupConfig,
        lastExternalBackupAt: result.exportedAt,
        lastExternalBackupFilename: result.filename
      }
    });
  }
  return result;
}

function normalizeBackupConfig(value) {
  const source = isPlainObject(value) ? value : {};
  return {
    autoDownloadEnabled: Boolean(source.autoDownloadEnabled),
    lastExternalBackupAt: sanitizePromptText(source.lastExternalBackupAt || "", 80),
    lastExternalBackupFilename: sanitizePromptText(source.lastExternalBackupFilename || "", 240)
  };
}

function normalizeProfileBackupHistory(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry) => isPlainObject(entry) && entry.id && entry.profileV2)
    .map((entry) => ({
      id: sanitizePromptText(entry.id, 100),
      savedAt: sanitizePromptText(entry.savedAt || "", 80),
      source: sanitizePromptText(entry.source || "save", 40),
      profileV2: normalizeProfileV2(entry.profileV2)
    }))
    .slice(0, MAX_PROFILE_BACKUP_HISTORY);
}

function appendProfileBackupHistory(value, profileV2, source) {
  const history = normalizeProfileBackupHistory(value);
  const normalizedProfile = normalizeProfileV2(profileV2);
  const fingerprint = createProfileFingerprint(normalizedProfile);
  if (history.some((entry) => createProfileFingerprint(entry.profileV2) === fingerprint)) {
    return history;
  }

  return [
    {
      id: createProfileBackupId(),
      savedAt: new Date().toISOString(),
      source: sanitizePromptText(source || "save", 40),
      profileV2: normalizedProfile
    },
    ...history
  ].slice(0, MAX_PROFILE_BACKUP_HISTORY);
}

function createProfileFingerprint(profileV2) {
  return JSON.stringify({
    ...normalizeProfileV2(profileV2),
    updatedAt: ""
  });
}

function createProfileBackupId() {
  if (globalThis.crypto?.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function downloadProfileBackup(profileV2) {
  if (!chrome.downloads || !chrome.permissions) {
    return { saved: false, reason: "downloads-unavailable" };
  }

  const granted = await containsExtensionPermissions({ permissions: ["downloads"] });
  if (!granted) {
    return { saved: false, reason: "permission-required" };
  }

  const exportedAt = new Date().toISOString();
  const backup = {
    format: PROFILE_BACKUP_FORMAT,
    version: 1,
    exportedAt,
    profileV2: normalizeProfileV2(profileV2)
  };
  const filename = `OpenJobAutofill/backups/openjobautofill-profile-${formatLocalDate(new Date())}.json`;
  const url = `data:application/json;charset=utf-8,${encodeURIComponent(`${JSON.stringify(backup, null, 2)}\n`)}`;
  await startExtensionDownload({
    url,
    filename,
    conflictAction: "overwrite",
    saveAs: false
  });
  return { saved: true, exportedAt, filename };
}

function containsExtensionPermissions(permissions) {
  return new Promise((resolve) => {
    chrome.permissions.contains(permissions, (granted) => {
      resolve(Boolean(granted));
    });
  });
}

function startExtensionDownload(options) {
  return new Promise((resolve, reject) => {
    chrome.downloads.download(options, (downloadId) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(downloadId);
    });
  });
}

async function tryDownloadProfileBackup(profileV2) {
  try {
    return await downloadProfileBackup(profileV2);
  } catch (error) {
    return {
      saved: false,
      reason: "download-failed",
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function clearSettings() {
  await chrome.storage.local.clear();
  return { cleared: true };
}

async function getAutofillDebugHistory() {
  const values = await chrome.storage.local.get(AUTOFILL_DEBUG_HISTORY_KEY);
  const rawHistory = values[AUTOFILL_DEBUG_HISTORY_KEY];
  const history = normalizeAutofillDebugHistory(rawHistory);

  // Older content scripts wrote this key directly.  Rewrite legacy or
  // malformed entries through the same allow-list used for the response so
  // sensitive fields can never remain in local history after it is inspected.
  if (JSON.stringify(rawHistory) !== JSON.stringify(history)) {
    await chrome.storage.local.set({ [AUTOFILL_DEBUG_HISTORY_KEY]: history });
  }

  return {
    history,
    count: history.length,
    max: MAX_AUTOFILL_DEBUG_HISTORY
  };
}

async function saveAutofillDebugSnapshot(payload) {
  const source = isPlainObject(payload) && Object.prototype.hasOwnProperty.call(payload, "snapshot")
    ? payload.snapshot
    : payload;
  const snapshot = sanitizeAutofillDebugSnapshot(source);
  if (!snapshot) {
    throw new Error("Missing debug snapshot.");
  }

  const values = await chrome.storage.local.get(AUTOFILL_DEBUG_HISTORY_KEY);
  const history = normalizeAutofillDebugHistory(values[AUTOFILL_DEBUG_HISTORY_KEY]);
  const nextHistory = [
    snapshot,
    ...history.filter((entry) => !isSameAutofillDebugSnapshot(entry, snapshot))
  ].slice(0, MAX_AUTOFILL_DEBUG_HISTORY);
  await chrome.storage.local.set({ [AUTOFILL_DEBUG_HISTORY_KEY]: nextHistory });

  return {
    saved: true,
    count: nextHistory.length,
    snapshot
  };
}

async function clearAutofillDebugHistory() {
  const values = await chrome.storage.local.get(AUTOFILL_DEBUG_HISTORY_KEY);
  const count = normalizeAutofillDebugHistory(values[AUTOFILL_DEBUG_HISTORY_KEY]).length;
  if (typeof chrome.storage.local.remove === "function") {
    await chrome.storage.local.remove(AUTOFILL_DEBUG_HISTORY_KEY);
  } else {
    // `remove` is part of the Chrome storage API.  The fallback keeps this
    // route usable in minimal test harnesses and older Chromium shims.
    await chrome.storage.local.set({ [AUTOFILL_DEBUG_HISTORY_KEY]: [] });
  }
  return { cleared: true, count };
}

function normalizeAutofillDebugHistory(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const history = [];
  const seen = new Set();
  for (const item of value) {
    const snapshot = sanitizeAutofillDebugSnapshot(item);
    if (!snapshot) {
      continue;
    }

    const key = createAutofillDebugSnapshotKey(snapshot);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    history.push(snapshot);
    if (history.length >= MAX_AUTOFILL_DEBUG_HISTORY) {
      break;
    }
  }
  return history;
}

function isSameAutofillDebugSnapshot(left, right) {
  return createAutofillDebugSnapshotKey(left) === createAutofillDebugSnapshotKey(right);
}

function createAutofillDebugSnapshotKey(snapshot) {
  const source = isPlainObject(snapshot) ? snapshot : {};
  const page = isPlainObject(source.page) ? source.page : {};
  const generatedAt = sanitizeDebugText(source.generatedAt || "", 80);
  const url = sanitizeDebugUrl(page.url || "");
  if (generatedAt || url) {
    return `${generatedAt}|${url}`;
  }
  return JSON.stringify(sanitizeAutofillDebugSnapshot(source) || {});
}

function sanitizeAutofillDebugSnapshot(value) {
  if (!isPlainObject(value)) {
    return null;
  }

  const page = sanitizeAutofillDebugPage(value.page);
  const scan = sanitizeAutofillDebugScan(value.scan);
  const snapshot = {
    version: sanitizeDebugText(value.version || "", 80),
    page,
    generatedAt: sanitizeDebugText(value.generatedAt || "", 80),
    exportedAt: sanitizeDebugText(value.exportedAt || "", 80),
    finishedAt: sanitizeDebugText(value.finishedAt || "", 80),
    mappingSource: sanitizeDebugText(value.mappingSource || "", 120),
    aiStatus: sanitizeDebugText(value.aiStatus || "", 300),
    aiUsage: sanitizeAutofillDebugAiUsage(value.aiUsage),
    profileSummary: sanitizeAutofillDebugProfileSummary(value.profileSummary),
    scan,
    counts: sanitizeAutofillDebugCounts(value.counts),
    mappingDiagnostics: sanitizeAutofillDebugDiagnostics(value.mappingDiagnostics),
    candidates: sanitizeAutofillDebugCandidates(value.candidates),
    summary: sanitizeAutofillDebugSummary(value.summary),
    results: sanitizeAutofillDebugResults(value.results)
  };

  // A snapshot with no page/timestamp/diagnostic content is not useful and
  // usually indicates a malformed storage entry.  Do not retain it.
  if (!snapshot.version && !snapshot.generatedAt && !snapshot.finishedAt && !snapshot.page.url && !snapshot.page.title) {
    return null;
  }
  return snapshot;
}

function sanitizeAutofillDebugPage(value) {
  const source = isPlainObject(value) ? value : {};
  const url = sanitizeDebugUrl(source.url || "");
  return {
    url,
    title: sanitizeDebugText(source.title || "", 160),
    hostname: sanitizeDebugHostname(source.hostname || "", url)
  };
}

function sanitizeAutofillDebugScan(value) {
  const source = isPlainObject(value) ? value : {};
  return {
    fieldCount: sanitizeDebugCount(source.fieldCount),
    expandedEditCards: sanitizeDebugCount(source.expandedEditCards),
    siteAdapter: sanitizeAutofillDebugSiteAdapter(source.siteAdapter),
    fields: Array.isArray(source.fields)
      ? source.fields.map(sanitizeAutofillDebugField).filter(Boolean).slice(0, 500)
      : []
  };
}

function sanitizeAutofillDebugSiteAdapter(value) {
  if (!isPlainObject(value)) {
    return null;
  }
  return {
    id: sanitizeDebugText(value.id || "", 80),
    name: sanitizeDebugText(value.name || "", 120),
    confidence: clampConfidence(value.confidence)
  };
}

function sanitizeAutofillDebugField(value) {
  if (!isPlainObject(value)) {
    return null;
  }
  return {
    fieldId: sanitizeDebugText(value.fieldId || "", 120),
    label: sanitizeDebugText(value.label || "", 120),
    category: sanitizeDebugText(value.category || "", 80),
    type: sanitizeDebugText(value.type || "", 40),
    controlAdapterId: sanitizeDebugText(value.controlAdapterId || "", 40),
    controlAdapterName: sanitizeDebugText(value.controlAdapterName || "", 80),
    canFill: Boolean(value.canFill),
    hasCurrentValue: Boolean(value.hasCurrentValue),
    required: Boolean(value.required),
    placeholder: sanitizeDebugText(value.placeholder || "", 80),
    section: sanitizeAutofillDebugSection(value.section),
    // Repeated-group text can contain values rendered by custom selects even
    // when the underlying input value is omitted.  Diagnostics already carry
    // the normalized field/category/occurrence, so never persist this text.
    groupText: ""
  };
}

function sanitizeAutofillDebugSection(value) {
  const text = sanitizeDebugText(value || "", 120).replace(/\s+/g, "");
  const allowed = new Set([
    "基本信息",
    "求职意向",
    "教育经历",
    "实习经历",
    "工作经历",
    "项目经历",
    "绩效考核",
    "专业资格",
    "证书技能",
    "语言能力",
    "外语能力",
    "计算机技能",
    "奖惩情况",
    "家庭信息",
    "自我描述",
    "有关声明",
    "其他信息"
  ]);
  return allowed.has(text) ? text : "";
}

function sanitizeAutofillDebugCounts(value) {
  const source = isPlainObject(value) ? value : {};
  return {
    candidates: sanitizeDebugCount(source.candidates),
    autoFill: sanitizeDebugCount(source.autoFill),
    needsConfirm: sanitizeDebugCount(source.needsConfirm),
    ignored: sanitizeDebugCount(source.ignored)
  };
}

function sanitizeAutofillDebugProfileSummary(value) {
  const source = isPlainObject(value) ? value : {};
  return {
    entryCount: sanitizeDebugCount(source.entryCount),
    categories: Array.isArray(source.categories)
      ? source.categories
          .filter(isPlainObject)
          .map((category) => ({
            category: sanitizeDebugText(category.category || "", 80),
            entryCount: sanitizeDebugCount(category.entryCount),
            labels: Array.isArray(category.labels)
              ? category.labels.map((label) => sanitizeDebugText(label, 120)).filter(Boolean).slice(0, 100)
              : []
          }))
          .filter((category) => category.category || category.entryCount > 0)
          .slice(0, 50)
      : []
  };
}

function sanitizeAutofillDebugAiUsage(value) {
  const source = isPlainObject(value) ? value : {};
  return {
    status: sanitizeDebugText(source.status || "idle", 40),
    attempted: Boolean(source.attempted),
    used: Boolean(source.used),
    fallback: Boolean(source.fallback),
    currentPhase: sanitizeDebugText(source.currentPhase || "", 60),
    usedPhases: sanitizeDebugTextList(source.usedPhases, 60, 20),
    fallbackReasons: Array.isArray(source.fallbackReasons)
      ? source.fallbackReasons
          .filter(isPlainObject)
          .map((reason) => ({
            phase: sanitizeDebugText(reason.phase || "", 60),
            reason: sanitizeDebugText(reason.reason || "", 180)
          }))
          .filter((reason) => reason.phase || reason.reason)
          .slice(0, 20)
      : [],
    notes: sanitizeDebugTextList(source.notes, 160, 20),
    fallbackReason: sanitizeDebugText(source.fallbackReason || "", 260),
    message: sanitizeDebugText(source.message || "", 300)
  };
}

function sanitizeAutofillDebugDiagnostics(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter(isPlainObject)
    .map((item) => ({
      fieldId: sanitizeDebugText(item.fieldId || "", 120),
      fieldLabel: sanitizeDebugText(item.fieldLabel || "", 120),
      fieldCategory: sanitizeDebugText(item.fieldCategory || "", 80),
      occurrenceIndex: sanitizeDebugCount(item.occurrenceIndex),
      occurrenceTotal: sanitizeDebugCount(item.occurrenceTotal),
      state: sanitizeDebugText(item.state || "", 40),
      reason: sanitizeDebugText(item.reason || "", 220),
      bestSourceLabel: sanitizeDebugText(item.bestSourceLabel || "", 120),
      bestSourceCategory: sanitizeDebugText(item.bestSourceCategory || "", 80),
      bestSourceSubsection: sanitizeDebugText(item.bestSourceSubsection || "", 80),
      bestScore: sanitizeDebugNullableNumber(item.bestScore)
    }))
    .slice(0, 500);
}

function sanitizeAutofillDebugCandidates(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter(isPlainObject)
    .map((item) => ({
      fieldId: sanitizeDebugText(item.fieldId || "", 120),
      fieldLabel: sanitizeDebugText(item.fieldLabel || "", 120),
      fieldCategory: sanitizeDebugText(item.fieldCategory || "", 80),
      sourceLabel: sanitizeDebugText(item.sourceLabel || "", 120),
      sourceCategory: sanitizeDebugText(item.sourceCategory || "", 80),
      sourceSubsection: sanitizeDebugText(item.sourceSubsection || "", 80),
      score: sanitizeDebugNumber(item.score),
      confidence: clampConfidence(item.confidence),
      writeMode: sanitizeDebugText(item.writeMode || "", 40),
      mappingSource: sanitizeDebugText(item.mappingSource || "", 120),
      shouldAutoFill: Boolean(item.shouldAutoFill),
      canAutoFill: Boolean(item.canAutoFill),
      alreadyMatches: Boolean(item.alreadyMatches),
      hasCurrentValue: Boolean(item.hasCurrentValue),
      warning: sanitizeDebugText(item.warning || "", 180),
      reason: sanitizeDebugText(item.reason || "", 180)
    }))
    .slice(0, 500);
}

function sanitizeAutofillDebugSummary(value) {
  if (!isPlainObject(value)) {
    return null;
  }
  return {
    attempted: sanitizeDebugCount(value.attempted),
    filled: sanitizeDebugCount(value.filled),
    failed: sanitizeDebugCount(value.failed),
    skipped: sanitizeDebugCount(value.skipped),
    pending: sanitizeDebugCount(value.pending),
    total: sanitizeDebugCount(value.total),
    message: sanitizeDebugText(value.message || "", 160),
    aiUsage: sanitizeAutofillDebugAiUsage(value.aiUsage)
  };
}

function sanitizeAutofillDebugResults(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter(isPlainObject)
    .map((item) => ({
      id: sanitizeDebugText(item.id || "", 120),
      ok: Boolean(item.ok),
      note: sanitizeDebugText(item.note || "", 180)
    }))
    .slice(0, 500);
}

function sanitizeDebugTextList(value, itemLength, maxItems) {
  return Array.isArray(value)
    ? value.map((item) => sanitizeDebugText(item, itemLength)).filter(Boolean).slice(0, maxItems)
    : [];
}

function sanitizeDebugCount(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 0;
  }
  return Math.max(0, Math.min(100000, Math.round(number)));
}

function sanitizeDebugNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 0;
  }
  return Math.max(-100000, Math.min(100000, number));
}

function sanitizeDebugNullableNumber(value) {
  if (value == null || value === "") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(-100000, Math.min(100000, number)) : null;
}

function sanitizeDebugText(value, maxLength = 220) {
  const text = String(value == null ? "" : value)
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim();
  if (!text) {
    return "";
  }

  const redacted = redactDebugSecrets(redactPersonalValues(text, Math.max(maxLength, 600)));
  return redacted.length > maxLength ? `${redacted.slice(0, maxLength)}...` : redacted;
}

function redactDebugSecrets(value) {
  return String(value || "")
    .replace(/((?:api[_ -]?key|authorization|bearer|access[_ -]?token|refresh[_ -]?token|password|secret)\s*[:=]\s*)([^,;\s]+)/gi, "$1【已隐藏】")
    .replace(/\b(?:sk|rk|pk)[_-][A-Za-z0-9_-]{8,}\b/g, "【已隐藏】")
    .replace(/\b(?:token|secret)[_-][A-Za-z0-9_-]{8,}\b/gi, "【已隐藏】");
}

function sanitizeDebugUrl(value) {
  const text = sanitizeDebugText(value, 800);
  if (!text) {
    return "";
  }

  try {
    const url = new URL(text);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return sanitizeDebugText(url.toString().replace(/\/$/, ""), 400);
  } catch {
    return sanitizeDebugText(text.replace(/[?#].*$/, ""), 400);
  }
}

function sanitizeDebugHostname(value, urlText = "") {
  const text = sanitizeDebugText(value, 160).toLowerCase();
  if (text) {
    return text.replace(/[^a-z0-9._:[\]-]/g, "").slice(0, 160);
  }
  try {
    return new URL(urlText).hostname.slice(0, 160);
  } catch {
    return "";
  }
}

async function saveProfilePanelState(payload) {
  const pageKey = normalizeProfilePanelStateKey(payload.pageKey || "");
  if (!pageKey || !chrome.storage.session) {
    return { saved: false };
  }

  const patch = isPlainObject(payload.patch) ? payload.patch : {};
  const result = await chrome.storage.session.get(PROFILE_PANEL_STATE_KEY);
  const allStates = result[PROFILE_PANEL_STATE_KEY] || {};
  allStates[pageKey] = {
    ...(allStates[pageKey] || {}),
    pageKey,
    ...patch,
    updatedAt: Date.now()
  };

  const entries = Object.entries(allStates)
    .sort((left, right) => Number(right[1]?.updatedAt || 0) - Number(left[1]?.updatedAt || 0))
    .slice(0, MAX_PROFILE_PANEL_STATE_ITEMS);
  await chrome.storage.session.set({ [PROFILE_PANEL_STATE_KEY]: Object.fromEntries(entries) });
  return { saved: true };
}

async function getProfilePanelState(payload) {
  const pageKey = normalizeProfilePanelStateKey(payload.pageKey || "");
  if (!pageKey || !chrome.storage.session) {
    return null;
  }

  const result = await chrome.storage.session.get(PROFILE_PANEL_STATE_KEY);
  return result[PROFILE_PANEL_STATE_KEY]?.[pageKey] || null;
}

function normalizeProfilePanelStateKey(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 800);
}

async function mapFields(payload) {
  const { scan } = payload;
  if (!scan || !Array.isArray(scan.fields)) {
    throw new Error("Missing scan result. Scan the current form first.");
  }

  const settings = await getSettings();
  const apiConfig = { ...settings.apiConfig, ...(payload.apiConfig || {}) };
  const profileCatalog = normalizeProvidedProfileCatalog(payload.profileCatalog);
  if (!profileCatalog) {
    throw new Error("Missing profile field catalog.");
  }

  const compactScan = {
    url: scan.url,
    hostname: scan.hostname,
    title: scan.title,
    fields: scan.fields.map(compactField)
  };

  const messages = buildMessages(profileCatalog, compactScan);
  const rawContent = await callAi(apiConfig, messages, {
    profile: profileCatalog,
    profileCatalog,
    scan: compactScan
  });
  const parsed = parseJsonFromText(rawContent);
  const mappings = annotateMappingsWithCatalog(normalizeAiMappings(parsed, compactScan.fields), profileCatalog);
  return {
    mappings,
    notes: Array.isArray(parsed?.notes) ? parsed.notes : [],
    raw: parsed
  };
}

async function analyzePageStructure(payload) {
  const { scan } = payload;
  if (!scan || !Array.isArray(scan.fields)) {
    throw new Error("Missing scan result. Scan the current form first.");
  }

  const settings = await getSettings();
  const apiConfig = { ...settings.apiConfig, ...(payload.apiConfig || {}) };
  const compactScan = {
    url: scan.url,
    hostname: scan.hostname,
    title: scan.title,
    siteAdapter: scan.siteAdapter || null,
    fields: scan.fields.map(compactField)
  };

  const messages = buildPageStructureMessages(compactScan);
  const rawContent = await callAi(apiConfig, messages, {
    profile: { fields: [] },
    profileCatalog: { fields: [] },
    scan: compactScan
  });
  const parsed = parseJsonFromText(rawContent);
  return normalizePageStructureAnalysis(parsed, compactScan.fields);
}

async function testApi(payload) {
  const settings = await getSettings();
  const apiConfig = { ...settings.apiConfig, ...(payload.apiConfig || {}) };
  const fakeProfile = {
    sections: [
      {
        key: "basic",
        title: "基本信息",
        fields: [
          {
            path: "profileV2.sections.basic.values[0]",
            label: "基本信息 / 姓名",
            aliases: ["姓名", "真实姓名", "基本信息"]
          }
        ]
      }
    ],
    fields: [
      {
        path: "profileV2.sections.basic.values[0]",
        label: "基本信息 / 姓名",
        aliases: ["姓名", "真实姓名", "基本信息"]
      }
    ]
  };
  const fakeScan = {
    url: "https://example.test/job",
    hostname: "example.test",
    title: "Test Form",
    fields: [
      {
        fieldId: "test_name",
        type: "text",
        label: "姓名",
        placeholder: "",
        required: true,
        section: "基本信息",
        nearbyText: "基本信息 姓名",
        options: []
      }
    ]
  };
  const messages = buildMessages(fakeProfile, fakeScan);
  const rawContent = await callAi(apiConfig, messages, {
    profile: fakeProfile,
    profileCatalog: fakeProfile,
    scan: fakeScan
  });
  const parsed = parseJsonFromText(rawContent);
  return {
    parsed,
    contentPreview: typeof rawContent === "string" ? rawContent.slice(0, 800) : String(rawContent).slice(0, 800)
  };
}

async function listModels(payload) {
  const settings = await getSettings();
  const apiConfig = { ...settings.apiConfig, ...(payload.apiConfig || {}) };
  const url = resolveModelListUrl(apiConfig);
  if (!url) {
    throw new Error(apiConfig.mode === "custom" ? "Custom API URL is required." : "API base URL is required.");
  }

  const headers = buildRequestHeaders({
    apiConfig,
    headerJson: apiConfig.mode === "custom" ? apiConfig.customHeadersJson : apiConfig.extraHeadersJson,
    includeContentType: false
  });

  const response = await fetch(url, {
    method: "GET",
    headers
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Model list request failed ${response.status}: ${text.slice(0, 500)}`);
  }

  const data = safeJsonParse(text);
  const source = extractModelListSource(data);
  const models = normalizeModelList(source);

  return {
    url,
    models
  };
}

function compactField(field) {
  return {
    fieldId: field.fieldId,
    type: field.type,
    label: sanitizePromptText(field.label, 220),
    placeholder: sanitizePromptText(field.placeholder, 160),
    name: sanitizeAttributeText(field.name),
    id: sanitizeAttributeText(field.id),
    required: field.required,
    disabled: field.disabled,
    readOnly: field.readOnly,
    canFill: field.canFill,
    section: sanitizePromptText(field.section, 220),
    nearbyText: sanitizePromptText(field.nearbyText, 420),
    groupText: sanitizePromptText(field.groupText, 360),
    cssPath: sanitizeAttributeText(field.cssPath),
    controlAdapterId: sanitizeAttributeText(field.controlAdapterId),
    controlAdapterName: sanitizePromptText(field.controlAdapterName, 120),
    siteAdapterId: sanitizeAttributeText(field.siteAdapterId),
    siteAdapterName: sanitizePromptText(field.siteAdapterName, 120),
    hasCurrentValue: Boolean(field.hasCurrentValue),
    options: Array.isArray(field.options) ? field.options.slice(0, 50).map(compactOption) : []
  };
}

function compactOption(option) {
  return {
    value: sanitizePromptText(option?.value, 120),
    label: sanitizePromptText(option?.label, 120)
  };
}

function normalizeProvidedProfileCatalog(profileCatalog) {
  if (!isPlainObject(profileCatalog) || !Array.isArray(profileCatalog.fields)) {
    return null;
  }

  const fields = profileCatalog.fields
    .map((field) => ({
      path: sanitizeAttributeText(field?.path || ""),
      label: sanitizePromptText(field?.label || "", 180),
      aliases: Array.isArray(field?.aliases)
        ? field.aliases.map((alias) => sanitizePromptText(alias, 120)).filter(Boolean).slice(0, 12)
        : []
    }))
    .filter((field) => field.path && field.label)
    .slice(0, 300);

  const sections = Array.isArray(profileCatalog.sections)
    ? profileCatalog.sections
        .map((section) => {
          const sectionFields = Array.isArray(section?.fields)
            ? section.fields
                .map((field) => fields.find((item) => item.path === sanitizeAttributeText(field?.path || "")))
                .filter(Boolean)
            : [];

          return {
            key: sanitizeAttributeText(section?.key || ""),
            title: sanitizePromptText(section?.title || "", 120),
            fields: sectionFields
          };
        })
        .filter((section) => section.title && section.fields.length > 0)
    : [];

  return {
    sections,
    fields
  };
}

function sanitizeAttributeText(value) {
  return sanitizePromptText(value, 120);
}

function sanitizePromptText(value, maxLength = 220) {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim();
  return redactPersonalValues(text, maxLength);
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function normalizeProfileV2(profileV2) {
  if (!isPlainObject(profileV2)) {
    return DEFAULT_PROFILE_V2;
  }

  const sections = isPlainObject(profileV2.sections) ? profileV2.sections : {};
  const normalizedSections = {};
  for (const [key, section] of Object.entries(sections)) {
    if (!isPlainObject(section)) {
      continue;
    }
    const cleanKey = sanitizeAttributeText(key || section.key || "");
    const title = sanitizePromptText(section.title || cleanKey, 120);
    if (!cleanKey || !title) {
      continue;
    }

    normalizedSections[cleanKey] = section.kind === "repeat"
      ? {
          key: cleanKey,
          title,
          kind: "repeat",
          items: Array.isArray(section.items)
            ? section.items.map(normalizeProfileV2Item).filter((item) => Object.keys(item.values).length > 0 || item.custom.length > 0)
            : []
        }
      : {
          key: cleanKey,
          title,
          kind: "simple",
          values: normalizeProfileV2Values(section.values),
          custom: normalizeProfileV2CustomRows(section.custom)
        };
  }

  return {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    updatedAt: sanitizePromptText(profileV2.updatedAt || "", 80),
    sections: normalizedSections,
    customSections: Array.isArray(profileV2.customSections)
      ? profileV2.customSections.map(normalizeProfileV2CustomSection).filter((section) => Object.keys(section.values).length > 0 || section.custom.length > 0)
      : []
  };
}

function normalizeProfileV2Item(item = {}) {
  return {
    title: sanitizePromptText(item.title || "", 120),
    values: normalizeProfileV2Values(item.values),
    custom: normalizeProfileV2CustomRows(item.custom)
  };
}

function normalizeProfileV2CustomSection(section = {}) {
  return {
    key: sanitizeAttributeText(section.key || "custom"),
    title: sanitizePromptText(section.title || "自定义资料", 120),
    kind: "simple",
    values: normalizeProfileV2Values(section.values),
    custom: normalizeProfileV2CustomRows(section.custom)
  };
}

function normalizeProfileV2Values(values) {
  const normalized = {};
  if (!isPlainObject(values)) {
    return normalized;
  }

  for (const [label, value] of Object.entries(values)) {
    const cleanLabel = sanitizePromptText(label, 120);
    const cleanValue = String(value == null ? "" : value).trim();
    if (cleanLabel && cleanValue) {
      normalized[cleanLabel] = cleanValue;
    }
  }
  return normalized;
}

function normalizeProfileV2CustomRows(rows) {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows
    .map((row) => ({
      label: sanitizePromptText(row?.label || "", 80),
      value: String(row?.value == null ? "" : row.value).trim()
    }))
    .filter((row) => row.label && row.value);
}

function redactPersonalValues(text, maxLength = 220) {
  if (!text) {
    return "";
  }

  const labelPatterns = [
    /((?:姓名|手机号码|手机号|联系电话|电话|电子邮箱|邮箱|邮件|证件号码|身份证号|出生日期|出生时间|毕业院校|专业|学历|学位|工作单位|实习\/实践单位|组织名称|职务|岗位|学校|籍贯|户口|居住地|地址|联系人|证书号|学历证书号|奖惩名称|奖惩单位|奖惩原因|自我评价|招聘信息来源|备注|高考所在地|高考分数|身高|体重|期望年收入|分数)(?:[^:：]{0,8})[：:]\s*)([^|；;，,\n]+)/g,
    /((?:是否[^:：\n]{0,40}[：:]\s*))([^\n]+)/g
  ];

  let redacted = text;
  for (const pattern of labelPatterns) {
    redacted = redacted.replace(pattern, (match, prefix) => {
      return `${prefix}【已隐藏】`;
    });
  }

  redacted = redacted.replace(/\b(?:\d{11}|\d{15,18}[Xx]?)\b/g, "【已隐藏】");
  redacted = redacted.replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "【已隐藏】");
  redacted = redacted.replace(/\b\d{4,}\b/g, (match) => (match.length >= 6 ? "【已隐藏】" : match));

  return redacted.length > maxLength ? `${redacted.slice(0, maxLength)}...` : redacted;
}

function buildMessages(profileCatalog, scan) {
  const systemPrompt = [
    "You are a form-field mapping engine for job application forms.",
    "Your task is to produce the primary field mappings for the current page.",
    "Local fallback rules will handle any remaining unmatched fields.",
    "Return strict JSON only. Do not include prose or explanations outside JSON.",
    "Privacy rule: you are not given the user's actual resume values, and you must not ask for, infer, copy, or output personal values.",
    "The profile field catalog contains sourcePath names and field labels only. All real values are withheld and will be resolved locally in the browser.",
    "Do not map file upload fields. Do not decide to submit the form.",
    "Prefer sourcePath. Use value only for non-personal constants when no sourcePath applies.",
    "If options are provided for a select/combobox, map to the relevant sourcePath; local code will match the user's value to the page option."
  ].join("\n");

  const userPrompt = [
    "Map fields from the current job application page to the local resume profile field catalog.",
    "",
    "Return JSON with this schema:",
    JSON.stringify(
      {
        mappings: [
          {
            fieldId: "field id from fields list",
            sourcePath: "exact path from local profile field catalog",
            value: "optional non-personal literal only when sourcePath is not enough",
            confidence: 0.95,
            reason: "short reason"
          }
        ],
        notes: ["optional warnings"]
      },
      null,
      2
    ),
    "",
    "Rules:",
    "- Use only fieldId values that exist in fields.",
    "- Set confidence from 0 to 1.",
    "- Precision is more important than coverage. If context is ambiguous, omit the mapping instead of guessing.",
    "- Required fields deserve careful mapping, but uncertainty must lower confidence.",
    "- For repeated sections like family father/mother, performance review rows, or education entries, use section, nearbyText, and groupText to select the right profile path.",
    "- In Chinese job application forms, generic labels such as 姓名、电话、工作单位、职务、地址 must follow their context: family member, emergency contact, reference/prover, performance review, current residence, hukou, native place, source place, or mailing address.",
    "- Do not map family/emergency/reference generic fields to the applicant's own basic information unless the page context is clearly the applicant profile.",
    "- For Chinese recruitment forms, common mappings include 姓名 -> 姓名, 手机号码 -> 手机号码/电话, 电子邮箱 -> 邮箱/电子邮箱, 毕业院校 -> 学校/毕业院校, 证书名称 -> 证书名称（技能名称）.",
    "- For user-defined fields, inspect customFields.* items by label and key. If a custom field matches, use sourcePath like customFields.basic[0].value.",
    "- For declarations asking yes/no questions, use declarations.* only if the question meaning clearly matches.",
    "- Do not output copied page values, existing field values, names, phone numbers, email addresses, ID numbers, schools, employers, addresses, or experience descriptions.",
    "",
    "Local profile field catalog. Values are intentionally omitted:",
    JSON.stringify(profileCatalog, null, 2),
    "",
    "Detected page fields JSON. Existing field values are intentionally omitted/redacted:",
    JSON.stringify(scan, null, 2)
  ].join("\n");

  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ];
}

function buildPageStructureMessages(scan) {
  const systemPrompt = [
    "You are a page-structure analyzer for job application forms.",
    "Your task is to normalize noisy detected web form metadata into readable form-field hints.",
    "Return strict JSON only. Do not include prose or explanations outside JSON.",
    "Privacy rule: the page may already contain user-entered values in nearby text, so never copy, infer, or output personal values.",
    "Only output structural labels, section names, control kind hints, and short non-sensitive notes.",
    "Do not decide to submit the form and do not map to a resume profile."
  ].join("\n");

  const userPrompt = [
    "Analyze the current job application page fields.",
    "",
    "Return JSON with this schema:",
    JSON.stringify(
      {
        siteType: "generic | zhiye | hotjob | ats | ant-design | element-ui | custom",
        confidence: 0.8,
        fieldHints: [
          {
            fieldId: "field id from fields list",
            label: "normalized visible label, no personal value",
            section: "normalized section name",
            controlKind: "text | textarea | select | search-select | radio | checkbox | date | file | unknown",
            confidence: 0.9,
            note: "short structural note"
          }
        ],
        notes: ["optional warnings"]
      },
      null,
      2
    ),
    "",
    "Rules:",
    "- Use only fieldId values that exist in fields.",
    "- If nearbyText contains a label and value, output only the label.",
    "- Prefer Chinese field labels when the page is Chinese.",
    "- For repeated sections, keep section names such as 基本信息、教育经历、实习经历、工作经历、绩效考核、专业资格、项目经历（包括项目经验）、家庭信息、附加问题.",
    "- If a field is a custom select/search input, set controlKind to search-select or select.",
    "- Do not output names, phone numbers, email addresses, ID numbers, schools, employers, addresses, dates of birth, or experience descriptions.",
    "",
    "Detected page fields JSON. Existing field values are omitted/redacted:",
    JSON.stringify(scan, null, 2)
  ].join("\n");

  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ];
}

async function callAi(apiConfig, messages, context) {
  if (apiConfig.mode === "custom") {
    return callCustomApi(apiConfig, messages, context);
  }
  return callOpenAiCompatible(apiConfig, messages);
}

async function callOpenAiCompatible(apiConfig, messages) {
  if (!apiConfig.baseUrl) {
    throw new Error("API base URL is required.");
  }
  if (!apiConfig.model) {
    throw new Error("Model name is required.");
  }

  const url = joinUrl(apiConfig.baseUrl, apiConfig.endpointPath || "/chat/completions");
  const headers = buildRequestHeaders({ apiConfig, headerJson: apiConfig.extraHeadersJson });

  const body = {
    model: apiConfig.model,
    messages,
    temperature: 0
  };

  if (apiConfig.useJsonResponseFormat) {
    body.response_format = { type: "json_object" };
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`API request failed ${response.status}: ${text.slice(0, 500)}`);
  }

  const data = safeJsonParse(text);
  if (!data) {
    return text;
  }

  const content = data?.choices?.[0]?.message?.content;
  if (Array.isArray(content)) {
    return content.map((item) => item.text || item.content || "").join("");
  }
  if (typeof content === "string") {
    return content;
  }

  return JSON.stringify(data);
}

async function callCustomApi(apiConfig, messages, context) {
  if (!apiConfig.customUrl) {
    throw new Error("Custom API URL is required.");
  }

  const headers = buildRequestHeaders({ apiConfig, headerJson: apiConfig.customHeadersJson });

  const body = renderTemplate(apiConfig.customBodyTemplate || DEFAULT_API_CONFIG.customBodyTemplate, {
    model: apiConfig.model || "",
    messages,
    systemPrompt: messages.find((message) => message.role === "system")?.content || "",
    userPrompt: messages.find((message) => message.role === "user")?.content || "",
    profile: context.profile,
    scan: context.scan
  });

  const response = await fetch(apiConfig.customUrl, {
    method: apiConfig.customMethod || "POST",
    headers,
    body
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Custom API request failed ${response.status}: ${text.slice(0, 500)}`);
  }

  const data = safeJsonParse(text);
  if (!data) {
    return text;
  }

  const content = apiConfig.customResponsePath ? getByPath(data, apiConfig.customResponsePath) : data;
  if (typeof content === "string") {
    return content;
  }
  return JSON.stringify(content);
}

function buildRequestHeaders({ apiConfig, headerJson, includeContentType = true }) {
  const headers = parseJsonObject(headerJson, "request headers");
  if (includeContentType && !Object.keys(headers).some((key) => key.toLowerCase() === "content-type")) {
    headers["content-type"] = "application/json";
  }
  if (apiConfig.apiKey && !Object.keys(headers).some((key) => key.toLowerCase() === "authorization")) {
    headers.authorization = `Bearer ${apiConfig.apiKey}`;
  }
  return headers;
}

function resolveModelListUrl(apiConfig) {
  if (apiConfig.mode === "openai-compatible") {
    return apiConfig.baseUrl ? joinUrl(apiConfig.baseUrl, "/models") : "";
  }

  const derived = deriveModelListUrl(apiConfig.customUrl || "");
  return derived;
}

function deriveModelListUrl(sourceUrl) {
  if (!sourceUrl) {
    return "";
  }

  try {
    const url = new URL(sourceUrl);
    if (url.pathname.endsWith("/chat/completions")) {
      url.pathname = url.pathname.replace(/\/chat\/completions$/, "/models");
      return url.toString();
    }
    if (url.pathname.endsWith("/completions")) {
      url.pathname = url.pathname.replace(/\/completions$/, "/models");
      return url.toString();
    }
    if (url.pathname.endsWith("/responses")) {
      url.pathname = url.pathname.replace(/\/responses$/, "/models");
      return url.toString();
    }
    if (!url.pathname || url.pathname === "/") {
      url.pathname = "/models";
      return url.toString();
    }
    url.pathname = "/models";
    return url.toString();
  } catch {
    return "";
  }
}

function extractModelListSource(data) {
  if (Array.isArray(data)) {
    return data;
  }
  if (Array.isArray(data?.data)) {
    return data.data;
  }
  if (Array.isArray(data?.models)) {
    return data.models;
  }
  if (Array.isArray(data?.items)) {
    return data.items;
  }
  if (Array.isArray(data?.result)) {
    return data.result;
  }
  if (Array.isArray(data?.choices)) {
    return data.choices;
  }
  if (data && typeof data === "object") {
    for (const key of ["data", "models", "items", "result", "list"]) {
      if (Array.isArray(data[key])) {
        return data[key];
      }
    }
  }

  throw new Error("Could not find a model array in the response.");
}

function normalizeModelList(source) {
  const items = Array.isArray(source) ? source : [];
  return items
    .map((item) => normalizeModelItem(item))
    .filter(Boolean);
}

function normalizeModelItem(item) {
  if (typeof item === "string") {
    const id = item.trim();
    return id ? { id, name: id } : null;
  }

  if (!item || typeof item !== "object") {
    return null;
  }

  const id = String(item.id || item.model || item.name || item.slug || item.value || "").trim();
  if (!id) {
    return null;
  }

  return {
    id,
    name: String(item.display_name || item.name || item.id || id).trim() || id
  };
}

function joinUrl(baseUrl, path) {
  const normalizedBase = String(baseUrl).replace(/\/+$/, "");
  const normalizedPath = String(path || "").replace(/^\/?/, "/");
  return `${normalizedBase}${normalizedPath}`;
}

function parseJsonObject(value, label) {
  if (!value || !String(value).trim()) {
    return {};
  }

  const parsed = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return parsed;
}

function renderTemplate(template, values) {
  const replacements = {
    model: values.model,
    modelJson: JSON.stringify(values.model),
    messagesJson: JSON.stringify(values.messages),
    systemPrompt: values.systemPrompt,
    systemPromptJson: JSON.stringify(values.systemPrompt),
    userPrompt: values.userPrompt,
    userPromptJson: JSON.stringify(values.userPrompt),
    prompt: values.userPrompt,
    promptJson: JSON.stringify(values.userPrompt),
    profileJson: JSON.stringify(values.profile),
    profileCatalogJson: JSON.stringify(values.profileCatalog || values.profile),
    fieldsJson: JSON.stringify(values.scan.fields),
    scanJson: JSON.stringify(values.scan)
  };

  return String(template).replace(/\{\{(\w+)\}\}/g, (_match, key) => {
    if (!Object.prototype.hasOwnProperty.call(replacements, key)) {
      throw new Error(`Unknown custom API template variable: ${key}`);
    }
    return replacements[key];
  });
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function parseJsonFromText(text) {
  if (typeof text !== "string") {
    return text;
  }

  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

  const direct = safeJsonParse(cleaned);
  if (direct) {
    return direct;
  }

  const jsonCandidate = extractFirstJson(cleaned);
  const parsed = jsonCandidate ? safeJsonParse(jsonCandidate) : null;
  if (!parsed) {
    throw new Error(`AI response is not valid JSON: ${cleaned.slice(0, 500)}`);
  }

  return parsed;
}

function normalizePageStructureAnalysis(parsed, fields) {
  const validFieldIds = new Set(fields.map((field) => field.fieldId));
  const fieldHintsSource = Array.isArray(parsed?.fieldHints)
    ? parsed.fieldHints
    : Array.isArray(parsed?.fields)
      ? parsed.fields
      : [];

  const fieldHints = fieldHintsSource
    .filter((hint) => hint && validFieldIds.has(String(hint.fieldId || "")))
    .map((hint) => ({
      fieldId: String(hint.fieldId),
      label: sanitizePromptText(hint.label || hint.normalizedLabel || "", 120),
      section: sanitizePromptText(hint.section || hint.group || "", 120),
      controlKind: sanitizeAttributeText(hint.controlKind || hint.type || "unknown"),
      confidence: clampConfidence(hint.confidence),
      note: sanitizePromptText(hint.note || hint.reason || "", 160)
    }))
    .filter((hint) => hint.label || hint.section || hint.controlKind !== "unknown");

  return {
    siteType: sanitizeAttributeText(parsed?.siteType || parsed?.type || "generic"),
    confidence: clampConfidence(parsed?.confidence),
    fieldHints,
    notes: Array.isArray(parsed?.notes)
      ? parsed.notes.map((note) => sanitizePromptText(note, 160)).filter(Boolean).slice(0, 8)
      : [],
    raw: parsed
  };
}

function extractFirstJson(text) {
  const start = text.search(/[\[{]/);
  if (start < 0) {
    return "";
  }

  const opener = text[start];
  const closer = opener === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const char = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === opener) {
      depth += 1;
    } else if (char === closer) {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return "";
}

function normalizeAiMappings(parsed, fields) {
  let mappings = [];

  if (Array.isArray(parsed)) {
    mappings = parsed;
  } else if (Array.isArray(parsed?.mappings)) {
    mappings = parsed.mappings;
  } else if (parsed && typeof parsed === "object") {
    mappings = Object.entries(parsed).map(([fieldId, value]) => ({
      fieldId,
      ...(value && typeof value === "object" ? value : { value })
    }));
  }

  const validFieldIds = new Set(fields.map((field) => field.fieldId));
  return mappings
    .filter((mapping) => mapping && validFieldIds.has(mapping.fieldId))
    .map((mapping) => {
      const normalized = {
        fieldId: String(mapping.fieldId),
        sourcePath: mapping.sourcePath || mapping.source || mapping.path || "",
        confidence: clampConfidence(mapping.confidence),
        reason: String(mapping.reason || "")
      };

      if (
        !normalized.sourcePath &&
        Object.prototype.hasOwnProperty.call(mapping, "value") &&
        mapping.value !== undefined
      ) {
        normalized.value = mapping.value;
      }

      return normalized;
    });
}

function annotateMappingsWithCatalog(mappings, profileCatalog) {
  const catalogFields = Array.isArray(profileCatalog?.fields) ? profileCatalog.fields : [];
  const sections = Array.isArray(profileCatalog?.sections) ? profileCatalog.sections : [];
  const fieldByPath = new Map(catalogFields.map((field) => [field.path, field]));
  const sectionByPath = new Map();

  for (const section of sections) {
    const fields = Array.isArray(section.fields) ? section.fields : [];
    for (const field of fields) {
      sectionByPath.set(field.path, section.title || "");
    }
  }

  return mappings.map((mapping) => {
    const catalogField = fieldByPath.get(mapping.sourcePath);
    if (!catalogField) {
      return mapping;
    }

    return {
      ...mapping,
      sourceLabel: catalogField.label || "",
      sourceSection: sectionByPath.get(mapping.sourcePath) || ""
    };
  });
}

function clampConfidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 0.5;
  }
  return Math.max(0, Math.min(1, number));
}

function getByPath(source, path) {
  const parts = String(path)
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);

  let current = source;
  for (const part of parts) {
    if (current == null) {
      return undefined;
    }
    current = current[part];
  }
  return current;
}
