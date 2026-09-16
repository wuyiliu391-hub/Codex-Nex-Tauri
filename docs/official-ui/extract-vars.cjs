const fs = require("fs");
const path = require("path");
const dir = process.argv[2];
const outDir = process.argv[3];
const files = [
  "app-dddf03d14541.css",
  "app-primary-42ed0a4bb496.css",
  "app-initial-a09fe9cd72bc.css",
];
const varRe = /(--[a-zA-Z0-9_-]+)\s*:\s*([^;{}]+)/g;
const themeBlocks = [];
for (const f of files) {
  const p = path.join(dir, f);
  if (!fs.existsSync(p)) { console.error("missing", f); continue; }
  const css = fs.readFileSync(p, "utf8");
  // find :root and :root[data-theme] / .dark blocks roughly
  const roots = [...css.matchAll(/(:root(?:\[[^\]]+\])?|html\.dark|\.dark\b)[^{]*\{([^}]{0,8000})\}/g)];
  for (const m of roots) {
    const selector = m[1];
    const body = m[2];
    const vars = {};
    let vm;
    varRe.lastIndex = 0;
    while ((vm = varRe.exec(body))) {
      vars[vm[1].trim()] = vm[2].trim();
    }
    if (Object.keys(vars).length) themeBlocks.push({ file: f, selector, vars });
  }
}
// union of all vars on :root
const rootVars = {};
for (const b of themeBlocks) {
  if (b.selector.startsWith(":root") && !b.selector.includes("dark") && !b.selector.includes("data-theme")) {
    Object.assign(rootVars, b.vars);
  }
}
const darkVars = {};
for (const b of themeBlocks) {
  if (/dark|data-theme/.test(b.selector)) Object.assign(darkVars, b.vars);
}
fs.writeFileSync(path.join(outDir, "css-vars-root.json"), JSON.stringify(rootVars, null, 2));
fs.writeFileSync(path.join(outDir, "css-vars-dark.json"), JSON.stringify(darkVars, null, 2));
fs.writeFileSync(path.join(outDir, "css-theme-blocks.json"), JSON.stringify(themeBlocks.map(b => ({file:b.file, selector:b.selector, count:Object.keys(b.vars).length})), null, 2));
console.log("root vars", Object.keys(rootVars).length);
console.log("dark vars", Object.keys(darkVars).length);
console.log("theme blocks", themeBlocks.length);
console.log("sample root", Object.entries(rootVars).slice(0, 15));
