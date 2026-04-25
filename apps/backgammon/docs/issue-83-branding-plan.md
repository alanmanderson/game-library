# Plan: Issue #83 — Branding & Visual Identity Overhaul

## Problem Summary

Five large PNG images sit in `frontend/public/` totalling ~26 MB. They are either
unused dead weight or used as UI elements where a lightweight SVG would be far
better. The `<head>` in `index.html` is missing standard meta tags, there is no
`robots.txt` or `sitemap.xml`, and no structured data.

| File | Size | Status |
|---|---|---|
| `public/favicon.ico` | 1.8 KB | Keep — regenerate from SVG |
| `public/favicon.png` | 3.5 MB | **Delete** — replace with SVG favicon |
| `public/images/logo.png` | 6.8 MB | **Delete** — replace with inline SVG |
| `public/images/bot.png` | 6.1 MB | **Delete** — replace with inline SVG |
| `public/images/thumbnail.png` | 6.9 MB | **Delete** — replace with a lightweight OG PNG |
| `public/images/backsplash.png` | 7.1 MB | **Delete** — completely unused |

---

## Step 1 — Delete unused and oversized images

- Delete `public/images/backsplash.png` (zero references in the codebase).
- Delete `public/images/logo.png`, `bot.png`, `thumbnail.png`, and `public/favicon.png`
  after their replacements are in place (Steps 2–4 below).

---

## Step 2 — Replace `logo.png` with an inline SVG in AuthModal

**File**: `frontend/src/components/AuthModal.tsx`

Current: `<img src="/images/logo.png" alt="Backgammon" className="auth-logo" />`

Replace with an inline `<svg>` component — a pair of dice rendered in the site's
gold accent (`#d4a843`) on a dark background, sized to match the existing
`.auth-logo` CSS class. Keep `alt` semantics via `aria-label` on the `<svg>`.

Design: two dice, slightly overlapping, showing a 4 and a 3. Simple geometric
shapes only — no gradients, no shadows. Matches the dark/gold CSS variable theme.

**Why inline SVG over a `.svg` file**: avoids an extra HTTP request, lets the SVG
inherit CSS custom properties (`var(--accent)`), and is trivially tree-shaken if
the component is ever removed.

---

## Step 3 — Replace `bot.png` with an inline SVG in PlayerInfoRow

**File**: `frontend/src/components/PlayerInfoRow.tsx`

Current: `<img src="/images/bot.png" alt="Bot" className="bot-avatar" />`

Replace with an inline `<svg>` — a minimal robot face: square head, two circular
eyes, a small antenna. Use `var(--accent)` for the icon color so it adapts to any
future theme changes. Size to match the existing `.bot-avatar` CSS dimensions.

---

## Step 4 — New favicon (SVG + regenerated ICO)

**New file**: `frontend/public/favicon.svg`

A single die face (showing ⚅, six dots) in gold (`#d4a843`) on a dark navy
circle (`#1a1a2e`). SVG favicons are supported in all modern browsers; the
existing `favicon.ico` covers legacy browsers and stays in place.

**Regenerate `favicon.ico`**: produce a proper multi-resolution ICO (16×16,
32×32, 48×48) from the new SVG using a build-time script or an online converter.
The current `favicon.ico` is 1.8 KB and likely already reasonable — replace only
if the visual is inconsistent with the new design.

**Update `index.html`**:
```html
<!-- Remove the oversized favicon.png line entirely -->
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="icon" type="image/x-icon" href="/favicon.ico" />
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
```

Create `apple-touch-icon.png` at 180×180 px, exported from the new SVG (< 10 KB
target). This replaces the 3.5 MB `favicon.png`.

---

## Step 5 — Lightweight OG / social sharing image

OG images must be raster (Facebook and Twitter do not render SVG). Create a new
`frontend/public/images/og-image.png` at **1200×630 px** targeting **< 150 KB**
gzipped.

Design: flat, text-only layout matching the site theme —
- Background: `#1a1a2e` (dark navy)
- Gold die icon (from the favicon SVG) on the left
- "Backgammon Online" in large gold text, tagline in muted white below
- No photorealistic 3D renders, no gradients

Approach: author the image as an SVG, export to PNG with `rsvg-convert` or
equivalent (available in CI). Add a `Makefile` or `scripts/generate-og.sh` target
so the image can be regenerated if branding changes.

**Update `index.html`**:
```html
<meta property="og:image" content="/images/og-image.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
```

---

## Step 6 — Complete the `<head>` meta tags

**File**: `frontend/index.html`

Add all missing standard tags:

```html
<meta name="description" content="Play backgammon online — challenge friends, beat the AI, or compete on the leaderboard. Free, no download required." />
<meta name="theme-color" content="#1a1a2e" />

<!-- Open Graph (additions/corrections) -->
<meta property="og:url" content="https://backgammon.alanmanderson.com/" />
<meta property="og:site_name" content="Backgammon Online" />
<meta property="og:image" content="https://backgammon.alanmanderson.com/images/og-image.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />

<!-- Twitter / X card -->
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="Backgammon Online" />
<meta name="twitter:description" content="Play backgammon online — challenge friends, beat the AI, or compete on the leaderboard." />
<meta name="twitter:image" content="https://backgammon.alanmanderson.com/images/og-image.png" />
```

Note: OG `og:image` should use an absolute URL (some scrapers don't resolve
relative paths).

---

## Step 7 — robots.txt

**New file**: `frontend/public/robots.txt`

```
User-agent: *
Allow: /

Sitemap: https://backgammon.alanmanderson.com/sitemap.xml
```

---

## Step 8 — sitemap.xml

**New file**: `frontend/public/sitemap.xml`

Static sitemap covering the public routes. Game-specific URLs are not included
(they are ephemeral and require auth). Update `lastmod` on deploy.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://backgammon.alanmanderson.com/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://backgammon.alanmanderson.com/leaderboard</loc>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
</urlset>
```

---

## Step 9 — Structured data (Schema.org JSON-LD)

**File**: `frontend/index.html` — add in `<head>`:

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "name": "Backgammon Online",
  "url": "https://backgammon.alanmanderson.com",
  "description": "Multiplayer backgammon with AI opponent, leaderboard, and real-time play.",
  "applicationCategory": "Game",
  "operatingSystem": "Web",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "USD"
  }
}
</script>
```

---

## File Change Summary

| File | Action |
|---|---|
| `frontend/public/images/backsplash.png` | Delete |
| `frontend/public/images/logo.png` | Delete (after Step 2) |
| `frontend/public/images/bot.png` | Delete (after Step 3) |
| `frontend/public/images/thumbnail.png` | Delete (after Step 5) |
| `frontend/public/favicon.png` | Delete (after Step 4) |
| `frontend/public/favicon.svg` | Create |
| `frontend/public/apple-touch-icon.png` | Create (180×180, < 10 KB) |
| `frontend/public/images/og-image.png` | Create (1200×630, < 150 KB) |
| `frontend/public/robots.txt` | Create |
| `frontend/public/sitemap.xml` | Create |
| `frontend/src/components/AuthModal.tsx` | Replace `<img>` with inline SVG |
| `frontend/src/components/PlayerInfoRow.tsx` | Replace `<img>` with inline SVG |
| `frontend/index.html` | Update meta tags + add JSON-LD |

---

## Out of Scope (per issue)

- New brand name (requires product decision)
- Per-game OG cards (dynamic, requires server-side rendering or edge functions)
- Per-profile OG cards
- Token blacklisting / cross-tab sign-out (separate issue)
