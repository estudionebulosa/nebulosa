/* Runtime smoke test for the admin app: executes the built page's inline JS
 * in a minimal DOM sandbox for every tab/view, catching render-time errors.
 * Usage: node tools/admin-smoke.mjs   (needs _site/admin/index.html) */
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync("_site/admin/index.html", "utf8");
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
if (scripts.length !== 2) {
  console.error("FAIL: expected 2 inline scripts, found", scripts.length);
  process.exit(1);
}

function makeEl(id) {
  return {
    id,
    innerHTML: "",
    textContent: "",
    className: "",
    dataset: {},
    classList: { toggle() {}, add() {}, remove() {}, contains: () => false },
    addEventListener() {},
    appendChild() {},
    value: "",
  };
}

const scenarios = [
  ["artículos (form)", "#articles/0/form/0"],
  ["artículos ES idx0 (yaml)", "#articles/0/yaml/0"],
  ["artículos idx1 (body)", "#articles/1/body/0"],
  ["global", "#global/0/form/0"],
  ["registry", "#registry/0/form/0"],
  ["plantillas", "#templates/0/form/1"],
  ["preview", "#preview/1/form/0"],
  ["sin hash (defaults)", ""],
];

let failed = 0;
for (const [name, hash] of scenarios) {
  const els = { main: makeEl("main"), status: makeEl("status"), tabs: makeEl("tabs") };
  const sandbox = {
    window: {},
    document: {
      getElementById: (id) => els[id] || null,
      querySelectorAll: () => [],
      querySelector: () => null,
      addEventListener() {},
    },
    location: { hash, reload() {} },
    fetch: () => Promise.resolve({ json: () => Promise.resolve({ ok: true, yaml: "k: v\n" }) }),
    confirm: () => true,
    prompt: () => null,
    alert: () => {},
    console,
    setTimeout: () => 0,
    Math,
    JSON,
    Promise,
    String,
    Number,
    Array,
    Object,
    Set,
    RegExp,
    Error,
  };
  vm.createContext(sandbox);
  try {
    vm.runInContext(scripts[0], sandbox, { filename: "payload.js" });
    vm.runInContext(scripts[1], sandbox, { filename: "admin-app.js" });
    // allow async loadYaml to settle
    await new Promise((r) => setTimeout(r, 30));
    const len = els.main.innerHTML.length;
    if (len < 50) throw new Error("render produced empty output (" + len + " bytes)");
    console.log("PASS", name.padEnd(26), len, "bytes");
  } catch (e) {
    failed++;
    console.log("FAIL", name.padEnd(26), e.message);
  }
}
console.log(failed ? `\n${failed} scenario(s) FAILED` : "\nAll scenarios OK");
process.exit(failed ? 1 : 0);
