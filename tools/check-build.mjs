/**
 * Production gate. Run after `npm run build`.
 * Fails the process if the publish directory is missing, unsafe, or inconsistent.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = path.join(ROOT, "_site");
const errors = [];

function fail(msg) {
  errors.push(msg);
}

function read(rel) {
  const abs = path.join(SITE, rel);
  if (!fs.existsSync(abs)) {
    fail(`missing _site/${rel}`);
    return "";
  }
  return fs.readFileSync(abs, "utf8");
}

function exists(rel) {
  if (!fs.existsSync(path.join(SITE, rel))) fail(`missing _site/${rel}`);
}

if (fs.existsSync(path.join(SITE, "admin"))) {
  fail("_site/admin exists — production builds must not ship the admin");
}

for (const rel of [
  "index.html",
  "404.html",
  "robots.txt",
  "sitemap.xml",
  "feed.xml",
  "feed.json",
  "llms.txt",
  "site.webmanifest",
  ".nojekyll",
  "CNAME",
  "_redirects",
  "assets/og-image.png",
  "assets/favicon.svg",
  "assets/apple-touch-icon.png",
  "assets/logo.svg",
  "news/index.html",
  "news/en/index.html",
]) {
  exists(rel);
}

const cname = read("CNAME").trim();
if (cname && cname !== "nebulosa.estudio") {
  fail(`CNAME is ${JSON.stringify(cname)}, expected nebulosa.estudio`);
}

const robots = read("robots.txt");
if (!robots.includes("Sitemap: https://nebulosa.estudio/sitemap.xml")) {
  fail("robots.txt is missing the production sitemap URL");
}
if (!/Disallow:\s*\/admin\//.test(robots)) {
  fail("robots.txt should disallow /admin/ as defense in depth");
}

const home = read("index.html");
if (!home.includes('hreflang="en"')) fail("landing is missing hreflang=en");
if (!home.includes('rel="manifest"')) fail("landing is missing the web manifest link");
if (!home.includes('name="website"')) fail("contact form is missing the honeypot");
if (/política de privacidad|privacy policy/i.test(home)) {
  fail("contact form still claims a privacy policy page that does not exist");
}
if (/href="\/news\/"[^>]*class="current"|class="current"[^>]*href="\/news\//.test(home)) {
  fail("landing nav marks Noticias as the current page");
}

const manifest = read("site.webmanifest");
if (manifest && !manifest.includes("Nebulosa")) fail("web manifest has no site name");
try {
  if (manifest) JSON.parse(manifest);
} catch (err) {
  fail(`site.webmanifest is not valid JSON: ${err.message}`);
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.name.endsWith(".html")) out.push(p);
  }
  return out;
}

for (const file of walk(path.join(SITE, "news"))) {
  const html = fs.readFileSync(file, "utf8");
  const rel = path.relative(SITE, file);
  if (html.includes('content="image/svg+xml"') && html.includes("/assets/og-image.png")) {
    fail(`${rel} declares og:image:type image/svg+xml for a PNG`);
  }
  const ld = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (ld && /<\/script>/i.test(ld[1])) {
    fail(`${rel} JSON-LD can break out of its script tag`);
  }
  if (html.includes("/about/marta")) {
    fail(`${rel} links to /about/marta, which does not exist`);
  }
}

const enArticle = read("news/en/how-we-build-mobile-apps.html");
if (enArticle.includes("also available in") && /also available in[\s\S]{0,180}English/.test(enArticle)) {
  fail("English articles tell English readers the page is also available in English");
}
if (enArticle && !enArticle.includes('rel="prev"') && !enArticle.includes('rel="next"')) {
  fail("article pages never emit rel=prev/next");
}

const newsIndex = read("news/index.html");
if (newsIndex && !newsIndex.includes("data-alt-en=")) {
  fail("/news/ is missing data-alt-en, so the language toggle cannot reach English");
}

const feed = read("feed.xml");
if (feed.includes("]]>")) {
  const broken = feed.split("<content:encoded>").slice(1).some((chunk) => {
    const body = chunk.split("</content:encoded>")[0];
    return (body.match(/\]\]>/g) || []).length > 1;
  });
  if (broken) fail("feed.xml has an unescaped CDATA terminator");
}

try {
  if (read("feed.json")) JSON.parse(read("feed.json"));
} catch (err) {
  fail(`feed.json is not valid JSON: ${err.message}`);
}

const sitemap = read("sitemap.xml");
if (sitemap && !sitemap.includes("https://nebulosa.estudio/news/")) {
  fail("sitemap.xml has no news URLs");
}
if (sitemap.includes("?lang=")) fail("sitemap.xml still uses legacy ?lang= hreflang");

/* Redirect rules in the worker must match the file GitHub Pages will ignore. */
function rules(text) {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => l.replace(/\s+/g, " "))
    .sort();
}
const fileRules = rules(fs.readFileSync(path.join(ROOT, "_redirects"), "utf8"));
const worker = fs.readFileSync(path.join(ROOT, "cloudflare", "worker.js"), "utf8");
const block = worker.match(/const REDIRECTS = `([\s\S]*?)`;/);
if (!block) fail("cloudflare/worker.js is missing the REDIRECTS block");
else {
  const workerRules = rules(block[1]);
  if (fileRules.join("\n") !== workerRules.join("\n")) {
    fail("cloudflare/worker.js REDIRECTS drifted from _redirects");
  }
}

/* Internal links on the homepage should resolve inside _site. */
const hrefs = new Set();
for (const m of home.matchAll(/href="(\/[^"#?]*)/g)) hrefs.add(m[1]);
for (const href of hrefs) {
  if (href.startsWith("/api/")) continue;
  const rel = href.replace(/^\//, "");
  const candidates = [
    path.join(SITE, rel),
    path.join(SITE, rel, "index.html"),
    rel.endsWith("/") ? path.join(SITE, rel, "index.html") : null,
  ].filter(Boolean);
  if (!candidates.some((p) => fs.existsSync(p))) {
    fail(`homepage links to ${href}, which is not in _site`);
  }
}

if (errors.length) {
  console.error(`check-build: ${errors.length} problem(s)`);
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("check-build: ok");
