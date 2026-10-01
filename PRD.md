# PRD: Ultra-Optimized Marketing Site

**Status:** Draft v1.0
**Owner:** Web Platform
**Last updated:** 2026-06-05

---

## 1. Summary

Build a single-domain, marketing-first web property that loads instantly, ranks well, and converts. The product is the site itself: performance, accessibility, and clarity are the differentiators. Every decision is measured against a public performance budget and gated at release.

## 2. Goals

| # | Goal | Target |
|---|------|--------|
| G1 | Instant perceived load on mid-tier mobile | LCP ≤ 1.2s at p75 (Moto G4, Slow 4G) |
| G2 | Zero jank during interaction | INP ≤ 200ms at p75 |
| G3 | No layout shift after first paint | CLS ≤ 0.05 at p75 |
| G4 | Server responds immediately | TTFB ≤ 200ms at p75 |
| G5 | Perfect Lighthouse score | 100/100/100/100 (Perf/A11y/BP/SEO) on mobile |
| G6 | Top-3 organic ranking for primary keyword cluster | within 90 days of launch |
| G7 | Conversion rate vs. legacy site | +15% (within 60 days) |
| G8 | Operate cheaply | < $X/mo infra (to be filled) |

## 3. Non-Goals

- No CMS-driven dynamic pages in v1 (static build, content via PRs).
- No A/B testing client in JS bundle (server-side splits only).
- No third-party tag manager. Tags load only via signed, audited allowlist.
- No authenticated areas, dashboards, or user state.

## 4. Target Audience

- **Primary:** Mobile-first professionals (60%+ of traffic), 4G/5G on mid-range Android.
- **Secondary:** Desktop knowledge workers on broadband.
- **Accessibility:** Keyboard, screen reader, slow network, reduced motion, low vision.
- **Geography:** Global, English first; structure must allow i18n later.

## 5. Performance Budget

Hard budgets. Any PR that exceeds a budget fails CI.

### 5.1 Critical path (above-the-fold, on initial navigation)

| Resource | Budget (compressed) | Notes |
|----------|---------------------|-------|
| HTML document | ≤ 14 KB | One round trip |
| Critical CSS (inlined) | ≤ 8 KB | For LCP element |
| JS (initial) | ≤ 0 KB preferred; ≤ 15 KB hard cap | No framework runtime on critical path |
| Web font (subset, woff2) | ≤ 25 KB per family | 1 family, 2 weights max |
| LCP image (preloaded) | ≤ 60 KB | AVIF, intrinsic size = display size |
| **Total critical** | **≤ 100 KB** | |

### 5.2 Full page (lazy + async allowed)

| Resource | Budget (compressed) |
|----------|---------------------|
| Total JS | ≤ 50 KB |
| Total CSS | ≤ 15 KB (8 inlined + 7 deferred) |
| Total images | ≤ 200 KB |
| Total page weight | ≤ 400 KB |
| HTTP/1.1 requests | ≤ 12 |
| HTTP/2+ requests | ≤ 20 |

### 5.3 Runtime metrics (RUM, p75 mobile)

| Metric | Budget | Reject threshold |
|--------|--------|------------------|
| LCP | ≤ 1.2s | > 2.5s |
| INP | ≤ 200ms | > 500ms |
| CLS | ≤ 0.05 | > 0.25 |
| TTFB | ≤ 200ms | > 600ms |
| FCP | ≤ 0.9s | > 1.8s |
| Speed Index | ≤ 1.5s | > 3.0s |
| TBT | ≤ 50ms | > 300ms |

## 6. Functional Requirements

### 6.1 Must have (P0)
- **FR1.** One primary CTA above the fold, visible without scroll on 360×640.
- **FR2.** All copy is server-rendered HTML; works with JS disabled.
- **FR3.** Single-page IA with anchor links; smooth-scroll respects `prefers-reduced-motion`.
- **FR4.** Contact form: server-validated, CSRF-protected, no third-party form vendor.
- **FR5.** Sitemap.xml and robots.txt auto-generated at build.
- **FR6.** Open Graph + Twitter Card meta with deterministic preview image.
- **FR7.** Structured data: `Organization` + `WebSite` JSON-LD.

### 6.2 Should have (P1)
- **FR8.** Email/newsletter capture with double opt-in, GDPR consent UI.
- **FR9.** 404 and 500 pages styled, useful, fast.
- **FR10.** Dark mode via `prefers-color-scheme`, no toggle in v1.
- **FR11.** View Transitions API for nav (progressive enhancement).

### 6.3 Could have (P2)
- **FR12.** i18n scaffold (en, es, de) behind feature flag.
- **FR13.** Inline OG image generation at edge.
- **FR14.** Service worker for repeat-visit static assets only.

## 7. Non-Functional Requirements

### 7.1 Accessibility
- WCAG 2.2 AA conformance, audited pre-launch.
- Color contrast ≥ 4.5:1 body, 3:1 large text and UI components.
- All interactive elements reachable and operable by keyboard.
- Focus visible (≥ 2px outline, ≥ 3:1 contrast).
- No content conveyed by color alone.
- Tested with NVDA + Firefox, VoiceOver + Safari, TalkBack + Chrome.

### 7.2 Browser support
- Last 2 versions of Chrome, Edge, Firefox, Safari.
- iOS Safari 16+, Android Chrome on Android 10+.
- Graceful degradation: site fully usable on browsers 4 versions back.

### 7.3 Security & privacy
- HTTPS only, HSTS with `max-age=63072000; includeSubDomains; preload`.
- Strict CSP: `default-src 'self'; script-src 'self' 'sha256-...';` (no `unsafe-inline`).
- `Referrer-Policy: strict-origin-when-cross-origin`.
- `Permissions-Policy` denying unused sensors.
- No third-party cookies. No fingerprinting. No analytics until consent.
- Subresource Integrity on any first-party CDN-loaded asset.
- Dependency scanning on every PR; no high/critical CVEs at release.

### 7.4 SEO
- Unique, descriptive `<title>` and `<meta description>` per page (≤ 60 / ≤ 155 chars).
- Canonical URL on every page.
- Self-hosted sitemap, submitted to Google Search Console and Bing.
- `hreflang` ready (no content yet).
- Crawlable without JS; JS-rendered content must be a progressive enhancement.

## 8. Technical Architecture

### 8.1 Build & deploy
- **Build:** Static site generator. Output is fully static HTML/CSS/asset files.
- **Hosting:** CDN with edge cache (Cloudflare/Fastly/CloudFront — TBD).
- **CI:** PRs run Lighthouse CI, axe-core, bundle-size guard, link checker, HTML validator.
- **Preview:** Every PR gets a unique preview URL at the edge.

### 8.2 Delivery
- HTTP/3 enabled, Brotli (Zstd fallback where supported).
- HTML cached at edge with `Cache-Control: public, max-age=0, s-maxage=300, stale-while-revalidate=86400`.
- Hashed assets: `Cache-Control: public, max-age=31536000, immutable`.
- HTML response streamed; head sent first, body as render completes.

### 8.3 Resource hints
- `<link rel="preconnect" crossorigin>` to required third-party origins (forms, fonts if hosted).
- `<link rel="preload" as="image" imagesrcset="..." fetchpriority="high">` for LCP image.
- No preloading of JS unless required (goal is zero JS on critical path).

### 8.4 Images
- AVIF first, WebP fallback, original last.
- `srcset` with at least 3 widths per image; `sizes` accurate to layout.
- All images have intrinsic `width`/`height`; `loading="lazy"` below the fold.
- No images above the fold that are not the LCP candidate.

### 8.5 Fonts
- Self-hosted, subset to Latin + whatever required.
- `font-display: swap` with matched fallback metrics (`size-adjust`, `ascent-override`).
- Preload only the weight used above the fold.

### 8.6 JavaScript
- Default: no JS shipped. Add JS only when a feature is impossible in HTML/CSS.
- If JS required: native ES modules, no bundler runtime on critical path, code-split per route/section.
- No client-side framework. No state management library.
- Progressive enhancement: feature works, then JS enhances it.

### 8.7 CSS
- Single small CSS file; critical subset inlined in `<style>`.
- No reset library; minimal normalize.
- `content-visibility: auto` on off-screen sections.
- `contain-intrinsic-size` set to avoid CLS.

## 9. Analytics, RUM & Monitoring

- **RUM:** First-party, cookie-free, via `sendBeacon` to own endpoint. Sample 100% on errors, 10% otherwise.
- **Synthetic:** Daily Lighthouse + WebPageTest runs against production, p75/p90/p95 budgets reported.
- **Uptime:** 1-minute probe from 5 regions; status page public.
- **Error budget:** 99.9% monthly availability; perf regressions count against budget.
- **Alerting:** Page on-call if LCP p75 exceeds budget for 15 minutes.

## 10. Content Constraints

- Hero copy: ≤ 12 words headline, ≤ 25 words subhead.
- One CTA per viewport.
- Body copy: target 8th-grade reading level (Flesch-Kincaid).
- All imagery: original or licensed; alt text required, descriptive, ≤ 125 chars.
- No auto-playing video; if video exists, click-to-play, captioned, transcripts available.

## 11. Testing & QA

- **Unit/visual:** Component snapshot tests; visual diff on every PR.
- **A11y:** `@axe-core/cli` in CI; manual audit quarterly.
- **Perf:** Lighthouse CI on mobile preset, fail on any budget breach.
- **Real-user:** WebPageTest CI job running 3 runs, taking median.
- **Cross-browser:** BrowserStack smoke test on release candidates.
- **Form:** Server-side validation tested; spam/abuse load test.

## 12. Launch Criteria (Gates)

Site may not ship to production until all are true:

- [ ] Lighthouse mobile score = 100/100/100/100 on hero, pricing, and contact pages.
- [ ] LCP ≤ 1.2s p75 in WebPageTest, 3 runs, Moto G4 + Slow 4G.
- [ ] JS payload = 0 KB on hero page (verifiable in DevTools).
- [ ] axe-core: zero violations on every page.
- [ ] All third-party requests enumerated and approved in security review.
- [ ] CSP, HSTS, SRI verified via securityheaders.com (A+).
- [ ] Forms tested end-to-end: submission, validation, success, failure paths.
- [ ] Sitemap and robots.txt valid (Google Search Console, no errors).
- [ ] Preview deploy shared with stakeholders and approved.
- [ ] On-call rotation in place; dashboards live; alerts wired.

## 13. Phases

| Phase | Scope | Exit criteria |
|-------|-------|---------------|
| P0 — Design system | Tokens, type, components, a11y primitives | Storybook, a11y clean |
| P1 — Static hero | Single page, no JS, LCP image, contact form | All launch gates except SEO |
| P2 — Content expansion | All marketing pages, sitemap, structured data | All launch gates |
| P3 — Optimize | Real-user data for 2 weeks, perf tuning | p75 metrics within budget for 7 consecutive days |
| P4 — Launch | DNS cutover, monitoring, rollback plan | Live in production |

## 14. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Marketing team wants CMS mid-flight | High | Med | Build content as files in git; CMS is post-v1 |
| Third-party script (analytics, chat) creeps in | High | High | Strict CSP, CI guard, allowlist process |
| LCP image asset bloats | Med | High | CI budget guard, automated image optimization |
| CDN miss on initial deploy | Med | Med | Warm cache via synthetic probes before DNS cut |
| Frameworks (React, Vue) get pulled in | Med | Med | ADR + code review rule: no runtime on critical path |
| Design demands custom font with many glyphs | Med | Med | Subset, fall back to system; budget enforces |

## 15. Open Questions

1. Which CDN and edge provider? (cost vs. perf trade-off)
2. Final brand font selection — needs subsetting estimate.
3. Hosting/budget for RUM storage.
4. Legal review of consent flow in target jurisdictions.

## 16. Appendix

- A. Reference: web.dev "Fast load times" guidelines (2026).
- B. Reference: HTTP Archive median page weight (2026).
- C. ADR-0001: No client-side framework on critical path.
- D. ADR-0002: Static-first, edge-cached delivery.



  Session   PRD for ultra optimized website
  Continue  opencode -s ses_1676a570dffeiXjuX6J7ysmGeH

