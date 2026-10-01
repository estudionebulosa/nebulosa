/**
 * Local admin companion server (no auth — localhost only).
 *   GET  /*            → serves _site (build output)
 *   POST /api/save     → writes one whitelisted file under content/
 *                        { path, content }            (plain files)
 *                        { path, data, body }         (.md → YAML front matter)
 *   POST /api/build    → re-runs the Eleventy build (NEB_ADMIN=1) in place
 *
 * Usage:  npm run admin    (build + this server on :8081)
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT || 8081);
const SITE = path.join(ROOT, "_site");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
};

/* ── write whitelist ─────────────────────────────────────── */
const ALLOW = [
  (p) => p === "content/_data/site.json",
  (p) => p === "content/_data/registry.json",
  (p) => /^content\/news\/(en\/)?[^/]+\.md$/.test(p),
  (p) => /^content\/_includes\/(layouts|partials)\/[\w./-]+\.njk$/.test(p),
];

function allowed(rel) {
  const clean = path.posix.normalize(rel).replace(/^\.\/+/, "");
  return ALLOW.some((fn) => fn(clean)) ? clean : null;
}

/* ── YAML front matter writer (comment-preserving) ──────────
 * The front matter is split into per-key segments. Keys whose
 * value did NOT change are re-emitted verbatim — section
 * comments (`# ── dates ──` etc.) and formatting intact; only
 * changed keys are re-dumped. Booleans/numbers coming from form
 * checkboxes are normalized to strings first (FAILSAFE dump
 * cannot represent them) and written as plain scalars, so
 * Eleventy's default YAML schema reads them back typed. */
function deepNormalize(v) {
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.map(deepNormalize);
  if (v && typeof v === "object") {
    const o = {};
    for (const [k, val] of Object.entries(v)) o[k] = deepNormalize(val);
    return o;
  }
  return v;
}

function dumpPair(key, value) {
  const Y = awaitlessYaml();
  const y = Y.dump({ [key]: value }, {
    schema: Y.FAILSAFE_SCHEMA,
    lineWidth: -1,
    noRefs: true,
    quotingType: '"',
    noCompatMode: true,
  });
  return y.replace(/\n$/, "").split("\n");
}

/** Split raw front matter into segments: { key, pre, body }.
 *  Column-0 comments and blank lines are buffered as `pre` of the
 *  NEXT key (they document what follows); everything else that is
 *  not a top-level `key:` line belongs to the current key's body. */
function segmentize(fm) {
  const segs = [];
  const pending = [];
  let cur = null;
  for (const line of fm.split("\n")) {
    const isKey = !/^\s/.test(line) && /^[\w.-]+\s*:(\s|$)/.test(line);
    if (isKey) {
      cur = { key: line.match(/^([\w.-]+)\s*:/)[1], pre: pending.splice(0), body: [line] };
      segs.push(cur);
    } else if (/^#/.test(line) || line.trim() === "") {
      pending.push(line);
    } else if (cur) {
      cur.body.push(line);
    } else {
      pending.push(line);
    }
  }
  return { segs, tail: pending };
}

function stringifyMatter(abs, data, body) {
  const Y = awaitlessYaml();
  const norm = {};
  for (const [k, v] of Object.entries(data || {})) norm[k] = deepNormalize(v);

  let raw = null;
  try { raw = fs.readFileSync(abs, "utf8"); } catch (e) { /* new file */ }
  const m = raw && raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) {
    const fm = Object.keys(norm).map((k) => dumpPair(k, norm[k]).join("\n")).join("\n");
    return `---\n${fm}\n---\n\n${String(body || "").replace(/^\n+/, "")}`;
  }

  const cur = Y.load(m[1], { schema: Y.FAILSAFE_SCHEMA }) || {};
  const { segs, tail } = segmentize(m[1]);
  const out = [];
  const seen = new Set();
  for (const s of segs) {
    if (!(s.key in norm)) continue; // key removed → drop block + its header comment
    seen.add(s.key);
    out.push(...s.pre);
    if (JSON.stringify(cur[s.key]) === JSON.stringify(norm[s.key])) out.push(...s.body);
    else out.push(...dumpPair(s.key, norm[s.key]));
  }
  for (const k of Object.keys(norm)) if (!seen.has(k)) out.push(...dumpPair(k, norm[k]));
  out.push(...tail);

  const fm = out.join("\n").replace(/^\n+/, "").replace(/\n+$/, "") + "\n";
  return `---\n${fm}---\n\n${String(body || "").replace(/^\n+/, "")}`;
}
let _yaml = null;
function awaitlessYaml() {
  if (!_yaml) {
    /* sync require in ESM */
    _yaml = createRequire(import.meta.url)("js-yaml");
  }
  return _yaml;
}
import { createRequire } from "node:module";

/* ── helpers ─────────────────────────────────────────────── */
const json = (res, code, obj) => {
  res.writeHead(code, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let buf = "";
    req.on("data", (c) => {
      buf += c;
      if (buf.length > 5e6) reject(new Error("body too large"));
    });
    req.on("end", () => resolve(buf));
    req.on("error", reject);
  });
}

/* ── _redirects emulation (Cloudflare Pages parity) ────────
 * The static server honours the same rules file that ships in
 * _site, so /blog/* can be tested locally before deploying. */
function applyRedirects(pathname) {
  let raw;
  try {
    raw = fs.readFileSync(path.join(SITE, "_redirects"), "utf8");
  } catch {
    return null; /* no rules file */
  }
  for (const line of raw.split("\n")) {
    const l = line.trim();
    if (!l || l.startsWith("#")) continue;
    const [from, to, status] = l.split(/\s+/);
    if (!from || !to) continue;
    if (from.endsWith("/*")) {
      const prefix = from.slice(0, -1); /* keep the trailing / */
      if (pathname.startsWith(prefix)) {
        return { to: to.replace(":splat", pathname.slice(prefix.length)),
                 status: Number(status) || 301 };
      }
    } else if (pathname === from) {
      return { to, status: Number(status) || 301 };
    }
  }
  return null;
}

/* ── static ──────────────────────────────────────────────── */
function serveStatic(req, res) {
  let rel = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const redir = applyRedirects(rel);
  if (redir) {
    res.writeHead(redir.status, { location: redir.to, "cache-control": "no-store" });
    return res.end(`${redir.status} → ${redir.to}`);
  }
  if (rel.endsWith("/")) rel += "index.html";
  const abs = path.join(SITE, rel);
  if (!abs.startsWith(SITE) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    return res.end("404 — rebuild? (_site missing this file)");
  }
  res.writeHead(200, {
    "content-type": MIME[path.extname(abs)] || "application/octet-stream",
    "cache-control": "no-store",
  });
  fs.createReadStream(abs).pipe(res);
}

/* ── server ──────────────────────────────────────────────── */
http
  .createServer(async (req, res) => {
    try {
      if (req.method === "POST" && req.url === "/api/save") {
        const body = JSON.parse(await readBody(req));
        const rel = allowed(body.path || "");
        if (!rel) return json(res, 403, { ok: false, error: "path not allowed: " + body.path });
        const abs = path.join(ROOT, rel);
        const content = rel.endsWith(".md")
          ? stringifyMatter(abs, body.data || {}, body.body || "")
          : String(body.content ?? "");
        fs.writeFileSync(abs, content, "utf8");
        console.log("[save]", rel, `(${content.length} bytes)`);
        return json(res, 200, { ok: true, path: rel });
      }

      if (req.method === "POST" && req.url === "/api/yaml") {
        const body = JSON.parse(await readBody(req));
        const yaml = awaitlessYaml();
        const y = yaml.dump(body.data || {}, {
          schema: yaml.FAILSAFE_SCHEMA, lineWidth: -1, noRefs: true,
          quotingType: '"', noCompatMode: true,
        });
        return json(res, 200, { ok: true, yaml: y });
      }

      if (req.method === "POST" && req.url === "/api/build") {
        console.log("[build] rebuilding…");
        try {
          const out = execFileSync("npx", ["eleventy"], {
            cwd: ROOT,
            env: { ...process.env, NEB_ADMIN: "1" },
            encoding: "utf8",
            timeout: 120000,
          });
          console.log("[build] ok");
          return json(res, 200, { ok: true, output: out.trim().split("\n").slice(-4).join("\n") });
        } catch (e) {
          const out = String(e.stdout || "") + String(e.stderr || "");
          console.log("[build] FAILED\n" + out);
          return json(res, 500, { ok: false, output: out.trim().split("\n").slice(-15).join("\n") });
        }
      }

      if (req.method === "GET" || req.method === "HEAD") return serveStatic(req, res);
      json(res, 405, { ok: false, error: "method not allowed" });
    } catch (err) {
      json(res, 500, { ok: false, error: String(err && err.message || err) });
    }
  })
  .listen(PORT, "127.0.0.1", () => {
    console.log(`admin → http://127.0.0.1:${PORT}/admin/  (serving _site)`);
  });
