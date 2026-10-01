/**
 * Build-time computed values for every article.
 * See docs/template-seo-geo-spec.md — canonical, robots and the whole
 * JSON-LD @graph are derived here so nothing is hand-concatenated.
 */
const site = require("./_data/site.json");
const registry = require("./_data/registry.json");
const fs = require("fs");
const path = require("path");

const TZ = site.timezone || "Europe/Madrid";

/** Absolute URL. Empty input stays empty — callers decide the fallback. */
function absUrl(p) {
  if (!p) return "";
  const s = String(p);
  if (/^https?:\/\//.test(s)) return s;
  return site.domain + (s.startsWith("/") ? s : `/${s}`);
}
/** Calendar date in the site timezone, so CI in UTC doesn't shift the day. */
function iso(d) {
  if (!d) return undefined;
  const t = new Date(d);
  return isNaN(t.getTime()) ? undefined : t.toLocaleDateString("en-CA", { timeZone: TZ });
}

const isArticle = (data) =>
  Boolean(data.page && /\.md$/.test(data.page.inputPath || ""));

/** Article language from path: content/news/en/*.md → en, else es. */
function langOf(inputPath) {
  return /[/\\]news[/\\]en[/\\]/.test(inputPath) ? "en" : "es";
}

/* ── registry resolution (R layer → placeholders fill themselves) ── */

const langOfData = (data) =>
  isArticle(data) ? langOf(data.page.inputPath) : data.lang || "es";

/** EN variant wins on English pages: bioEn → bio, roleEn → role, … */
function localize(entry, lang) {
  if (lang !== "en" || !entry || typeof entry !== "object") return entry;
  const out = Object.assign({}, entry);
  for (const k of Object.keys(entry)) {
    if (/En$/.test(k)) out[k.slice(0, -2)] = entry[k];
  }
  return out;
}

/** `author: marta` → registry.authors.marta; inline objects pass through. */
function resolveRef(value, table, lang) {
  if (!value || typeof value !== "string") return value;
  return localize(table && table[value], lang) || value;
}

/** `apps: [pulse, verso]` → [{ name, id, storeId, category, … }]. */
function resolveApps(apps) {
  if (!Array.isArray(apps)) return apps;
  return apps.map((a) => {
    if (typeof a !== "string") return a;
    const entry = registry.apps[a];
    return entry ? Object.assign({ id: entry.storeId }, entry) : { name: a };
  });
}

/**
 * Sibling article for hreflang. Pairing is explicit via `translationKey`
 * in front matter (same key in both files); filename is only a fallback.
 * URLs follow each file's own language: content/news/<es-slug>.html and
 * content/news/en/<en-slug>.html. Returns absolute URLs or {}.
 */
const KEY_RE = /^translationKey:\s*["']?([^"'#\n]+?)["']?\s*$/m;

function frontMatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return m ? m[1] : "";
}
function keyOf(file, fallbackBase) {
  try {
    const k = frontMatter(fs.readFileSync(file, "utf8")).match(KEY_RE);
    return k ? k[1].trim() : fallbackBase;
  } catch (e) {
    return fallbackBase;
  }
}
function baseOf(file) {
  return path.basename(file).replace(/\.[^.]+$/, "");
}

function listingAlternates(input) {
  if (/news-en-index\.njk$/.test(input) || /news-index\.njk$/.test(input)) {
    return {
      es: `${site.domain}/news/`,
      en: `${site.domain}/news/en/`,
    };
  }
  return null;
}

function alternatesFor(data) {
  const input = data.page && data.page.inputPath;
  const listing = input && listingAlternates(input);
  if (listing) return listing;
  if (!input || !/\.md$/.test(input)) return data.alternates || {};
  const lang = langOf(input);
  const ownBase = baseOf(input);
  const ownKey = keyOf(input, ownBase);
  const ownDir = path.dirname(input);
  const otherDir = lang === "en" ? path.dirname(ownDir) : path.join(ownDir, "en");

  let esBase = lang === "en" ? null : ownBase;
  let enBase = lang === "en" ? ownBase : null;

  try {
    for (const f of fs.readdirSync(otherDir)) {
      if (!f.endsWith(".md")) continue;
      const p = path.join(otherDir, f);
      if (path.resolve(p) === path.resolve(input)) continue;
      if (keyOf(p, baseOf(p)) === ownKey) {
        if (lang === "en") esBase = baseOf(f);
        else enBase = baseOf(f);
        break;
      }
    }
  } catch (e) {
    /* no sibling dir → no alternates */
  }

  if (!esBase || !enBase) return {};
  return {
    es: `${site.domain}/news/${esBase}.html`,
    en: `${site.domain}/news/en/${enBase}.html`,
  };
}

function buildGraph(data) {
  const url = data.canonical;
  const slug = (data.page && data.page.fileSlug) || "";
  const lang = isArticle(data) ? langOf(data.page.inputPath) : data.lang || "es";
  const langCode = lang === "en" ? "en-US" : "es-ES";
  const labelNews = lang === "en" ? "News" : "Noticias";
  const labelHome = lang === "en" ? "Home" : "Inicio";
  const newsUrl = lang === "en" ? `${site.url}news/en/` : `${site.url}news/`;
  /* resolve registry refs defensively (works regardless of computed order) */
  const author = resolveRef(data.author, registry.authors, lang);
  const reviewer = resolveRef(data.reviewer, registry.reviewers, lang);
  /* Eleventy runs computeds against a proxy during dependency detection:
     only treat a real array as the apps list (proxies → []). */
  const apps = Array.isArray(data.apps)
    ? resolveApps(data.apps).filter((a) => a && typeof a === "object")
    : [];
  const image = data.image || registry.defaultImage;
  const storeUrl = (app) =>
    site.storeBase ? `${site.storeBase}${app.storeId || app.id}` : "";
  const graph = [];

  /* 1. WebSite ------------------------------------------------ */
  graph.push({
    "@type": "WebSite",
    "@id": `${site.url}#site`,
    url: site.url,
    name: site.name,
    inLanguage: ["es-ES", "en-US"],
    publisher: { "@id": `${site.url}#org` },
  });

  /* 2. Organization (E-E-A-T publisher) ----------------------- */
  graph.push({
    "@type": "Organization",
    "@id": `${site.url}#org`,
    name: site.name,
    url: site.url,
    logo: `${site.domain}${site.assets}/logo.svg`,
    email: site.email,
    sameAs: [site.social.twitter && `https://x.com/${site.social.twitter.slice(1)}`,
      site.social.github, site.social.mastodon, `https://www.linkedin.com/company/${site.social.linkedin}`]
      .filter(Boolean),
  });

  /* 3. Author as Person (E-E-A-T) ----------------------------- */
  const authorRef = author && author.name
    ? { "@id": `${url}#author` }
    : { "@id": `${site.url}#org` };
  if (author && author.name) {
    graph.push({
      "@type": "Person",
      "@id": `${url}#author`,
      name: author.name,
      jobTitle: author.role,
      description: author.bio,
      ...(author.image ? { image: absUrl(author.image) } : {}),
      ...(author.url ? { url: absUrl(author.url) } : {}),
      worksFor: { "@id": `${site.url}#org` },
      sameAs: author.sameAs || [],
    });
  }

  /* 4. WebPage + Breadcrumb + Speakable (GEO) ----------------- */
  graph.push({
    "@type": "WebPage",
    "@id": `${url}#webpage`,
    url,
    name: `${data.title} · ${site.name}`,
    description: data.description,
    inLanguage: langCode,
    isPartOf: { "@id": `${site.url}#site` },
    breadcrumb: { "@id": `${url}#breadcrumb` },
    primaryImageOfPage: absUrl(image && image.src) || absUrl(site.ogImage),
    speakable: {
      "@type": "SpeakableSpecification",
      cssSelector: [".answer", ".bluf"],
    },
    datePublished: iso(data.pubDate),
    dateModified: iso(data.updatedDate || data.pubDate),
  });

  graph.push({
    "@type": "BreadcrumbList",
    "@id": `${url}#breadcrumb`,
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Inicio", item: site.url },
      { "@type": "ListItem", position: 2, name: labelNews, item: `${site.url}news/` },
      { "@type": "ListItem", position: 3, name: data.title, item: url },
    ],
  });

  /* 5. NewsArticle -------------------------------------------- */
  const article = {
    "@type": "NewsArticle",
    "@id": `${url}#article`,
    mainEntityOfPage: { "@id": `${url}#webpage` },
    headline: data.title,
    description: data.description,
    image: [absUrl(image && image.src) || absUrl(site.ogImage)],
    datePublished: iso(data.pubDate),
    dateModified: iso(data.updatedDate || data.pubDate),
    inLanguage: langCode,
    articleSection: data.section || "News",
    author: authorRef,
    publisher: { "@id": `${site.url}#org` },
    keywords: (data.tags || []).join(", "),
    category: (data.categories || []).join(", "),
  };
  if (image && image.width) {
    article.image = [
      {
        "@type": "ImageObject",
        url: absUrl(image.src),
        width: image.width,
        height: image.height,
        caption: image.alt,
      },
    ];
  }
  graph.push(article);

  /* 6. Review (E-E-A-T, only for section: review) ------------- */
  if (data.section === "review" && reviewer && reviewer.name) {
    graph.push({
      "@type": "Review",
      "@id": `${url}#review`,
      url,
      datePublished: iso(data.reviewedDate || data.pubDate),
      reviewBody: data.bluf || data.description,
      author: {
        "@type": "Person",
        name: reviewer.name,
        jobTitle: reviewer.role,
        description: reviewer.credentials,
        sameAs: reviewer.sameAs || [],
      },
      itemReviewed:
        apps.length
          ? { "@type": "SoftwareApplication", name: apps[0].name }
          : { "@type": "Thing", name: data.title },
    });
  }

  /* 7. SoftwareApplication ×N (ASO) --------------------------- */
  for (const app of apps) {
    const sUrl = storeUrl(app); /* "" while site.storeBase is empty (stores not live) */
    graph.push({
      "@type": "SoftwareApplication",
      name: app.name,
      applicationCategory: app.category || "MobileApplication",
      operatingSystem: "ANDROID, IOS",
      description:
        app.description ||
        (lang === "en" ? `${data.title} — recommended app` : `${data.title} — app recomendada`),
      offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
      ...(sUrl ? { installUrl: sUrl, url: sUrl } : {}),
    });
  }

  /* 8. FAQPage (GEO/LLMO) ------------------------------------- */
  if (Array.isArray(data.faq) && data.faq.length) {
    graph.push({
      "@type": "FAQPage",
      "@id": `${url}#faq`,
      mainEntity: data.faq.map((q) => ({
        "@type": "Question",
        name: q.question,
        acceptedAnswer: { "@type": "Answer", text: q.answer },
      })),
    });
  }

  /* 9. VideoObject (media feeds) ------------------------------ */
  if (data.video && data.video.src) {
    graph.push({
      "@type": "VideoObject",
      name: data.title,
      description: data.description,
      contentUrl: data.video.src,
      thumbnailUrl: [absUrl(data.video.poster) || absUrl(site.ogImage)],
      uploadDate: iso(data.pubDate),
      duration: data.video.duration ? `PT${data.video.duration}S` : undefined,
    });
  }

  return graph;
}

const eleventyComputed = {
  /* registry refs: author 'marta' / reviewer 'default' → full objects */
  author: (data) => resolveRef(data.author, registry.authors, langOfData(data)),
  reviewer: (data) => resolveRef(data.reviewer, registry.reviewers, langOfData(data)),
  apps: (data) => resolveApps(data.apps),

  /* image falls back to the global default (og + twitter) ----------- */
  image: (data) => data.image || registry.defaultImage,

  /* x-default hreflang URL (site.xDefault picks the language) ------- */
  xDefaultUrl: (data) => {
    const a = data.alternates;
    if (!a || !a.es || !a.en) return "";
    return a[site.xDefault || "es"] || a.es;
  },

  /* page language (articles derive it from their path) ------------- */
  lang: (data) =>
    isArticle(data) ? langOf(data.page.inputPath) : data.lang || "es",

  /* news index for this language (used by nav/breadcrumb) ---------- */
  newsIndex: (data) => {
    const lang = isArticle(data) ? langOf(data.page.inputPath) : data.lang || "es";
    return lang === "en" ? "/news/en/" : "/news/";
  },

  /* rel=prev/next for article pagination --------------------------- */
  prev: (data) => {
    if (!isArticle(data)) return null;
    const lang = langOf(data.page.inputPath);
    const coll = lang === "en" ? (data.collections && data.collections.newsEn) : (data.collections && data.collections.newsEs);
    if (!coll) return null;
    const idx = coll.findIndex((p) => p.data.page && p.data.page.fileSlug === data.page.fileSlug);
    if (idx > 0) return coll[idx - 1];
    return null;
  },
  next: (data) => {
    if (!isArticle(data)) return null;
    const lang = langOf(data.page.inputPath);
    const coll = lang === "en" ? (data.collections && data.collections.newsEn) : (data.collections && data.collections.newsEs);
    if (!coll) return null;
    const idx = coll.findIndex((p) => p.data.page && p.data.page.fileSlug === data.page.fileSlug);
    if (idx >= 0 && idx < coll.length - 1) return coll[idx + 1];
    return null;
  },

  /* hreflang pair — only when a translation really exists ----------- */
  alternates: (data) => alternatesFor(data),

  /* canonical URL ------------------------------------------------ */
  canonical: (data) => {
    if (data.canonicalOverride) return data.canonicalOverride;
    const input = data.page && data.page.inputPath;
    if (input && /news-en-index\.njk$/.test(input)) return `${site.domain}/news/en/`;
    if (input && /news-index\.njk$/.test(input)) return `${site.domain}/news/`;
    if (isArticle(data)) {
      const lang = langOf(data.page.inputPath);
      const slug = data.page.fileSlug;
      return lang === "en"
        ? `${site.domain}/news/en/${slug}.html`
        : `${site.domain}/news/${slug}.html`;
    }
    return site.domain + ((data.page && data.page.url) || "/");
  },

  /* robots ------------------------------------------------------- */
  robots: (data) =>
    data.noindex
      ? "noindex, nofollow"
      : "index, follow, max-image-preview:large, max-snippet:-1",

  /* fediverse host (mastodon.social for fed:server meta) --------- */
  fedServer: () => {
    try {
      return new URL(site.social.mastodon).host;
    } catch (e) {
      return "";
    }
  },

  /* whole JSON-LD graph as a JSON string ------------------------ */
  jsonld: (data) => {
    if (!isArticle(data) || !data.title) return "";
    return JSON.stringify(
      { "@context": "https://schema.org", "@graph": buildGraph(data) },
      null,
      2
    ).replace(/</g, "\\u003c");
  },
};

module.exports = { eleventyComputed };
