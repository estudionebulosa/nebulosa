# ADR-0001: How to convert Markdown articles into HTML

- **Status:** Accepted — implemented with Eleventy 3 (`npm run build` → `_site`)
- **Date:** 2026-10-01
- **Deciders:** Nebulosa Estudio
- **Related:** ADR-0002 (single `/news` articles section)

## Context

The site is a plain static HTML property (`index.html` + `/news` + `/assets`),
deployed to **Cloudflare Pages**, with no build step today.

Content reality:

- ~12 drafts exist as `news/*.md` with **YAML front matter** already shaped like
  Astro content collections (`title`, `description`, `pubDate`, `updatedDate`,
  `author`, `tags`, `image`, `draft`, `faq`).
- Published articles are **hand-written HTML** that duplicates ~150 lines of
  head metadata, styles, nav and footer per page.
- The `.md` files are currently served publicly (they should not be).
- A previous Astro experiment left a stray `content/` build with `example.com`
  canonicals (see README known issues #6).
- `PRD.md` imposes a hard budget: critical path ≤ 100 KB, Lighthouse 100,
  no framework runtime on the critical path.

### Decision drivers

1. **D1 — Sources must not ship.** Markdown lives outside the deployed output.
2. **D2 — Publish by writing markdown**, not by copy-pasting 150 lines of HTML.
3. **D3 — Runs in Cloudflare Pages' build step** (Git push → article live).
4. **D4 — Output keeps the exact current look** (inline CSS, ES/EN spans, JSON-LD).
5. **D5 — Minimal maintenance**; the site has no server, no database, no CMS.
6. **D6 — SEO metadata generated from front matter** (title, description,
   canonical, hreflang, Open Graph, `NewsArticle` JSON-LD, sitemap entry).

## Options

### Option 1 — Custom Node build script (gray-matter + marked)

A single script reads every `content/news/*.md`, parses front matter, renders
the markdown body, injects it into a page shell template, and writes
`news/<slug>.html`.

`package.json`:

```json
{
  "name": "nebulosa",
  "type": "module",
  "scripts": { "build": "node scripts/build-news.mjs" },
  "devDependencies": { "gray-matter": "^4.0.3", "marked": "^12.0.0" }
}
```

`scripts/build-news.mjs`:

```js
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import matter from "gray-matter";
import { marked } from "marked";

const SRC = "content/news";          // markdown sources (not deployed)
const OUT = "news";                  // generated HTML (deployed)
const BASE = "https://nebulosa.estudio";
const shell = await readFile("content/news/_template.html", "utf8");

await mkdir(OUT, { recursive: true });

for (const file of (await readdir(SRC)).filter(f => f.endsWith(".md"))) {
  const slug = file.replace(/\.md$/, "");
  const { data, content } = matter(await readFile(`${SRC}/${file}`, "utf8"));
  if (data.draft) continue;

  const html = shell
    .replaceAll("{{title}}", data.title)
    .replaceAll("{{description}}", data.description)
    .replaceAll("{{url}}", `${BASE}/news/${slug}.html`)
    .replaceAll("{{date}}", String(data.pubDate).slice(0, 10))
    .replaceAll("{{body}}", marked.parse(content));

  await writeFile(`${OUT}/${slug}.html`, html);
  console.log(`✓ news/${slug}.html`);
}
```

`content/news/_template.html` — one copy of the current article shell (head,
theme bootstrap, styles, nav, footer, `{{body}}` placeholder). ES/EN pairs are
written in the template; only body text comes from markdown.

**Cloudflare Pages:** build command `npm run build`, output directory `/`.

- ✅ Keeps the site byte-identical outside article pages (D4).
- ✅ Front matter already fits; `faq:` can become FAQPage JSON-LD (D6).
- ✅ Dependencies are build-time only — nothing ships to the browser (PRD).
- ❌ You own the script: new markdown features (tables, footnotes, syntax
  highlighting) need explicit plugin wiring.

### Option 2 — Astro static site generator

Move the site into an Astro project; markdown becomes first-class content.

`src/content.config.ts` (matches the existing front matter):

```ts
import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const news = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./content/news" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
    image: z.string().optional(),
    draft: z.boolean().default(false),
    bluf: z.string().optional(),
    faq: z.array(z.object({ question: z.string(), answer: z.string() })).optional(),
  }),
});

export const collections = { news };
```

`src/pages/news/[slug].astro`:

```astro
---
import { getCollection } from "astro:content";
export async function getStaticPaths() {
  const posts = await getCollection("news", ({ data }) => !data.draft);
  return posts.map((p) => ({ params: { slug: p.id }, props: { p } }));
}
const { p } = Astro.props;
const { Content } = await p.render();
---
<html lang="es">
  <head>
    <title>{p.data.title} · Nebulosa Estudio</title>
    <meta name="description" content={p.data.description} />
    <link rel="canonical" href={`https://nebulosa.estudio/news/${p.id}.html`} />
  </head>
  <body><article><Content /></article></body>
</html>
```

**Cloudflare Pages:** build command `npm run build`, output directory `dist`.

- ✅ RSS (`/@id/rss.xml`), sitemap, tag pages, pagination for free.
- ✅ Front matter already validates as-is — clearly the original intent (the
  leftover `content/_astro/` proves the attempt).
- ❌ The whole site becomes a Node project; `index.html`'s inline CSS must be
  ported into a layout/component (largest migration risk).
- ❌ Heaviest dependency surface for a site whose PRD demands ~0 KB JS.

### Option 3 — Pandoc + Makefile (no Node)

Each `.md` is rendered into the shell with pandoc's `--template`.

`Makefile`:

```makefile
SRC := $(wildcard content/news/*.md)
OUT := $(patsubst content/news/%.md,news/%.html,$(SRC))

news/%.html: content/news/%.html content/news/_template.html
	pandoc "$<" \
	  --template=content/news/_template.html \
	  --metadata-file=content/news/meta.yml \
	  -s -f markdown+yaml_metadata_block \
	  -o "$@"

build: $(OUT)
```

```bash
make build
```

- ✅ One binary, no `node_modules`, extremely fast, deterministic.
- ✅ YAML front matter is natively understood (`+yaml_metadata_block`).
- ❌ Pandoc must be installed locally **and** in Cloudflare's build image
  (adds a CI install step or a custom build container).
- ❌ Template syntax is pandoc's own (`$title$`), so the shell cannot be a
  plain copy of the current HTML page — it needs conversion.
- ❌ Less natural fit for the ES/EN `lang` span pattern and JSON-LD blocks
  (possible with partials, but clunkier than Option 1's string replacement).

### Option 4 — No build: hand-written HTML

Status quo, formalised: markdown drafts stay as notes; a new article means
duplicating an existing `.html` and editing it.

```bash
cp news/las-mejores-apps-salud-2026.html news/mi-noticia.html
# then edit <title>, meta, JSON-LD, nav "current", body, sitemap.xml …
```

- ✅ Zero tooling, zero CI, nothing to break or maintain.
- ❌ Violates D2 and D6: 150 lines of metadata per article, easy to ship a
  wrong canonical/OG URL — already evidenced by the orphan pages and the
  stale `sitemap.xml` (README issues #9, #10).
- ❌ The 12 existing drafts will almost certainly never be published this way.

## Comparison

| | D2 publish from md | D4 keep current look | D5 maintenance | D6 SEO automation | CI on Cloudflare | Weight |
|---|---|---|---|---|---|---|
| **1. Node script** | ✅ | ✅ exact | ✅ one small file | ✅ full control | ✅ `npm run build` | ~50 KB devDeps, build-time only |
| **2. Astro** | ✅ | ⚠️ port required | ✅ framework owns it | ✅ built-in | ✅ `npm run build` → `dist` | Whole site becomes a project |
| **3. Pandoc** | ✅ | ⚠️ template syntax | ✅ trivial | ⚠️ partial | ⚠️ needs pandoc in CI | One binary |
| **4. No build** | ❌ | ✅ | ❌ manual copy | ❌ manual | ✅ nothing to build | None |

## Decision

_**Option 1 accepted** (Eleventy 3) — see Status; implemented 2026-10-01._

**Recommendation: Option 1.** It satisfies every driver with the smallest
change: sources move out of the public root, one template replaces the
copy-pasted HTML shell, Cloudflare rebuilds on push, and the landing page
stays untouched. Option 2 is the right call only if the project expects many
more sections (tags, RSS, authors, pagination) within the next quarter.

## Consequences

- `content/news/*.md` stops being publicly served; `news/*.html` becomes
  generated output and is edited only by the script.
- `_template.html` becomes the single source of truth for an article's
  head/styles/nav — changing the site chrome means editing one file.
- Cloudflare Pages build command must be configured (`npm run build`), which
  also means the project needs a Git repository.
- The sitemap still has to be updated (either manually, or the script can
  append entries — noted as a follow-up in README issue #10).
