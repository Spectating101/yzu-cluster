const fs = require("fs");
const { parse } = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const GLOBALS = new Set(("window document console Date Math JSON Number String Array Object Set Map Promise setTimeout clearTimeout setInterval clearInterval fetch URL URLSearchParams Intl encodeURIComponent decodeURIComponent encodeURI decodeURI sessionStorage localStorage navigator location Boolean Error TypeError RangeError RegExp Symbol parseInt parseFloat isNaN isFinite Infinity NaN undefined globalThis requestAnimationFrame cancelAnimationFrame AbortController Blob FormData structuredClone queueMicrotask performance history Event CustomEvent KeyboardEvent HTMLElement Node Element getComputedStyle alert confirm prompt TextEncoder TextDecoder crypto BigInt WeakMap WeakSet Reflect Proxy process atob btoa File FileReader Headers Request Response ResizeObserver IntersectionObserver MutationObserver matchMedia scrollTo open close self addEventListener removeEventListener Image DOMParser XMLHttpRequest WebSocket EventSource BroadcastChannel Worker caches indexedDB Uint8Array Float64Array ArrayBuffer DataView arguments require module exports __dirname import").split(" "));
let problems = 0;
for (const file of process.argv.slice(2)) {
  const code = fs.readFileSync(file, "utf8");
  let ast;
  try { ast = parse(code, { sourceType: "module", plugins: ["jsx"] }); } catch (e) { console.log(`${file}: PARSE ${e.message}`); problems++; continue; }
  const seen = new Set();
  traverse(ast, {
    ReferencedIdentifier(path) {
      const name = path.node.name;
      if (path.parentPath.isJSXMemberExpression() || path.isJSXIdentifier() && /^[a-z]/.test(name)) return;
      if (path.scope.hasBinding(name, true) || GLOBALS.has(name)) return;
      const key = `${name}:${path.node.loc.start.line}`;
      if (seen.has(name)) return;
      seen.add(name);
      console.log(`${file}:${path.node.loc.start.line} undefined '${name}'`);
      problems++;
    },
  });
}
console.log(problems ? `${problems} problem(s)` : "no undefined names");
