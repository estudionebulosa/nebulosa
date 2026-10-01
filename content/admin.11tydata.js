/**
 * Admin page data — embeds everything the admin app needs as JSON:
 * site.json, registry.json, every article (parsed front matter + body)
 * and every editable Nunjucks template.
 * Only loaded when content/admin.njk is built (NEB_ADMIN=1).
 */
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const ROOT = path.join(__dirname, ".."); // project root

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

/** Split --- front matter --- from body; FAILSAFE schema keeps dates as strings
 *  so nothing drifts when the admin re-serializes an untouched file. */
function parseMatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: raw };
  const data = yaml.load(m[1], { schema: yaml.FAILSAFE_SCHEMA }) || {};
  return { data, body: m[2] };
}

function collectArticles() {
  const out = [];
  const dirs = [
    [path.join(ROOT, "content", "news"), "es"],
    [path.join(ROOT, "content", "news", "en"), "en"],
  ];
  for (const [dir, lang] of dirs) {
    let files = [];
    try {
      files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
    } catch (e) {
      continue;
    }
    for (const f of files) {
      const abs = path.join(dir, f);
      const rel = path.relative(ROOT, abs).replace(/\\/g, "/");
      const { data, body } = parseMatter(fs.readFileSync(abs, "utf8"));
      out.push({ path: rel, lang, file: f, data, body });
    }
  }
  return out.sort((a, b) =>
    String(b.data.pubDate || "").localeCompare(String(a.data.pubDate || ""))
  );
}

function collectTemplates(dir) {
  const out = [];
  const abs = path.join(ROOT, "content", "_includes", dir);
  let files = [];
  try {
    files = fs.readdirSync(abs, { withFileTypes: true });
  } catch (e) {
    return out;
  }
  for (const e of files) {
    if (e.isDirectory()) {
      out.push(...collectTemplates(path.join(dir, e.name)));
    } else if (e.name.endsWith(".njk")) {
      const rel = `content/_includes/${path.join(dir, e.name).replace(/\\/g, "/")}`;
      out.push({ path: rel, content: fs.readFileSync(path.join(ROOT, rel), "utf8") });
    }
  }
  return out;
}

const payload = {
  site: readJson(path.join(ROOT, "content", "_data", "site.json")),
  registry: readJson(path.join(ROOT, "content", "_data", "registry.json")),
  articles: collectArticles(),
  templates: [...collectTemplates("layouts"), ...collectTemplates("partials")],
};

/* \u003c-escape so "</script>" inside any body can't break the page */
const adminPayload = JSON.stringify(payload).replace(/</g, "\\u003c");

module.exports = { adminPayload };
