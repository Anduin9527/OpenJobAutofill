import assert from "node:assert/strict";
import fs from "node:fs";

const contentSource = fs.readFileSync(new URL("../src/content.js", import.meta.url), "utf8");
const exportFunctionStart = contentSource.indexOf("async function getAutofillDebugSnapshotForExport()");
const exportFunctionEnd = contentSource.indexOf("function queueAutofillDebugPersistence()", exportFunctionStart);
const exportFunctionSource = contentSource.slice(exportFunctionStart, exportFunctionEnd);
assert.match(exportFunctionSource, /await autofillDebugPersistPromise/, "debug export must wait for background sanitization");
assert.doesNotMatch(exportFunctionSource, /return current/, "debug export must not return the raw in-page snapshot");

const DEBUG_HISTORY_KEY = "OJAF_AUTOFILL_DEBUG_HISTORY";
const messageListeners = [];
const installedListeners = [];
const storageState = new Map();

function getStoredValue(keys) {
  if (typeof keys === "string") {
    return { [keys]: storageState.get(keys) };
  }
  if (Array.isArray(keys)) {
    return Object.fromEntries(keys.map((key) => [key, storageState.get(key)]));
  }
  if (keys && typeof keys === "object") {
    return Object.fromEntries(Object.keys(keys).map((key) => [key, storageState.get(key)]));
  }
  return Object.fromEntries(storageState.entries());
}

const storageLocal = {
  async get(keys) {
    return getStoredValue(keys);
  },
  async set(values) {
    for (const [key, value] of Object.entries(values)) {
      storageState.set(key, value);
    }
  },
  async remove(keys) {
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      storageState.delete(key);
    }
  },
  async clear() {
    storageState.clear();
  }
};

globalThis.chrome = {
  runtime: {
    lastError: undefined,
    onInstalled: {
      addListener(listener) {
        installedListeners.push(listener);
      }
    },
    onMessage: {
      addListener(listener) {
        messageListeners.push(listener);
      }
    },
    async openOptionsPage() {}
  },
  storage: {
    local: storageLocal,
    session: storageLocal
  }
};

await import(new URL("../src/background.js", import.meta.url));
assert.equal(messageListeners.length, 1, "background message router should register once");
assert.equal(installedListeners.length, 1, "background install handler should register once");

function dispatch(message) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (response) => {
      settled = true;
      resolve(response);
    };

    try {
      const result = messageListeners[0](message, {}, finish);
      if (result !== true && !settled) {
        resolve(result);
      }
    } catch (error) {
      reject(error);
    }
  });
}

function createRawSnapshot(index) {
  return {
    version: "test",
    page: {
      url: `https://jobs.example/apply?token=raw-token-${index}&name=Alice#form`,
      title: `Application ${index}`,
      hostname: "jobs.example"
    },
    generatedAt: `2026-08-26T00:00:0${index}.000Z`,
    profileSummary: {
      entryCount: 1,
      categories: [{ category: "项目经历", entryCount: 1, labels: ["项目名称"] }]
    },
    scan: {
      fieldCount: 1,
      fields: [
        {
          fieldId: `field-${index}`,
          label: "项目中职责",
          type: "textarea",
          section: `section-secret-${index}`,
          groupText: `rendered-select-secret-${index}`,
          value: `form-value-${index}`,
          currentValue: `current-value-${index}`
        }
      ]
    },
    candidates: [
      {
        fieldId: `field-${index}`,
        fieldLabel: "项目中职责",
        sourceLabel: "项目内容",
        value: `candidate-value-${index}`,
        apiKey: `sk-test-secret-${index}`,
        currentValue: `current-value-${index}`,
        score: 80,
        confidence: 0.8,
        shouldAutoFill: true
      }
    ],
    summary: {
      filled: 1,
      value: `summary-value-${index}`,
      apiKey: `sk-summary-secret-${index}`
    }
  };
}

function assertNoSensitiveKeys(value) {
  if (!value || typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(assertNoSensitiveKeys);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    assert.equal(
      ["value", "currentValue", "apiKey", "accessToken", "refreshToken", "password", "secret"].includes(key),
      false,
      `sensitive key ${key} must not be returned`
    );
    assertNoSensitiveKeys(child);
  }
}

await storageLocal.set({
  [DEBUG_HISTORY_KEY]: Array.from({ length: 7 }, (_unused, index) => createRawSnapshot(index))
});

const listed = await dispatch({ type: "OJAF_GET_DEBUG_HISTORY" });
assert.equal(listed.ok, true, "get history message should succeed");
assert.equal(listed.data.count, 5, "get history should cap results at five entries");
assert.equal(listed.data.max, 5, "get history should expose the cap");
assert.equal(listed.data.history.length, 5);
assert.equal(listed.data.history[0].page.url, "https://jobs.example/apply", "URL query/hash must be omitted");
assertNoSensitiveKeys(listed.data);
assert.doesNotMatch(JSON.stringify(listed.data), /raw-token|form-value|candidate-value|sk-test-secret|summary-value|section-secret|rendered-select-secret/);

const cleanedStorage = storageState.get(DEBUG_HISTORY_KEY);
assert.equal(cleanedStorage.length, 5, "reading history should persist the capped, cleaned form");
assertNoSensitiveKeys(cleanedStorage);

const saved = await dispatch({
  type: "OJAF_SAVE_DEBUG_SNAPSHOT",
  payload: {
    snapshot: {
      ...createRawSnapshot(99),
      generatedAt: "2026-08-26T00:00:099.000Z",
      value: "top-level-form-value",
      apiKey: "sk-top-level-secret"
    }
  }
});
assert.equal(saved.ok, true, "save snapshot message should succeed");
assert.equal(saved.data.saved, true);
assert.equal(saved.data.count, 5, "saving should retain only the latest five entries");
assert.equal(saved.data.history, undefined, "save response should not expose an unbounded history");
assertNoSensitiveKeys(saved.data);
assert.doesNotMatch(JSON.stringify(saved.data), /top-level-form-value|sk-top-level-secret/);
assert.equal(storageState.get(DEBUG_HISTORY_KEY).length, 5);

const cleared = await dispatch({ type: "OJAF_CLEAR_DEBUG_HISTORY" });
assert.equal(cleared.ok, true, "clear history message should succeed");
assert.equal(cleared.data.cleared, true);
assert.equal(cleared.data.count, 5, "clear should report the number of removed entries");
assert.equal(storageState.has(DEBUG_HISTORY_KEY), false, "clear should remove the history key");

const afterClear = await dispatch({ type: "OJAF_GET_DEBUG_HISTORY" });
assert.equal(afterClear.ok, true);
assert.deepEqual(afterClear.data.history, []);
assert.equal(afterClear.data.count, 0);

console.log("debug-log-background-smoke: ok");
