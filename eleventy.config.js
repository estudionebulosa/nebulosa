const fs = require("fs");
const path = require("path");
const site = require("./content/_data/site.json");

const TZ = site.timezone || "Europe/Madrid";
const OUT = path.join(process.cwd(), "_site");

/** Parse a date without letting the build machine's timezone shift calendar days. */
function toDate(d) {
  if (!d) return null;
  if (d instanceof Date) return isNaN(d.getTime()) ? null : d;
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, day] = d.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, day));
  }
  const t = new Date(d);
  return isNaN(t.getTime()) ? null : t;
}

function absUrl(p) {
  if (!p) return "";
  const s = String(p);
  if (/^https?:\/\//.test(s)) return s;
  if (s.startsWith("//")) return `https:${s}`;
  return site.domain + (s.startsWith("/") ? s : `/${s}`);
}

module.exports = function (eleventyConfig) {
  eleventyConfig.addNunjucksGlobal("copyrightYear", new Date().getUTCFullYear());

  /* ── filters ─────────────────────────────────────────── */
  eleventyConfig.addNunjucksFilter("iso", (d) => {
    const t = toDate(d);
    return t ? t.toLocaleDateString("en-CA", { timeZone: TZ }) : "";
  });
  /* full RFC3339/ISO datetime (feeds) */
  eleventyConfig.addNunjucksFilter("isoDT", (d) => {
    const t = toDate(d);
    return t ? t.toISOString() : "";
  });
  eleventyConfig.addNunjucksFilter("rfc", (d) => {
    const t = toDate(d);
    return t ? t.toUTCString() : "";
  });
  eleventyConfig.addNunjucksFilter("long", (d, lang) => {
    const t = toDate(d);
    if (!t) return "";
    const locale = lang === "en" ? "en-US" : "es-ES";
    return t.toLocaleDateString(locale, {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: TZ,
    });
  });
  /* < is escaped so JSON embedded in <script> cannot break out */
  eleventyConfig.addNunjucksFilter("json", (v) =>
    JSON.stringify(v).replace(/</g, "\\u003c")
  );
  eleventyConfig.addNunjucksFilter("abs", absUrl);
  /* RSS content:encoded must not contain a raw CDATA terminator */
  eleventyConfig.addNunjucksFilter("cdata", (html) =>
    String(html || "").replace(/]]>/g, "]]]]><![CDATA[>")
  );
  eleventyConfig.addNunjucksFilter("words", (html) =>
    String(html || "")
      .replace(/<[^>]*>/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean).length
  );
  eleventyConfig.addNunjucksFilter("mins", (n) =>
    Math.max(1, Math.ceil(Number(n) / (site.readingWpm || 200)))
  );
  /* every collection member except this page */
  eleventyConfig.addNunjucksFilter("others", (coll, slug) =>
    (coll || []).filter((p) => p.data.page && p.data.page.fileSlug !== slug)
  );

  /* admin page is only built on demand — never shipped to production */
  if (process.env.NEB_ADMIN !== "1") {
    eleventyConfig.ignores.add("content/admin.njk");
    /* Eleventy never deletes stale output: drop a leftover /admin
     * from a previous NEB_ADMIN=1 build so it can't ship. */
    fs.rmSync(path.join(OUT, "admin"), { recursive: true, force: true });
  }

  /* ── static assets (paths are relative to the project root) ── */
  eleventyConfig.addPassthroughCopy("assets");
  eleventyConfig.addPassthroughCopy({ "robots.txt": "robots.txt" });
  eleventyConfig.addPassthroughCopy({ "404.html": "404.html" });
  eleventyConfig.addPassthroughCopy({ "_redirects": "_redirects" });

  /* ── collections ─────────────────────────────────────── */
  const byDate = (a, b) =>
    new Date(b.data.pubDate || 0) - new Date(a.data.pubDate || 0);
  const collect = (api, glob) =>
    api
      .getFilteredByGlob(glob)
      .filter((p) => !p.data.draft)
      .sort(byDate);

  /* every article, both languages (feeds) */
  eleventyConfig.addCollection("news", (api) =>
    collect(api, "content/news/**/*.md")
  );
  /* ES articles: content/news/*.md (en/ subdir excluded by glob) */
  eleventyConfig.addCollection("newsEs", (api) =>
    collect(api, "content/news/*.md")
  );
  /* EN articles: content/news/en/*.md */
  eleventyConfig.addCollection("newsEn", (api) =>
    collect(api, "content/news/en/*.md")
  );

  /* GitHub Pages ignores Jekyll processing only if .nojekyll is present,
   * and reads CNAME for the custom domain. Write both into the publish dir. */
  eleventyConfig.on("eleventy.after", () => {
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, ".nojekyll"), "");
    const cname = String(process.env.PAGES_CNAME || "nebulosa.estudio").trim();
    if (cname) fs.writeFileSync(path.join(OUT, "CNAME"), `${cname}\n`);
    if (process.env.NEB_ADMIN !== "1") {
      fs.rmSync(path.join(OUT, "admin"), { recursive: true, force: true });
    }
  });

  return {
    dir: {
      input: "content",
      includes: "_includes",
      data: "_data",
      output: "_site",
    },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
    templateFormats: ["md", "njk", "html"],
  };
};
