# Admin field model — where every template placeholder comes from

**Scope:** `article.njk`, `list.njk`, `nav/footer/styles` partials, `content.11tydata.js`.
**Purpose:** classify every placeholder so an admin page knows *what* to edit,
*where* it saves, and what must never be edited by hand.

---

## The four layers

| Layer | Definition | Saved in | Editable in admin |
|---|---|---|---|
| **G — Global** | Identical on every page; edit once, affects whole site | `content/_data/site.json` | ✅ "Global" tab |
| **R — Registry** | Repeated *per article* today → promote to shared defaults with per-article override | `content/_data/registry.json` (new) | ✅ "Registry" tab |
| **L — Local** | Belongs to one article | `content/news/**/*.md` front matter | ✅ "Articles" tab |
| **A — Auto** | Derived at build time; never typed by a human | *(nowhere — computed)* | ⛔ read-only preview |
| **S — Structural** | Template/CSS/markup logic | `content/_includes/**` | ❌ developer only |

---

## G — Global fields (edit once, `site.json`)

| Field | Example | Used by |
|---|---|---|
| `name` | Nebulosa Estudio | `<title>` suffix, meta author, og:site_name, JSON-LD |
| `domain` | `https://nebulosa.estudio` | **every** absolute URL, canonical base, JSON-LD |
| `url` | `https://nebulosa.estudio/` | JSON-LD WebSite/Organization |
| `locale` / `localeAlt` | `es_ES` / `en_US` | og:locale ×2 |
| `email` | hola@nebulosa.estudio | footer, Organization JSON-LD |
| `rss` `jsonFeed` `sitemap` `llms` | `/feed.xml` … | `<link rel=alternate>` ×4 |
| `favicon` `appleTouchIcon` `ogImage` | `/assets/…` | icons + image fallback |
| `themeDark` `themeLight` | `#0a0a14` / `#fafafc` | meta theme-color ×2 |
| `social.twitter` | `@nebulosa` | twitter:site, Organization sameAs |
| `social.twitterCreator` | `@marta_dev` | twitter:creator (default author handle) |
| `social.mastodon` | `https://mastodon.social/@nebulosa` | `rel=me` + **`fed:server` (auto-extracted)** |
| `social.linkedin` | `nebulosa-estudio` | linkedin:owner, Organization sameAs |
| `social.github` | URL | Organization sameAs |
| `social.siteName` | Nebulosa Estudio | og:site_name |
| `manifest` | `/site.webmanifest` | *(declared, file missing)* |
| `nav[]` | label-es/label-en/href ×6 | nav partial ← `site.nav` ✅ |
| `footerLinks[]` | label/href ×5 | footer partial ← `site.footerLinks` ✅ |
| `share[]` | X/LinkedIn/WhatsApp/Telegram/Email endpoints | share row ← `site.share` ✅ |
| `storeBase` | `https://play.google.com/store/apps/details?id=` | ASO badges + JSON-LD installUrl |
| `readingWpm` | 200 | reading-time (A) |
| `xDefault` | `es` | hreflang x-default language (A) |
| `year` | ⛔ **auto** — current year at build | footer |

✅ **Fully executable** — all G values live in `content/_data/site.json`
(nav, footer, share, storeBase, readingWpm, xDefault included; no more
hard-coded constants in partials).

---

## R — Registry: repeated per article → shared defaults

✅ **Implemented** in `content/_data/registry.json` (except `publishers[]`).
An article front matter *overrides* the default with an inline object.

| Field | Was repeated in… | Registry entry | Override |
|---|---|---|---|
| `author` | same Marta Ruiz block in every ES + EN file | `authors.marta` (+ `bioEn` for EN pages) | inline object |
| `reviewer` | identical in every review | `reviewers.default` (+ `roleEn`/`credentialsEn`) | inline |
| `apps[]` | Pulse/Verso blocks repeated in articles + JSON-LD | `apps{ pulse, verso → name, storeId, category }` | article lists **ids only**: `apps: [pulse, verso]` |
| `image` | same og-image 1200×630 everywhere | `defaultImage{src,alt,w,h,type}` (auto when omitted) | per-article override |
| `categories` vocabulary | free text → drift | `vocab.categories[]` allowed values | pick from list |
| `tags` vocabulary | free text | `vocab.tags[]` suggestions | autocomplete |
| `section` | news/review/guide/tutorial | `vocab.sections[]` | select |
| `citations` publishers | SensorTower, Google Play… | *(pending)* | one-off entries |

Benefit: change the Play Store id of Pulse **once**, and every article's badge
and `SoftwareApplication` JSON-LD update on rebuild.

---

## L — Local article fields (front matter)

### Identity & publishing
| Field | Type | Notes |
|---|---|---|
| `title` | text, ≤60 | required; becomes `<title>`, og:title, H1, JSON-LD headline |
| `description` | text, 140–160 | required; meta + og + twitter + JSON-LD |
| `slug` | text | label only — **URL comes from filename** |
| `translationKey` | text | pairs ES↔EN for hreflang; absent = untranslated |
| `section` | select (R) | news / review / guide / tutorial |
| `lang` | ⛔ auto from path | `content/news/en/` → `en` |
| `draft` | bool | true = excluded from *everything* |
| `noindex` | bool | robots → noindex |
| `featured` | bool | candidate for landing #novedades |
| `canonicalOverride` | url | advanced/syndication only |
| `permalink` | ⛔ structural | derived from path convention |

### Dates (E-E-A-T)
| Field | Type |
|---|---|
| `pubDate` | datetime — drives JSON-LD datePublished, sort order, feed |
| `updatedDate` | date — "Actualizado" banner + dateModified |
| `reviewedDate` | date — Review JSON-LD (section=review only) |

### People (E-E-A-T)
| Field | Type |
|---|---|
| `author` | ref → registry **or** inline {name, role, bio, image, url, sameAs[]} |
| `reviewer` | ref → registry **or** inline {name, role, credentials, sameAs[]} |

### GEO/LLMO blocks
| Field | Type |
|---|---|
| `answer` | one sentence ≤30 words — `.answer` box + Speakable |
| `bluf` | one paragraph — `.bluf` box + Speakable |
| `keyTakeaways[]` | list of strings |
| `faq[]` | list of {question, answer} — body **and** FAQPage JSON-LD |
| `stats[]` | list of {label, value, source} — every stat needs a source |
| `citations[]` | list of {title, url, publisher, date} |

### Media & social
| Field | Type |
|---|---|
| `image` | ref → defaultImage **or** {src, alt, width, height, type} |
| `video` | {src, poster, duration} — og:video + VideoObject (optional) |
| `tags[]` | multi-select from registry |
| `categories[]` | multi-select from registry |

### ASO
| Field | Type |
|---|---|
| `apps[]` | list of **ids** resolved against `registry.apps` |

---

## A — Auto-computed (read-only preview in admin)

| Output | Formula |
|---|---|
| `canonical` | `domain + /news[/en]/ + fileSlug + .html` (or `canonicalOverride`) |
| `alternates` (hreflang ×3) | scan sibling dir for same `translationKey` |
| `lang` | path contains `/news/en/` → `en` |
| `newsIndex` | `lang` → `/news/` or `/news/en/` |
| `robots` | `noindex ? noindex,nofollow : index,follow,max-image-preview:large,max-snippet:-1` |
| `fedServer` | `new URL(site.social.mastodon).host` |
| `jsonld` | whole `@graph` (10 node types) built from G+R+L values |
| `og:url` | = canonical |
| `og:image` | `image.src` → absolute (fallback `site.ogImage`) |
| `keywords` | `tags.join(', ')` |
| `article:tag` | `tags[]` → one meta each |
| `twitter:card` | `image ? summary_large_image : summary` |
| `title` tag | `title + ' · ' + site.name` |
| `readingTime` | `words(content) / readingWpm` |
| dates `iso` | pubDate/updatedDate/reviewedDate → `YYYY-MM-DD` |
| dates `long` | locale from `lang` (`es-ES` / `en-US`) |
| share URLs | endpoint + `urlencode(canonical)` + `urlencode(title)` |
| related articles | same-language collection, minus self, top 3 |
| index cards / feed / sitemap entries | `collections.newsEs / newsEn / news` |
| byline avatar letter | `author.name[0]` |
| `year` | current year at build |

**Admin shows these as a live preview** (canonical, hreflang set, Google SERP
snippet, X/WhatsApp card, JSON-LD) — never as inputs.

---

## S — Structural (developer-only)

Head skeleton · `lang` span pairs · nav/footer markup · breadcrumb logic ·
`<style>` · toggle scripts · share button set · JSON-LD node selection
(`section === 'review'` → Review node) · empty-state · collection loops.

## Dead / unresolved placeholders

| Item | Status |
|---|---|
| `computedPrev` / `computedNext` | in `article.njk` but never computed → remove or implement rel=prev/next |
| `site.manifest` | declared, `/site.webmanifest` missing |
| `site.appleTouchIcon` | declared, file 404 (README #3) |
| `titleEN` (spec) | never implemented — EN title lives in the EN article instead |
| `nav`/`footer`/`share`/`storeBase` | ✅ moved to `site.json` (G) — partials loop over them |

---

## Admin page spec

```
┌─ Admin ────────────────────────────────────────────────┐
│ [ Global ]  [ Registry ]  [ Articles ]  [ Preview ]   │
│                                                        │
│ Global:     site identity · social · feeds · assets ·  │
│             theme · nav & footer links · share         │
│             endpoints · store base                     │
│ Registry:   authors · reviewers · apps · image         │
│             defaults · vocabularies                    │
│ Articles:   list (draft/published/lang badges) →       │
│             form = L fields grouped:                   │
│               Publishing · Dates · People · GEO        │
│               blocks · Media · ASO · SEO extras        │
│ Preview:    SERP snippet · X/WhatsApp card ·           │
│             hreflang map · JSON-LD (live) ·            │
│             validation checklist (spec §7)             │
└────────────────────────────────────────────────────────┘
Save:  G/R → JSON files   ·   L → article front matter
       → commit to Git → Cloudflare Pages rebuild
```

Validation rules enforced on save:
- `title` ≤ 60, `description` 140–160 (warn)
- `answer` ≤ 30 words · every `stat` has `source` · every `citations[].url` http
- `translationKey` collision within same language = error
- `draft:false` without `pubDate` = error
- filename must be kebab-case ASCII (URL safety)

### Implementation status (2026-10-01)

| Layer | Admin surface | Status |
|---|---|---|
| **G** — Global | *Global* tab → form over `site.json` (incl. nav / footer / share as row editors) | ✅ implemented |
| **R** — Registry | *Registry* tab → authors, reviewers, apps, default image, vocabularies | ✅ implemented |
| **L** — Local article fields | *Artículos* tab → grouped form + YAML view + markdown body + "＋ Nuevo" | ✅ implemented |
| **A** — Auto-computed | *Preview* tab → read-only SERP snippet, social card, canonical/hreflang/reading-time map | ✅ implemented (JSON-LD itself is build-time) |
| **S** — Structural | *Plantillas* tab → plain text editor for `content/_includes/**/*.njk` (no preview, by design) | ✅ implemented |

Save pipeline: `POST /api/save` (path whitelist: `content/_data/*.json`,
`content/news/**.md`, `content/_includes/**/*.njk`) → **comment-preserving**
YAML re-emit for `.md` (untouched keys keep formatting and `# ── section ──`
headers verbatim) → automatic `POST /api/build`. The admin page is built only
with `NEB_ADMIN=1`; production builds ignore `content/admin.njk` and delete any
stale `_site/admin`, so it can never ship. See README §3.4.
