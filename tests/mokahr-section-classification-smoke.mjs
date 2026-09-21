import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../src/content.js", import.meta.url), "utf8");

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing production helper ${name}`);
  const brace = source.indexOf("{", start);
  let depth = 0;
  for (let index = brace; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`unterminated production helper ${name}`);
}

function loadFunction(name, context = {}) {
  return vm.runInNewContext(`(${extractFunction(name)})`, context);
}

const normalizeMokaSectionTitle = loadFunction("normalizeMokaSectionTitle");
const getMokaGroupedDateLabel = loadFunction("getMokaGroupedDateLabel");
const getMokaDateComponent = loadFunction("getMokaDateComponent");
const getEntryOccurrenceIndex = loadFunction("getEntryOccurrenceIndex");
const getMokaNativeDateControlInfo = loadFunction("getMokaNativeDateControlInfo", {
  isControlVisible: () => true
});
const occurrenceContext = {};
vm.runInNewContext(
  `${extractFunction("getEntryOccurrenceIndex")}\n${extractFunction("isRepeatOccurrenceCompatible")}\nthis.isCompatible = isRepeatOccurrenceCompatible;`,
  occurrenceContext
);

assert.equal(normalizeMokaSectionTitle("教育背景添加"), "教育经历");
assert.equal(normalizeMokaSectionTitle("实习经历 添加"), "实习经历");
assert.equal(normalizeMokaSectionTitle("项目经验添加"), "项目经历");
assert.equal(normalizeMokaSectionTitle("语言能力添加"), "语言能力");
assert.equal(normalizeMokaSectionTitle("获奖经历添加"), "奖惩情况");

assert.deepEqual(
  [0, 1, 2, 3].map((index) => getMokaGroupedDateLabel("起止时间", index, 4)),
  ["开始时间年", "开始时间月", "结束时间年", "结束时间月"]
);
assert.equal(getMokaGroupedDateLabel("项目名称", 0, 1), "");
assert.deepEqual(
  [0, 1].map((index) => getMokaGroupedDateLabel("获奖时间", index, 2)),
  ["奖惩时间年", "奖惩时间月"]
);

assert.equal(getMokaDateComponent("2026-07", "开始时间年"), "2026");
assert.equal(getMokaDateComponent("2026年07月", "开始时间月"), "7");
assert.equal(getMokaDateComponent("2026-08", "结束时间月"), "8");
assert.equal(getMokaDateComponent("2025-11", "奖惩时间月"), "11");
assert.equal(getMokaDateComponent("2026-08", "结束时间"), "");

assert.equal(
  getEntryOccurrenceIndex({ valuePath: { itemIndex: 2 }, subsection: "标题中可能包含 2026" }),
  3,
  "repeat matching must use the stored profile item index instead of parsing digits from a title"
);

const dateControls = Array.from({ length: 4 }, () => ({ contains: () => false }));
const dateContainer = { querySelectorAll: () => dateControls };
const nativeDateInfo = getMokaNativeDateControlInfo(dateContainer, dateControls[2]);
assert.equal(nativeDateInfo.index, 2, "Mokahr date groups must preserve the native year/month position");
assert.equal(nativeDateInfo.total, 4, "Mokahr date groups must preserve all four date controls");

const mokaProjectField = {
  repeatItemIndex: 2,
  siteAdapterId: "moka",
  inferredCategory: "项目经历"
};
assert.equal(occurrenceContext.isCompatible(mokaProjectField, { valuePath: { itemIndex: 1 } }, "项目经历"), true);
assert.equal(occurrenceContext.isCompatible(mokaProjectField, { valuePath: { itemIndex: 0 } }, "项目经历"), false);

assert.match(source, /closest\("\[class\*='apply-block-'\]"\)/, "Mokahr fields must bind to their own block");
assert.match(source, /querySelector\(":scope > \[class\*='blockTitle-'\]"\)/, "Mokahr must use the direct block heading");
assert.match(source, /const useSemanticGroupContext =/, "semantic matching must not reuse broad non-repeat group text");
assert.match(source, /getMokaNativeDateControlInfo\(container, element\)/, "Mokahr date labels must use native control order");
assert.match(source, /id: "moka-sd-select"/, "Mokahr SD selects must use a dedicated control adapter");
assert.match(source, /getFieldControlAdapter\(element\)\?\.id === "moka-sd-select"/, "Mokahr selects must choose an option instead of writing raw input text");
assert.match(source, /repeatItemIndex: repeatItem\.index/, "Mokahr fields must retain their repeat-record index");
assert.match(source, /return fieldIndex === entryIndex \? 24 : -1000/, "Mokahr repeat records must reject cross-record matches");
assert.match(source, /if \(!isRepeatOccurrenceCompatible\(field, entry, fieldCategory\)\)/, "local and AI mappings must enforce repeat-record boundaries");
const manifest = JSON.parse(fs.readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
const scriptVersion = source.match(/const SCRIPT_VERSION = "([^"]+)"/)[1];
assert.ok(scriptVersion.startsWith(`${manifest.version}-`), 'manifest and injected script version must stay in sync');
assert.notEqual(scriptVersion, '1.1.5-mokahr-strict-sections', 'the old matcher must not remain cached');

console.log("mokahr-section-classification-smoke: ok");
