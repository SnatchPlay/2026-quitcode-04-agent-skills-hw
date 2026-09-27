#!/usr/bin/env node
// Static check of a Next.js project against the team's Next.js <-> n8n contract.
// Node built-ins only. Never prints values of secrets or request bodies.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const HELP = `check-contract.mjs — static check of the Next.js <-> n8n contract

Usage:
  node check-contract.mjs [--root <dir>] [--changed-since <git-ref>]
  node check-contract.mjs --help

  --root <dir>             project to check (default: current directory)
  --changed-since <ref>    only files changed after <ref> (plus untracked files); in files that
                           already existed, only findings on changed lines count
  -h, --help               this help

Scanned: app/ lib/ components/ proxy.ts middleware.ts next.config.* .env.example
Ignored: node_modules/ .next/ .claude/ tools/ docs/

Checks (each prints PASS, FAIL or N/A; FAIL lists file:line):
  C1   no n8n test URL (/webhook-test/) in code or .env.example
  C2   no NEXT_PUBLIC_N8N_* variables
  C3   fetch to n8n only in lib/n8n/client.ts, which starts with import "server-only"
  C4   every fetch to n8n has signal: AbortSignal.timeout(...) in its own options
  C5   every fetch to n8n sends x-n8n-token, idempotency-key and x-correlation-id
  C6   a "use server" file calls n8n (the client module, or a helper that calls it) only inside after()
  C7   callback route reads request.text() and parses JSON only after timingSafeEqual
  C8   signature compared with timingSafeEqual after a length check, never with === / !==
  C9   callback route rejects x-n8n-timestamp outside a +-300 s window
  C10  callback route rejects bodies over 64 KB with 413
  C11  no export const runtime = "edge"
  C12  .env.example has the 4 contract keys (secrets change-me-..., base URL ends with /webhook);
       code and .env.example use no other N8N_* names
  C13  console.* in n8n code never receives bodies, form data, PII, tokens or signatures

Exit code: 0 — no FAIL; 1 — at least one FAIL; 2 — usage error.`;

// ---------------------------------------------------------------- arguments
const argv = process.argv.slice(2);
let root = process.cwd();
let changedSince = null;
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  if (arg === "-h" || arg === "--help") {
    console.log(HELP);
    process.exit(0);
  } else if (arg === "--root" && argv[i + 1]) root = argv[++i];
  else if (arg === "--changed-since" && argv[i + 1]) changedSince = argv[++i];
  else {
    console.error(`Unknown or incomplete argument: ${arg}\n\n${HELP}`);
    process.exit(2);
  }
}
if (!existsSync(root) || !statSync(root).isDirectory()) {
  console.error(`--root is not a directory: ${root}`);
  process.exit(2);
}

// ---------------------------------------------------------------- files
const CODE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const IGNORED_DIRS = new Set(["node_modules", ".next", ".claude", "tools", "docs", ".git"]);

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (IGNORED_DIRS.has(entry.name)) return [];
    const full = join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : CODE_EXT.test(entry.name) ? [full] : [];
  });
}

const rel = (file) => relative(root, file).split(sep).join("/");
const codeFiles = [
  ...["app", "lib", "components"].flatMap((d) => walk(join(root, d))),
  ...readdirSync(root).filter((n) => /^(proxy|middleware)\.(ts|js)$|^next\.config\./.test(n)).map((n) => join(root, n)),
].map(rel);
const envExample = existsSync(join(root, ".env.example")) ? ".env.example" : null;

const sources = new Map();
const read = (file) => {
  if (!sources.has(file)) sources.set(file, readFileSync(join(root, file), "utf8"));
  return sources.get(file);
};

// ---------------------------------------------------------------- --changed-since
let changed = null; // Map<file, Set<line> | "all">
if (changedSince) {
  const git = (args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  try {
    git(["rev-parse", "--verify", `${changedSince}^{commit}`]);
  } catch {
    console.error(`--changed-since: not a git ref in ${root}: ${changedSince}`);
    process.exit(2);
  }
  changed = new Map();
  let current = null;
  for (const line of git(["diff", "-U0", "--no-color", changedSince, "--"]).split("\n")) {
    if (line.startsWith("+++ ")) {
      current = line === "+++ /dev/null" ? null : line.slice(6);
      if (current && !changed.has(current)) changed.set(current, new Set());
    } else if (current && line.startsWith("@@")) {
      const m = /\+(\d+)(?:,(\d+))?/.exec(line);
      const start = Number(m[1]);
      const count = m[2] === undefined ? 1 : Number(m[2]);
      for (let n = start; n < start + count; n++) changed.get(current).add(n);
    }
  }
  for (const file of git(["ls-files", "--others", "--exclude-standard"]).split("\n").filter(Boolean)) {
    changed.set(file, "all");
  }
}
const inScope = (file) => !changed || changed.has(file);
const counts = (finding) => {
  if (!changed) return true;
  const lines = changed.get(finding.file);
  if (!lines) return false;
  if (lines === "all" || finding.line === 0) return true;
  for (let n = finding.line; n <= (finding.endLine ?? finding.line); n++) if (lines.has(n)) return true;
  return false;
};

// ---------------------------------------------------------------- source helpers
// Blank out comments (keep strings and newlines) so that commented-out code never satisfies a check.
function stripComments(src) {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === "/" && n === "/") {
      while (i < src.length && src[i] !== "\n") {
        out += " ";
        i++;
      }
    } else if (c === "/" && n === "*") {
      out += "  ";
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) {
        out += src[i] === "\n" ? "\n" : " ";
        i++;
      }
      out += "  ";
      i += 2;
    } else if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      out += c;
      i++;
      while (i < src.length && src[i] !== quote) {
        const step = src[i] === "\\" ? 2 : 1;
        out += src.slice(i, i + step);
        i += step;
      }
      out += src[i] ?? "";
      i++;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

const codeCache = new Map();
const code = (file) => {
  if (!codeCache.has(file)) codeCache.set(file, stripComments(read(file)));
  return codeCache.get(file);
};
const lineAt = (text, index) => text.slice(0, index).split("\n").length;

// Index just after the bracket that closes the one at `open`, skipping strings.
function matchClose(text, open) {
  const pairs = { "(": ")", "{": "}", "[": "]" };
  const stack = [pairs[text[open]]];
  let i = open + 1;
  while (i < text.length && stack.length) {
    const c = text[i];
    if (c === '"' || c === "'" || c === "`") {
      const q = c;
      i++;
      while (i < text.length && text[i] !== q) i += text[i] === "\\" ? 2 : 1;
    } else if (pairs[c]) stack.push(pairs[c]);
    else if (c === stack[stack.length - 1]) stack.pop();
    i++;
  }
  return i;
}

function calls(text, name) {
  const re = new RegExp(`(?<![\\w$.])${name.replace(/[.$]/g, "\\$&")}\\s*\\(`, "g");
  const found = [];
  for (let m; (m = re.exec(text)); ) {
    const open = m.index + m[0].length - 1;
    const end = matchClose(text, open);
    found.push({ start: m.index, end, args: text.slice(open + 1, end - 1) });
  }
  return found;
}

// Source of `const|let|var NAME = …` or `function NAME(…) {…}` in the file, to resolve identifiers.
function definition(text, name) {
  const decl = new RegExp(`(?:const|let|var)\\s+${name}\\s*(?::[^=]+)?=\\s*`).exec(text);
  if (decl) {
    let i = decl.index + decl[0].length;
    const start = i;
    while (i < text.length && !/[;\n]/.test(text[i])) i = "({[".includes(text[i]) ? matchClose(text, i) : i + 1;
    return text.slice(start, i);
  }
  const fn = new RegExp(`function\\s+${name}\\s*\\(`).exec(text);
  if (fn) {
    const body = text.indexOf("{", matchClose(text, fn.index + fn[0].length - 1));
    return text.slice(fn.index, matchClose(text, body));
  }
  return null;
}

// Names of functions in `text` whose own body contains `needle` (one level of helpers).
function functionsContaining(text, needle) {
  const names = new Set();
  const re = /(?:function\s+([\w$]+)\s*\(|(?:const|let)\s+([\w$]+)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:\([^)]*\)|[\w$]+)\s*(?::[^=]+)?=>)/g;
  for (let m; (m = re.exec(text)); ) {
    const name = m[1] ?? m[2];
    const def = definition(text, name);
    if (def && needle.test(def)) names.add(name);
  }
  return names;
}

// Top-level and nested function definitions with their body range: function NAME(…) {…} and const NAME = (…) => {…}.
function functionRanges(text) {
  const out = [];
  const re = /(export\s+)?(?:async\s+)?function\s+([\w$]+)\s*\(|(export\s+)?(?:const|let)\s+([\w$]+)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:\([^)]*\)|[\w$]+)\s*(?::[^=]+)?=>\s*\{/g;
  for (let m; (m = re.exec(text)); ) {
    const name = m[2] ?? m[4];
    const nameIndex = m.index + m[0].indexOf(name, m[0].search(/function|const|let/));
    const open = m[2] ? text.indexOf("{", matchClose(text, m.index + m[0].length - 1)) : m.index + m[0].length - 1;
    out.push({ name, nameIndex, exported: Boolean(m[1] ?? m[3]), start: m.index, end: matchClose(text, open) });
  }
  return out;
}

function importsFrom(text, modulePattern) {
  const names = [];
  const re = /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/g;
  for (let m; (m = re.exec(text)); ) {
    if (!modulePattern.test(m[2]) || /^import\s+type/.test(m[0])) continue;
    for (const part of m[1].split(",")) {
      const clean = part.trim().replace(/^type\s+/, "");
      if (!clean || part.trim().startsWith("type ")) continue;
      names.push(clean.split(/\s+as\s+/).pop().trim());
    }
  }
  return names;
}

const isUseServer = (file) => /^\s*["']use server["']/.test(code(file));
const N8N_CLIENT = "lib/n8n/client.ts";
const CLIENT_IMPORT = /(^|\/)lib\/n8n\/client(\.ts)?$|^@\/lib\/n8n\/client$/;

// ---------------------------------------------------------------- n8n fetch calls
// A fetch is "to n8n" when its arguments mention an N8N_ variable or /webhook, or when the file reads
// N8N_WEBHOOK_* (the URL is then usually built in a variable).
const n8nFetches = codeFiles.flatMap((file) => {
  const text = code(file);
  const fileTalksToN8n = /N8N_WEBHOOK/.test(text);
  return calls(text, "fetch")
    .filter((c) => fileTalksToN8n || /N8N_|\/webhook/.test(c.args))
    .map((c) => ({ file, ...c, line: lineAt(text, c.start), endLine: lineAt(text, c.end) }));
});

function optionValue(call, text, key) {
  const direct = new RegExp(`\\b${key}\\s*:\\s*`).exec(call.args);
  if (direct) {
    const rest = call.args.slice(direct.index + direct[0].length);
    const ident = /^([\w$]+)\s*(?:[,}\n]|$)/.exec(rest);
    return ident && !/^(AbortSignal|true|false)$/.test(ident[1]) ? definition(text, ident[1]) ?? rest : rest;
  }
  if (new RegExp(`[{,]\\s*${key}\\s*[,}]`).test(call.args)) return definition(text, key) ?? "";
  // options object passed as a variable: fetch(url, init)
  const second = /,\s*([\w$]+)\s*\)?\s*$/.exec(call.args);
  const init = second ? definition(text, second[1]) : null;
  return init && new RegExp(`\\b${key}\\b`).test(init) ? optionValue({ args: init }, text, key) : null;
}

// ---------------------------------------------------------------- checks
const results = [];
function report(id, title, subjects, findings) {
  const counted = findings.filter(counts);
  const status = counted.length ? "FAIL" : subjects ? "PASS" : "N/A";
  results.push({ id, title, status, findings: counted });
}
const at = (file, line, message, endLine) => ({ file, line, endLine, message });

function linesMatching(file, re, text = read(file)) {
  return text.split("\n").flatMap((l, i) => (re.test(l) ? [i + 1] : []));
}

// C1
{
  const files = [...codeFiles.filter(inScope), ...(envExample && inScope(envExample) ? [envExample] : [])];
  const findings = files.flatMap((f) =>
    linesMatching(f, /\/webhook-test(?![\w-])/, f === envExample ? read(f) : code(f)).map((l) => at(f, l, "test URL /webhook-test/")),
  );
  report("C1", "no n8n test URL (/webhook-test/)", files.length, findings);
}

// C2
{
  const files = [...codeFiles.filter(inScope), ...(envExample && inScope(envExample) ? [envExample] : [])];
  const findings = files.flatMap((f) =>
    linesMatching(f, /NEXT_PUBLIC_N8N/, f === envExample ? read(f) : code(f)).map((l) => at(f, l, "NEXT_PUBLIC_N8N_* reaches the client bundle")),
  );
  report("C2", "no NEXT_PUBLIC_N8N_* variables", files.length, findings);
}

// C3
{
  const findings = n8nFetches
    .filter((c) => c.file !== N8N_CLIENT)
    .map((c) => at(c.file, c.line, `fetch to n8n outside ${N8N_CLIENT}`, c.endLine));
  const clientExists = codeFiles.includes(N8N_CLIENT);
  if (clientExists && inScope(N8N_CLIENT)) {
    const first = code(N8N_CLIENT).split("\n").findIndex((l) => l.trim() !== "");
    const firstLine = code(N8N_CLIENT).split("\n")[first] ?? "";
    if (!/^import\s+["']server-only["'];?$/.test(firstLine.trim())) findings.push(at(N8N_CLIENT, first + 1, 'first statement is not import "server-only"'));
  }
  report("C3", `n8n calls only in ${N8N_CLIENT} (server-only)`, n8nFetches.length || (clientExists && inScope(N8N_CLIENT)), findings);
}

// C4, C5
{
  const t4 = [];
  const t5 = [];
  for (const c of n8nFetches) {
    const text = code(c.file);
    const signal = optionValue(c, text, "signal");
    if (!signal || !/AbortSignal\.timeout\s*\(/.test(signal)) t4.push(at(c.file, c.line, "fetch to n8n without signal: AbortSignal.timeout(...)", c.endLine));
    const headers = optionValue(c, text, "headers") ?? "";
    const missing = ["x-n8n-token", "idempotency-key", "x-correlation-id"].filter((h) => !new RegExp(`["'\`]${h}["'\`]`, "i").test(headers));
    if (missing.length) t5.push(at(c.file, c.line, `fetch to n8n without header(s): ${missing.join(", ")}`, c.endLine));
  }
  report("C4", "timeout on every n8n fetch", n8nFetches.length, t4);
  report("C5", "x-n8n-token, idempotency-key, x-correlation-id on every n8n fetch", n8nFetches.length, t5);
}

// C6
{
  // Functions that reach n8n: the client's imports, plus exported helpers of modules that call them.
  const reaching = new Map(); // file -> Set<name> of callable names that reach n8n
  for (const file of codeFiles) {
    if (file === N8N_CLIENT) continue;
    const text = code(file);
    const clientNames = importsFrom(text, CLIENT_IMPORT);
    if (!clientNames.length) continue;
    const helpers = new Set();
    const re = /export\s+(?:async\s+)?function\s+([\w$]+)|export\s+const\s+([\w$]+)\s*=/g;
    for (let m; (m = re.exec(text)); ) {
      const name = m[1] ?? m[2];
      const def = definition(text, name) ?? "";
      if (clientNames.some((n) => new RegExp(`(?<![\\w$.])${n}\\s*\\(`).test(def))) helpers.add(name);
    }
    reaching.set(file, helpers);
  }
  const subjects = [];
  const findings = [];
  for (const file of codeFiles.filter((f) => inScope(f) && isUseServer(f))) {
    const text = code(file);
    const names = new Set(importsFrom(text, CLIENT_IMPORT));
    for (const [helperFile, helpers] of reaching) {
      const modulePath = helperFile.replace(/\.(ts|tsx|js|mjs)$/, "");
      const pattern = new RegExp(`(^@/|/)${modulePath.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}$|^@/${modulePath.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}$`);
      for (const n of importsFrom(text, pattern)) if (helpers.has(n)) names.add(n);
    }
    const directFetches = n8nFetches.filter((c) => c.file === file);
    if (!names.size && !directFetches.length) continue;
    subjects.push(file);
    const afterRanges = calls(text, "after").map((c) => [c.start, c.end]);
    const inside = (i) => afterRanges.some(([s, e]) => i > s && i < e);
    // A fetch inside a local (non-exported) helper is fine if every call of that helper is inside after().
    const localFns = functionRanges(text);
    const directFindings = [];
    for (const c of directFetches) {
      if (inside(c.start)) continue;
      const owner = localFns.filter((f) => c.start > f.start && c.start < f.end).sort((a, b) => a.end - a.start - (b.end - b.start))[0];
      if (owner && !owner.exported) names.add(owner.name);
      else directFindings.push(at(file, c.line, "Server Action awaits n8n, not in after()", c.endLine));
    }
    for (const name of names) {
      const owner = localFns.find((f) => f.name === name);
      for (const c of calls(text, name)) {
        if (owner && (c.start === owner.nameIndex || (c.start > owner.start && c.start < owner.end))) continue;
        if (!inside(c.start)) findings.push(at(file, lineAt(text, c.start), `${name}() runs in the Server Action, not in after()`));
      }
    }
    findings.push(...directFindings);
  }
  report("C6", "Server Actions call n8n only inside after()", subjects.length, findings);
}

// Callback routes: Route Handlers that verify n8n callbacks.
const callbackRoutes = codeFiles.filter(
  (f) => /(^|\/)app\/.*\/route\.(ts|js)$/.test(f) && /x-n8n-signature|N8N_CALLBACK_SECRET/.test(code(f)) && inScope(f),
);
// Helper modules the routes import (for verification/parsing done in lib/…).
function importedHelperSources(file) {
  const text = code(file);
  const out = [];
  const re = /import\s+\{([^}]*)\}\s*from\s*["'](@\/|\.\.?\/)([^"']+)["']/g;
  for (let m; (m = re.exec(text)); ) {
    const base = m[2] === "@/" ? m[3] : join(file, "..", m[2] + m[3]).split(sep).join("/");
    const target = [".ts", ".tsx", ".js", "/index.ts"].map((ext) => base + ext).find((f) => codeFiles.includes(f));
    if (target) out.push({ names: m[1].split(",").map((p) => p.trim().replace(/^type\s+/, "").split(/\s+as\s+/).pop()), text: code(target), file: target });
  }
  return out;
}

// C7, C8, C9, C10
{
  const f7 = [];
  const f8 = [];
  const f9 = [];
  const f10 = [];
  for (const file of callbackRoutes) {
    const text = code(file);
    const helpers = importedHelperSources(file);
    const verifyNames = new Set(["timingSafeEqual", ...functionsContaining(text, /timingSafeEqual\s*\(/)]);
    const parseNames = new Set(["JSON.parse", ...functionsContaining(text, /JSON\.parse\s*\(|\.json\s*\(\s*\)/)]);
    for (const h of helpers) {
      for (const n of functionsContaining(h.text, /timingSafeEqual\s*\(/)) if (h.names.includes(n)) verifyNames.add(n);
      for (const n of functionsContaining(h.text, /JSON\.parse\s*\(|\.json\s*\(\s*\)/)) if (h.names.includes(n)) parseNames.add(n);
    }
    const post = /export\s+(?:async\s+)?function\s+POST\s*\(|export\s+const\s+POST\s*=/.exec(text);
    if (!post) {
      f7.push(at(file, 0, "no POST handler found"));
      continue;
    }
    const bodyOpen = text.indexOf("{", matchClose(text, text.indexOf("(", post.index)));
    const bodyStart = bodyOpen;
    const bodyEnd = matchClose(text, bodyOpen);
    const body = text.slice(bodyStart, bodyEnd);
    const first = (names) =>
      Math.min(...[...names].flatMap((n) => calls(body, n).map((c) => c.start)), Infinity);
    const verifyAt = first(verifyNames);
    const parseAt = Math.min(first(parseNames), ...[...body.matchAll(/\.json\s*\(\s*\)/g)].map((m) => m.index));
    if (!/\.text\s*\(\s*\)/.test(body)) f7.push(at(file, lineAt(text, bodyStart), "body is not read with request.text()"));
    if (verifyAt === Infinity) f7.push(at(file, lineAt(text, bodyStart), "no signature verification (timingSafeEqual) in POST"));
    else if (parseAt < verifyAt) f7.push(at(file, lineAt(text, bodyStart + parseAt), "JSON parsed before the signature is verified"));

    const verifySources = [text, ...helpers.map((h) => h.text)].filter((t) => /timingSafeEqual\s*\(/.test(t));
    const verifierHasLengthCheck = verifySources.some((t) =>
      [...functionsContaining(t, /timingSafeEqual\s*\(/)].some((n) => /\.length\s*[!=]==?/.test(definition(t, n) ?? "")),
    );
    if (!verifySources.length) f8.push(at(file, 0, "timingSafeEqual is not used"));
    else if (!verifierHasLengthCheck) f8.push(at(file, 0, "no length check before timingSafeEqual (it throws on different lengths)"));
    for (const [f, t] of [[file, text], ...helpers.map((h) => [h.file, h.text])]) {
      t.split("\n").forEach((l, i) => {
        for (const m of l.matchAll(/[!=]==?/g)) {
          const left = l.slice(0, m.index).split(/&&|\|\||\(|,|\breturn\b|\bif\b/).pop().trim();
          const right = l.slice(m.index + m[0].length).split(/&&|\|\||\)\s*[;{]|;|,/)[0].trim();
          if ([left, right].every((s) => /\.length$/.test(s))) continue;
          if ([left, right].some((s) => /signature|digest|hmac|expected|sha256=/i.test(s))) f8.push(at(f, i + 1, "signature compared with ===/!== instead of timingSafeEqual"));
        }
      });
    }

    const readsTimestamp = /["'`]x-n8n-timestamp["'`]/.test(text);
    const window = /\b300\b|\b5\s*\*\s*60\b|\b300_?000\b/.test(text);
    if (!readsTimestamp || !window || !/Math\.abs\s*\(/.test(text)) f9.push(at(file, 0, "no +-300 s check of x-n8n-timestamp (Math.abs(now - timestamp) > 300)"));

    if (!/\b(64\s*\*\s*1024|65_?536)\b/.test(text) || !/\b413\b/.test(text)) f10.push(at(file, 0, "no 64 KB body limit answered with 413"));
  }
  const n = callbackRoutes.length;
  report("C7", "callback: raw body, JSON only after signature check", n, f7);
  report("C8", "callback: length check + timingSafeEqual, no ===", n, f8);
  report("C9", "callback: +-300 s timestamp window", n, f9);
  report("C10", "callback: 64 KB limit -> 413", n, f10);
}

// C11
{
  const files = codeFiles.filter(inScope);
  const findings = files.flatMap((f) =>
    linesMatching(f, /export\s+const\s+runtime\s*=\s*["'`]edge["'`]/, code(f)).map((l) => at(f, l, 'runtime = "edge" (node:crypto is required)')),
  );
  report("C11", 'no runtime = "edge"', files.length, findings);
}

// C12
{
  const CONTRACT = ["N8N_WEBHOOK_BASE_URL", "N8N_WEBHOOK_TOKEN", "N8N_CALLBACK_SECRET", "APP_BASE_URL"];
  const findings = [];
  const usesN8n = codeFiles.some((f) => /N8N_/.test(code(f)));
  for (const f of codeFiles.filter(inScope)) {
    const text = code(f);
    for (const m of text.matchAll(/process\.env\.(N8N_[A-Z0-9_]+)|process\.env\[["'`](N8N_[A-Z0-9_]+)["'`]\]|["'`](N8N_[A-Z0-9_]+)["'`]/g)) {
      const name = m[1] ?? m[2] ?? m[3];
      if (!CONTRACT.includes(name)) findings.push(at(f, lineAt(text, m.index), `${name} is not a contract variable`));
    }
  }
  if (envExample && inScope(envExample)) {
    const lines = read(envExample).split("\n");
    const entries = new Map();
    lines.forEach((l, i) => {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(l);
      if (m) entries.set(m[1], { value: m[2].trim().replace(/^["']|["']$/g, ""), line: i + 1 });
    });
    for (const key of CONTRACT) if (!entries.has(key)) findings.push(at(envExample, 0, `missing ${key}`));
    for (const [key, { value, line }] of entries) {
      if (/^N8N_/.test(key) && !CONTRACT.includes(key)) findings.push(at(envExample, line, `${key} is not a contract variable`));
      if (/TOKEN|SECRET|PASSWORD|API_KEY/.test(key) && !/^change-me-/.test(value)) findings.push(at(envExample, line, `${key}: secrets in .env.example must be change-me-… placeholders (value not shown)`));
    }
    const base = entries.get("N8N_WEBHOOK_BASE_URL");
    if (base && !/^https?:\/\/[^\s]+\/webhook$/.test(base.value)) findings.push(at(envExample, base.line, "N8N_WEBHOOK_BASE_URL must be an http(s) URL ending with /webhook"));
    const app = entries.get("APP_BASE_URL");
    if (app && !/^https?:\/\/[^\s/]+(:\d+)?$/.test(app.value)) findings.push(at(envExample, app.line, "APP_BASE_URL must be an origin like http://127.0.0.1:3000"));
  } else if (!envExample && usesN8n && !changed) findings.push(at(".env.example", 0, "missing .env.example"));
  report("C12", ".env.example and N8N_* names follow the contract", (envExample && inScope(envExample)) || usesN8n, findings);
}

// C13
{
  const n8nFiles = codeFiles.filter(
    (f) =>
      inScope(f) &&
      (f.startsWith("lib/n8n/") || callbackRoutes.includes(f) || importsFrom(code(f), CLIENT_IMPORT).length || n8nFetches.some((c) => c.file === f)),
  );
  const FORBIDDEN = /\b(raw|rawBody|body|payload|envelope|formData|email|phone|token|signature|secret|headers)\b(?!\s*\.\s*(length|id)\b)/;
  const findings = [];
  for (const f of n8nFiles) {
    const text = code(f);
    for (const c of calls(text, "console.log").concat(calls(text, "console.info"), calls(text, "console.warn"), calls(text, "console.error"), calls(text, "console.debug"))) {
      const args = c.args.replace(/(["'])(?:\\.|(?!\1).)*\1/g, '""').replace(/`(?:\\.|[^`$]|\$(?!\{))*`/g, (t) => t.replace(/[^$]*?(\$\{[^}]*\})?/g, "$1"));
      if (FORBIDDEN.test(args)) findings.push(at(f, lineAt(text, c.start), "console.* logs a body, form data, PII, token or signature"));
    }
  }
  report("C13", "no bodies, PII or secrets in logs", n8nFiles.length, findings);
}

// ---------------------------------------------------------------- output
const scope = changed ? ` · changed since ${changedSince}: ${[...changed.keys()].filter((f) => codeFiles.includes(f) || f === envExample).length} file(s)` : "";
console.log(`check-contract · root ${root} · ${codeFiles.length + (envExample ? 1 : 0)} file(s)${scope}`);
for (const r of results) {
  console.log(`${r.id.padEnd(4)} ${r.status.padEnd(4)} ${r.title}`);
  for (const f of r.findings) console.log(`       ${f.file}${f.line ? `:${f.line}` : ""}  ${f.message}`);
}
const fail = results.filter((r) => r.status === "FAIL").length;
const pass = results.filter((r) => r.status === "PASS").length;
const na = results.filter((r) => r.status === "N/A").length;
console.log(`Summary: ${pass} PASS, ${fail} FAIL, ${na} N/A`);
process.exit(fail ? 1 : 0);
