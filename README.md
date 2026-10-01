# nebulosa.estudio

Marketing site for **Nebulosa Estudio**, an independent mobile-app studio.
A single-domain static property: a landing page and a bilingual (ES/EN)
articles section generated from **Markdown with Eleventy**, plus a local admin
page to edit all template data — deployed worldwide via **Cloudflare**.

Performance targets come from [`PRD.md`](./PRD.md) (LCP ≤ 1.2s, Lighthouse 100,
critical path ≤ 100 KB). The build output is fully static — no runtime JS
frameworks on the critical path.

---

## 1. Summary (resume)

| | |
|---|---|
| **Type** | Static site generated with **Eleventy 3** (Markdown + Nunjucks → HTML) |
| **Language** | Spanish (default) + English — **one file per language**, paired by `translationKey` |
| **Themes** | `auto` / `light` / `dark`, persisted in `localStorage` (`neb-theme`) |
| **Content** | `content/news/*.md` (ES) + `content/news/en/*.md` (EN) → `_site/news/**.html` |
| **Admin** | `npm run admin` → local page to edit globals, registry, articles, templates — never deployed |
| **Build** | `npm run build` → `_site/` (this is what Cloudflare Pages deploys) |
| **Hosting** | Cloudflare Pages (global edge network), custom domain `nebulosa.estudio` |
| **Status** | Draft — see [§4 Known issues](#4-known-issues-fix-before-launch) |

The site is three things:

1. **Landing page** (`/`) — hero, portfolio of 4 apps, services, process,
   latest articles, about, contact form. Built through
   `layouts/landing.njk`: shared nav/footer/toggles partials, data-driven
   head (site.json) and the design-specific CSS/JSON-LD as partials.
2. **Articles** (`/news/` + `/news/en/`) — generated from markdown, fully
   bilingual with real `hreflang` alternates; `/blog` merges into `/news`
   with 301s (ADR-0002).
3. **Admin** (`http://127.0.0.1:8081/admin/`) — local-only editor for the
   md→html layer: `site.json`, `registry.json`, article front matter + body,
   and the Nunjucks templates.

---

## 2. File content (estructura)

```
nebulosa/
├── eleventy.config.js    # filters, collections (news / newsEs / newsEn),
│                         # passthroughs, admin gate (NEB_ADMIN=1)
├── package.json          # npm run dev | build | admin
├── PRD.md                # Product requirements & performance budget
├── README.md             # This file
│
├── docs/
│   ├── adr/              # ADR-0001 (md→html: Eleventy), ADR-0002 (/blog→/news)
│   ├── admin-fields.md   # Field model: G / R / L / A / S layers + admin spec
│   └── features/         # Feature docs (bilingual one-file-per-language)
│
├── tools/
│   └── admin-server.mjs  # Local-only companion server: serves _site +
│                         # POST /api/save (whitelist) + /api/build
│
├── content/              # ── SOURCE (Eleventy input) ──
│   ├── _data/
│   │   ├── site.json     # G layer: identity, social, feeds, nav, footer,
│   │   │                 #   share, storeBase, readingWpm, xDefault
│   │   └── registry.json # R layer: authors, reviewers, apps, defaultImage, vocab
│   ├── _includes/
│   │   ├── layouts/      # article.njk, list.njk, landing.njk
│   │   └── partials/     # nav, footer, theme-boot, lang-boot, toggles,
│   │                     #   styles, landing-styles, landing-jsonld, admin-app
│   ├── news/             # ES articles (.md) — the only articles section
│   │   └── en/           # EN articles (.md) — file language = URL language
│   ├── index.html        # Landing: front matter + <main> (layout = landing.njk)
│   ├── news-index.njk    # /news/ listing (built from the collection)
│   ├── news-en-index.njk # /news/en/ listing
│   ├── feed.njk          # /feed.xml — RSS 2.0 + Media RSS (content:encoded)
│   ├── feed-json.njk     # /feed.json — JSON Feed v1.1
│   ├── sitemap.njk       # /sitemap.xml — xhtml:link hreflang, solo pares reales
│   ├── llms.njk          # /llms.txt — índice machine-readable (llmstxt.org)
│   └── admin.njk         # Admin page (built ONLY with NEB_ADMIN=1)
│                         #   + admin.11tydata.js (embeds site+registry+articles)
│
├── assets/               # Static assets → _site/assets (favicon, og-image…)
├── _site/                # ⚙ BUILD OUTPUT — deploy this folder
├── archive/              # Retired legacy pages (old indexes, Astro leftovers,
│                         #   legacy news/ + blog/ — jun 10 sources)
└── index.html sitemap.xml           # ⚠ legacy root files, NOT deployed (§4)
```

### Content flow

```
  content/news/<slug-es>.md ─┐
  content/news/en/<slug-en>.md├── npx eleventy ──► _site/news/<slug-es>.html
  content/_data/*.json ──────┤                   _site/news/en/<slug-en>.html
  content/_includes/**.njk ──┘                   _site/news/[en/]index.html
                                                 _site/index.html
```

* **Markdown sources never ship** — only generated HTML is in `_site/`.
* Front matter references the registry (`author: marta`, `reviewer: default`,
  `apps: [pulse, verso]`) and the build resolves names, bios, roles and
  store URLs from `registry.json` / `site.json` (see `docs/admin-fields.md`).
* ES↔EN pairing is done by **`translationKey`**, not by filename: when a
  sibling exists the page emits real `hreflang` alternates + `x-default`
  (controlled by `site.xDefault`); without a sibling, no hreflang is emitted.
* Each file's own name is its URL slug: `content/news/en/<slug>.md` →
  `/news/en/<slug>.html`.

### Page anatomy (generated pages)

* `article.njk` / `list.njk` layouts with shared partials: sticky nav
  (from `site.nav`), footer (loops `site.footerLinks`), theme boot.
* Head: canonical, conditional `hreflang`, OG/Twitter (image from
  `registry.defaultImage` unless the article overrides `image:`),
  RSS+JSON Feed discovery, ~10 JSON-LD nodes (Organization, WebSite,
  WebPage, Article, FAQPage, BreadcrumbList, SoftwareApplication…).
* Byline/reviewer rendered from the registry, localized per language
  (`bioEn`, `roleEn`, `credentialsEn` are used automatically in EN).
* Share buttons loop `site.share` with `{u}`/`{t}` tokens; store badges
  built from `site.storeBase` + resolved app ids.
* Reading time from `site.readingWpm`; dates formatted per language.

---

## 3. How to (¿cómo?)

### 3.1 Preview locally

```bash
cd nebulosa
npm install          # once
npm run dev          # eleventy --serve → http://localhost:8080/
```

Eleventy rebuilds on save. The build output can also be served statically:

```bash
npm run build
python3 -m http.server 8765 --directory _site
```

### 3.2 Add a news article

1. Create `content/news/<slug-es>.md` (Spanish) and/or
   `content/news/en/<slug-en>.md` (English) with YAML front matter —
   field reference: [`docs/admin-fields.md`](./docs/admin-fields.md).
   *Or use the admin page (§3.4) — "＋ Nuevo artículo" scaffolds the file.*
2. **Bilingual pairing:** give both files the same `translationKey` →
   each page gets real `hreflang` alternates and a language notice.
   No sibling → no hreflang (honest, nothing invented).
3. Front matter references shared data instead of repeating it:
   `author: marta`, `reviewer: default`, `apps: [pulse, verso]`, omit
   `image:` to use the global OG image. New registry entries can be
   created from the admin's Registry tab.
4. Build: `npm run build` → `_site/news/<slug>.html`
   (`_site/news/en/<slug>.html`). The article appears in the section
   index automatically (it is built from the Eleventy collection).
5. Drafts: `draft: true` keeps the page out of the listings (and
   `noindex: true` out of the index).

### 3.3 Deploy to Cloudflare (worldwide)

**Option A — Git integration (recommended)**

1. Push the repo to GitHub/GitLab.
2. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**.
3. Build settings:
   * **Build command:** `npm run build`
   * **Build output directory:** `_site`
   * **Node version:** 18+ (Eleventy 3)
4. Deploy. Every push to `main` triggers a new deploy with instant rollback.

**Option B — Direct upload (no Git)**

```bash
npm install -g wrangler
npm run build
wrangler pages deploy _site --project-name=nebulosa
```

**Custom domain**

1. Cloudflare Pages → your project → **Custom domains** → add `nebulosa.estudio`.
2. Move the domain's DNS to Cloudflare (nameservers) — this also gives the
   global CDN, TLS and the edge network the PRD asks for.

**404 handling:** Cloudflare Pages automatically serves `/404.html`
(copied into the build output).

### 3.4 Admin page (local, never deployed)

```bash
npm run admin       # NEB_ADMIN=1 build + companion server
# → http://127.0.0.1:8081/admin/
```

Tabs:

| Tab | Edits | Target file |
|---|---|---|
| **Global** | identity, social, feeds, assets, theme, nav, footer, share, constants | `content/_data/site.json` |
| **Registry** | authors, reviewers, apps, default image, vocabularies | `content/_data/registry.json` |
| **Artículos** | front matter form (+ validation), YAML view, markdown body, "＋ Nuevo" | `content/news/**/*.md` |
| **Plantillas** | plain editor for the Nunjucks layouts/partials (no preview) | `content/_includes/**/*.njk` |
| **Preview** | SERP snippet, social card, computed values (canonical, hreflang map, reading time…) | read-only |

* Saving = `POST /api/save` on a **path whitelist** (nothing outside
  `content/_data`, `content/news`, `content/_includes` can be written) →
  automatic rebuild (`POST /api/build`) → page reloads.
* Front-matter saves are **comment-preserving**: keys you did not touch
  keep their YAML formatting and `# ── section ──` headers verbatim;
  only changed keys are re-emitted.
* Validation on save: title ≤ 60, description 140–160, `answer` ≤ 30
  words, every `stat` needs a `source`, `translationKey` collision within
  the same language = error, `draft:false` without `pubDate` = error,
  kebab-case filenames.
* The admin only exists with `NEB_ADMIN=1`: production builds ignore
  `content/admin.njk` **and delete** any stale `_site/admin`, so it can
  never ship.

### 3.5 Contact form (⚠ not working yet)

The landing form posts to `/api/contact`, which does not exist on a static
host (404). Pick one:

| Option | Effort | Notes |
|---|---|---|
| **Cloudflare Pages Function** | Low | Add `functions/api/contact.ts`, forward to Email/Web3Forms/Resend. Keeps the same URL. |
| **Third-party endpoint** | Lowest | Change `action` to Formspree/Web3Forms/Basin URL. No backend to run. |
| `mailto:` link | None | Worst UX, but zero setup. |

### 3.6 SEO checklist per publish

- [ ] `<title>` ≤ 60 chars and `description` 140–160 (admin warns on save)
- [ ] Canonical auto-generated — confirm it in **Preview** tab
- [ ] `og:image` resolves (200) — default from `registry.defaultImage`
- [ ] ES **and** EN versions share the same `translationKey` (or none at all)
- [ ] Linked from the section index (automatic — listings come from the collection)
- [ ] `answer` ≤ 30 words · every `stat` has a `source` · citations use http(s)
- [ ] Sitemap/feed inclusion: **automatic** — every publish lands in `sitemap.xml` (hreflang pairs), `feed.xml` (RSS+MRSS), `feed.json` and `llms.txt`; `noindex`/`draft` are excluded

---

## 4. Known issues (fix before launch)

| # | Issue | Where |
|---|---|---|
| 1 | Contact form posts to `/api/contact` → 404 *(user decision: leave open for now)* | `content/index.html` |
| 2 | ~~Google Play links use demo app ids (`app.nebulosa.*`) → 404~~ **✅ resolved** (user decision: «próximamente») — `site.storeBase` is now `""`: badges render without `href` + «Próximamente en / Coming soon to» labels (landing cards + article layout), `installUrl` removed from every JSON-LD, dead Play citation dropped from the demo review. Setting a real `storeBase` in admin (Global → Play Store base) re-enables all links automatically | `content/_data/site.json` |
| 3 | ~~`/assets/apple-touch-icon.png` missing → 404~~ **✅ resolved** — generated 180×180 from `favicon.svg` (opaque brand background). Same pass: `og:image`/`twitter:image` migrated **SVG → PNG** (crawlers reject SVG: home + `site.ogImage` + `registry.defaultImage`, feeds included), author avatar `assets/authors/marta.webp` created (JSON-LD `Person.image`), and the useless `og-image` preload removed | `assets/` |
| 4 | ~~**English hero headline invisible** — `<span lang="es">` never closed~~ **✅ resolved** — verified: `html.parser` nesting check = 0 errors on source and built page; EN/ES spans are properly closed | `content/index.html` hero |
| 5 | ~~Invalid CSS: `@media` block with declarations and no selector~~ **✅ resolved** — verified with `tinycss2`: 123 rules, 0 errors; all 13 `@media` blocks sit at root level with proper selectors (source and `_site`) | `content/index.html` |
| 6 | ~~Stray Astro build~~ **✅ resolved** — `content/` is now the Eleventy source tree; Astro leftovers moved to `archive/` | — |
| 7 | ~~Junk files in legacy dirs~~ **✅ resolved** — `news/` and `blog/` retired to `archive/news-legacy-jun10/` + `archive/blog-legacy/` | — |
| 8 | ~~Legacy `news/*.md` drafts not migrated~~ **✅ resolved** — 10 drafts ported to `content/news/` (kebab slugs, full front matter, FAQs promoted to `faq:`) + `como-creamos-apps-moviles` ported as an ES/EN pair. The 2 hand-written `news/*.html` were audited: both are the *same* article ("Los 3 documentos…", 85 % similar), `documento-optimizacion-…` is a defective draft (mixed examples, placeholder canonical) and `como-escribir-html-para-la-ia` was **already consolidated** into `documento-pagina-web-para-ias-y-humanos.md` (3 templates + 2-phase methodology match). No unique content left to port → their old URLs now **301 → the consolidated article** (`_redirects`), avoiding duplicate-content cannibalization | `archive/news-legacy-jun10/`, `_redirects` |
| 9 | ~~`/blog/*` redirects pending~~ **✅ resolved** — root `_redirects` (`/blog/* → /news/:splat` 301) ships via passthrough; the admin server emulates the rules locally (ADR-0002); the landing no longer links `/blog` (nav/footer "Blog" entries removed as duplicates of "Noticias", cards + CTA point to `/news/`) | `_redirects` |
| 10 | ~~`sitemap.xml`, `feed.xml`, `feed.json`, `llms.txt` not generated~~ **✅ resolved** — built from `content/{feed,feed-json,sitemap,llms}.njk` (hreflang pairs by `translationKey`, honest alternates); the legacy root `sitemap.xml` (with `?lang=` hreflang) stays unshipped | — |
| 11 | ~~Copy typos: "fuegos artifiales", "cuidados ," spacing~~ **✅ resolved** — verified absent | — |
| 12 | Domain `nebulosa.estudio` does not resolve yet | DNS |
| 13 | ~~Landing is still the legacy single-file page (not the Eleventy layout/partials)~~ **✅ resolved** — `content/index.html` is now front matter + `<main>` on `layouts/landing.njk`: data-driven head from `site.json` (canonical/hreflang/feeds/OG/Twitter, +`sitemap`/`llms` discovery), shared `nav`/`footer`/`theme-boot`/`toggles` partials (toggle JS de-duplicated across landing/article/list, list pages now honour `data-alt-*`), landing CSS/JSON-LD/lang-boot as partials. Parity verified: `<main>` byte-identical, CSS byte-identical, JSON-LD equal, all 25 old head elements present, home 89,935 B ≤ 100 KB | `content/index.html` |

---

## 5. Design tokens

| Token | Dark | Light |
|---|---|---|
| `--bg` | `#0a0a14` | `#fafafc` |
| `--surface` | `#11111d` | `#ffffff` |
| `--accent` | `#8b5cf6` | `#8b5cf6` |
| `--accent-2` | `#ec4899` | `#ec4899` |
| `--accent-3` | `#22d3ee` | `#22d3ee` |
| `--maxw` | `1120px` (intended `1600px` ≥1200px — see issue #5) | |

Accessibility: skip-link, `:focus-visible` outlines, `prefers-reduced-motion`
kills all animations, `aria-label`s on icon buttons, `color-scheme` meta.

---

## 6. Performance budget (from PRD.md)

| Resource | Budget |
|---|---|
| Critical HTML | ≤ 14 KB |
| Inlined critical CSS | ≤ 8 KB |
| Initial JS | ≤ 0 KB preferred, ≤ 15 KB hard |
| Web fonts | ≤ 25 KB × 1 family |
| **Total critical** | **≤ 100 KB** |

Gate: Lighthouse 100/100/100/100 on mobile.
