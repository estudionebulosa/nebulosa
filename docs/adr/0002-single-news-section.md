# ADR-0002: Merge `/blog` into a single `/news` articles section

- **Status:** Accepted — implemented 2026-10-01 (`_redirects` live at the build
  output root and emulated by the local admin server; `blog/` retired to
  `archive/blog-legacy/`, its article ported to `content/news/como-creamos-apps-moviles.md`
  + `content/news/en/how-we-build-mobile-apps.md` as a `translationKey` pair)
- **Date:** 2026-10-01
- **Deciders:** Nebulosa Estudio
- **Related:** ADR-0001 (markdown → HTML build)

## Context

The site currently exposes **two article sections** that behave identically:

| Section | Listing | Articles |
|---|---|---|
| `/blog/` | `blog/index.html` | `como-creamos-apps-moviles.html` (+ a `(copia)` duplicate) |
| `/news/` | `news/index.html` | `las-mejores-apps-salud-2026.html`, `como-escribir-html-para-la-ia.html`, `documento-optimizacion-…-geo.html` (+ 12 `.md` drafts) |

Both use the same card markup, the same nav, the same ES/EN spans. The split
costs more than it earns:

- Every new article has to be filed in **two** taxonomies and linked twice.
- Two indexes to keep in sync — and they have already drifted (README issue
  #9: two published articles are orphaned in neither index nor sitemap).
- The PRD asks for one single-domain marketing property, not a magazine with
  verticals.

**Decision:** the site has **one articles section: `/news`**. Blog is retired.

## Decision

1. All articles live under `/news/` as flat HTML pages:
   `news/<slug>.html`.
2. `/news/index.html` is the only listing, linked from the landing page
   ("Novedades" + footer) and the main nav.
3. **`/blog` keeps working as a redirect** — existing links (and the sitemap,
   which advertises two `/blog` URLs to Google) must not turn into 404s.
4. `blog/` is removed from the source tree after the redirect is in place.

## Migration plan

### 1. Move the article

```bash
git mv blog/como-creamos-apps-moviles.html news/como-creamos-apps-moviles.html
git rm "blog/como-creamos-apps-moviles (copia).html"   # junk duplicate
```

Then update inside the moved file:

- `<link rel="canonical">` → `https://nebulosa.estudio/news/como-creamos-apps-moviles.html`
- the three `hreflang` alternates (same URL + `?lang=`)
- `og:url` and the `NewsArticle` JSON-LD `mainEntityOfPage`
- the nav's `class="current"` marker: move it from `/blog/` to `/news/`
- footer/nav links `/blog/` → `/news/`

### 2. Redirects — `_redirects` at the build output root

Cloudflare Pages reads this file natively (no server code needed):

```
# ADR-0002 — retire /blog, keep old URLs alive
/blog/                     /news/                        301
/blog/index.html           /news/                        301
/blog/como-creamos-apps-moviles.html  /news/como-creamos-apps-moviles.html  301
/blog/*                    /news/:splat                  301
```

The catch-all `/*` rule keeps any future `/blog/<slug>` URL from ever 404ing,
so articles moved later keep their inbound-link equity.

### 3. Update every reference

| File | Change |
|---|---|
| `index.html` nav + footer + "Novedades" CTA | `/blog/` → `/news/`, article hrefs → `/news/…` |
| `sitemap.xml` | drop the two `/blog` `<url>` entries; add the moved article under `/news` |
| `news/index.html` | add card for *Cómo creamos apps móviles* |
| `README.md` | content-flow diagram: single section `/news` |

### 4. Remove the section

```bash
git rm -r blog/
```

## Alternative considered

**Keep both sections** (news = short pieces, blog = long-form). Rejected:
doubles the publishing checklist for zero reader benefit, and the content
produced so far does not split cleanly by length or cadence.

## Consequences

- **Positive:** one section to maintain, one sitemap, one index; publishing is
  "write `.md` → build → link once"; the orphan-page class of bug disappears.
- **Positive:** `/blog` URLs survive as 301s, so no lost rankings or broken
  shared links.
- **Negative:** any external link text saying "Blog" still lands on `/news/`
  (cosmetic only — nav labels change to "Noticias / News").
- **Negative:** one extra file (`_redirects`) to keep in the repo forever.
- **Follow-up:** ADR-0001's build script should also regenerate
  `sitemap.xml` and warn when an article is missing from `/news/index.html`.
