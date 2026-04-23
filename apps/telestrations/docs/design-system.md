# Telestrations -- Design System

**Version:** 1.0
**Date:** 2026-04-23

---

## 1. Design Philosophy

Clean, minimal, playful but not childish. The aesthetic borrows from tools like Linear and Figma: crisp typography, generous whitespace, subtle shadows, and a single accent color that provides warmth without overwhelming. Every screen should feel calm and focused, letting the players' drawings and guesses be the center of attention.

---

## 2. Color Palette

### Primary

| Name | Hex | Usage |
|---|---|---|
| Indigo 600 (Primary) | `#6366F1` | Primary buttons, active states, accents, links |
| Indigo 700 (Primary Hover) | `#4F46E5` | Primary button hover/pressed state |
| Indigo 50 (Primary Tint) | `#EEF2FF` | Light backgrounds, selected states, badges |
| Indigo 100 (Primary Light) | `#E0E7FF` | Card highlights, subtle fill behind game code |

### Neutrals

| Name | Hex | Usage |
|---|---|---|
| Gray 950 | `#0B0F1A` | Primary text, headings |
| Gray 700 | `#374151` | Secondary text, body copy |
| Gray 500 | `#6B7280` | Placeholder text, muted labels |
| Gray 300 | `#D1D5DB` | Borders, dividers |
| Gray 200 | `#E5E7EB` | Input borders, card borders |
| Gray 100 | `#F3F4F6` | Page background, subtle fills |
| Gray 50 | `#F9FAFB` | Card backgrounds, alternate rows |
| White | `#FFFFFF` | Primary surface/background |

### Semantic

| Name | Hex | Usage |
|---|---|---|
| Success | `#22C55E` | Submission confirmed, player ready checkmarks |
| Success Light | `#F0FDF4` | Success background |
| Warning | `#F59E0B` | Timer below 10s, warnings |
| Warning Light | `#FFFBEB` | Warning background |
| Error | `#EF4444` | Errors, destructive actions, timer below 5s |
| Error Light | `#FEF2F2` | Error message background |

---

## 3. Typography

### Font Stack

```
font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
```

Use Inter from Google Fonts (weights 400, 500, 600, 700). Falls back to system fonts.

### Type Scale

| Element | Size | Weight | Line Height | Letter Spacing |
|---|---|---|---|---|
| H1 (Page Title) | 32px / 2rem | 700 | 1.2 | -0.02em |
| H2 (Section Title) | 24px / 1.5rem | 700 | 1.3 | -0.01em |
| H3 (Card Title) | 20px / 1.25rem | 600 | 1.4 | -0.01em |
| H4 (Subsection) | 16px / 1rem | 600 | 1.5 | 0 |
| Body | 16px / 1rem | 400 | 1.5 | 0 |
| Body Small | 14px / 0.875rem | 400 | 1.5 | 0 |
| Caption | 12px / 0.75rem | 500 | 1.4 | 0.02em |
| Game Code | 48px / 3rem | 700 | 1.0 | 0.12em |
| Timer | 40px / 2.5rem | 600 | 1.0 | 0.02em |

### Special Text Treatments

- **Game Code**: Monospaced feel using `font-variant-numeric: tabular-nums; letter-spacing: 0.12em;` displayed in uppercase within a tinted container.
- **Timer**: Large, centered, uses tabular numbers so digits don't shift as they change. Color transitions from Gray 700 to Warning at 10s and Error at 5s.
- **Player Names**: Body Small weight 500. Truncated with ellipsis at 16 characters max.

---

## 4. Spacing Scale

Based on a 4px base unit:

| Token | Value | Common Usage |
|---|---|---|
| `space-1` | 4px | Inline icon gaps, tight padding |
| `space-2` | 8px | Between related elements, small padding |
| `space-3` | 12px | Input padding, compact card padding |
| `space-4` | 16px | Standard padding, gap between form fields |
| `space-6` | 24px | Section spacing, card padding |
| `space-8` | 32px | Between major sections |
| `space-12` | 48px | Page-level vertical spacing |
| `space-16` | 64px | Top/bottom page margins on desktop |

### Layout

- **Max content width**: 480px (mobile-first single column)
- **Page horizontal padding**: 16px (mobile), 24px (tablet+)
- **Card internal padding**: 24px (desktop), 16px (mobile)
- **Form field gap**: 16px vertical between fields
- **Button gap**: 12px between adjacent buttons

---

## 5. Border Radius

| Token | Value | Usage |
|---|---|---|
| `radius-sm` | 6px | Small buttons, badges, input fields |
| `radius-md` | 10px | Cards, modals, larger buttons |
| `radius-lg` | 16px | Hero cards, game code container, drawing canvas wrapper |
| `radius-full` | 9999px | Avatars, circular buttons, color swatches |

---

## 6. Shadows / Elevation

| Level | Value | Usage |
|---|---|---|
| `shadow-xs` | `0 1px 2px rgba(0,0,0,0.05)` | Subtle lift (input focus) |
| `shadow-sm` | `0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)` | Cards at rest |
| `shadow-md` | `0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)` | Floating cards, modals |
| `shadow-lg` | `0 12px 32px rgba(0,0,0,0.12), 0 4px 8px rgba(0,0,0,0.06)` | Drawers, popups |

Cards generally use `shadow-sm` or a 1px border (`Gray 200`) -- not both. Choose one approach per component.

---

## 7. Component Styles

### 7.1 Buttons

All buttons use `radius-md` (10px), `font-weight: 600`, `font-size: 16px`, and a minimum height of 48px (touch-friendly). Horizontal padding: 24px.

| Variant | Background | Text Color | Border | Hover | Active |
|---|---|---|---|---|---|
| Primary | `#6366F1` | White | None | `#4F46E5` | `#4338CA` |
| Secondary | White | `#374151` | 1px solid `#D1D5DB` | `#F3F4F6` bg | `#E5E7EB` bg |
| Danger | `#EF4444` | White | None | `#DC2626` | `#B91C1C` |
| Ghost | Transparent | `#6366F1` | None | `#EEF2FF` bg | `#E0E7FF` bg |

**Disabled state**: opacity 0.5, cursor not-allowed.

**Full-width on mobile**: Buttons in forms and action areas stretch to 100% width below 480px viewport.

**Button with icon**: Icon placed to the left of text with 8px gap. Icon is 20x20px.

### 7.2 Input Fields

- Height: 48px
- Padding: 12px 16px
- Border: 1px solid `Gray 200` (`#E5E7EB`)
- Border radius: `radius-sm` (6px)
- Font size: 16px (prevents iOS zoom)
- Placeholder color: `Gray 500`
- Focus state: border color changes to `#6366F1`, plus a `0 0 0 3px rgba(99, 102, 241, 0.15)` ring
- Error state: border color `#EF4444`, ring `0 0 0 3px rgba(239, 68, 68, 0.15)`, error text below in `#EF4444` at 14px
- Labels: placed above the input, 14px weight 500 `Gray 700`, 8px margin-bottom

### 7.3 Cards

- Background: White
- Border: 1px solid `#E5E7EB`
- Border radius: `radius-md` (10px)
- Padding: 24px (desktop) / 16px (mobile)
- No shadow by default; use `shadow-sm` for elevated cards (modals, popovers)

### 7.4 Game Code Display

The game code is a hero-level element in the lobby.

- Container: `#EEF2FF` background, `radius-lg` (16px), padding 24px 32px
- Code text: 48px, weight 700, color `#6366F1`, letter-spacing 0.12em, `font-variant-numeric: tabular-nums`
- Below the code: "Tap to copy" or a copy icon button

### 7.5 Timer Display

- Size: 40px, weight 600
- Alignment: centered at the top of the gameplay area
- Container: subtle pill-shaped background (`#F3F4F6`), padding 8px 20px, `radius-full`
- State transitions:
  - Normal (>10s): `Gray 700` text on `Gray 100` background
  - Warning (<=10s): `Warning` (`#F59E0B`) text on `Warning Light` background
  - Critical (<=5s): `Error` (`#EF4444`) text on `Error Light` background, add a CSS pulse animation (scale 1.0 to 1.05, 0.5s ease-in-out infinite)

### 7.6 Drawing Toolbar

- Position: below canvas on mobile, side panel on desktop (>768px)
- Background: White
- Border top: 1px solid `Gray 200`
- Padding: 12px 16px
- Layout: single horizontal row with scroll overflow on mobile; vertical stack on desktop side panel
- Tool buttons: 44x44px touch target, `radius-sm`, selected tool gets `Indigo 50` background + `Indigo 600` border
- Separator: 1px vertical divider (`Gray 200`) between tool groups

### 7.7 Color Swatches

- 12 circular swatches, 32px diameter, 8px gap between them
- Selected swatch: 2px white inner ring + 2px `Indigo 600` outer ring
- Arranged in a single row with horizontal scroll on mobile, or 2 rows of 6 on desktop

### 7.8 Player List Item

- Height: 48px
- Left: Player name (Body Small, weight 500)
- Right: Status indicator (checkmark for submitted, spinner for pending, gray dot for disconnected)
- Host badge: small "HOST" label in `Indigo 50` bg with `Indigo 600` text, `radius-full`, caption size
- Divider: 1px `Gray 100` between items

### 7.9 Chain Review Card

- Full-width card with `radius-md`
- Header: Player name + entry type label ("drew" / "guessed" / "prompted"), Caption size, `Gray 500`
- Content area:
  - Text entries: 20px, weight 500, center-aligned, padding 32px
  - Drawing entries: image fills card width with aspect-ratio 1:1, `radius-sm` on image
- Animation: fade-in + slide-up (translateY 16px to 0, opacity 0 to 1, 300ms ease-out)

### 7.10 Toast / Notification

- Fixed to bottom center, 16px from bottom edge
- Background: `Gray 950`, text White, 14px
- Padding: 12px 20px
- Border radius: `radius-md`
- Auto-dismiss after 3 seconds with a fade-out

---

## 8. Drawing Color Palette (12 Colors)

| # | Name | Hex | Swatch |
|---|---|---|---|
| 1 | Black | `#1A1A1A` | Default color |
| 2 | Dark Gray | `#6B7280` | |
| 3 | Red | `#EF4444` | |
| 4 | Orange | `#F97316` | |
| 5 | Yellow | `#FACC15` | |
| 6 | Green | `#22C55E` | |
| 7 | Light Blue | `#38BDF8` | |
| 8 | Dark Blue | `#3B82F6` | |
| 9 | Purple | `#8B5CF6` | |
| 10 | Pink | `#EC4899` | |
| 11 | Brown | `#92400E` | |
| 12 | White | `#FFFFFF` | Shown with 1px gray border |

These colors are chosen to be vibrant and distinct from each other at the small swatch size. They use the Tailwind palette as a foundation for consistency.

---

## 9. Iconography

Use a minimal icon set. Prefer Lucide icons (open source, consistent 24px grid, 1.5px stroke weight). Key icons needed:

- Pencil (pen tool)
- Eraser
- Undo (curved arrow left)
- Redo (curved arrow right)
- Trash-2 (clear canvas)
- Copy (game code)
- Share-2 (share link)
- Check (submitted)
- Clock (timer)
- Crown (host indicator)
- X (close/remove)
- ChevronRight (next)
- ChevronLeft (previous)
- Download
- Home
- Users (player count)
- Loader (spinner -- use CSS animation)

---

## 10. Motion / Animation

| Action | Duration | Easing | Details |
|---|---|---|---|
| Page/screen transitions | 250ms | ease-out | Fade + subtle slide (translateY 8px) |
| Card reveal (review phase) | 300ms | ease-out | Fade-in + slide-up (translateY 16px) |
| Button press | 100ms | ease-in-out | Scale to 0.97 |
| Timer pulse (<=5s) | 500ms | ease-in-out | Scale 1.0 to 1.05, infinite |
| Toast appear | 200ms | ease-out | Slide-up from bottom + fade-in |
| Toast dismiss | 200ms | ease-in | Fade-out + slide-down |
| Player join/leave | 200ms | ease-out | Fade + slide |

Animations respect `prefers-reduced-motion: reduce` by disabling all transforms and reducing to simple fade at 150ms.

---

## 11. Responsive Breakpoints

| Name | Width | Notes |
|---|---|---|
| Mobile | < 640px | Single column, full-width cards and buttons, toolbar below canvas |
| Tablet | 640px -- 1023px | Wider cards, more horizontal space |
| Desktop | >= 1024px | Max-width container (480px for gameplay, 640px for review), toolbar beside canvas |

The primary design target is 375px wide (iPhone SE / standard small phone). All screens must look good at this width first.

---

## 12. Accessibility Notes

- All text meets WCAG AA contrast ratio (4.5:1 for normal text, 3:1 for large text).
- Focus ring: `0 0 0 3px rgba(99, 102, 241, 0.4)` ring around focused elements, visible on keyboard navigation.
- Interactive elements: minimum 44x44px touch/click target.
- Color swatches in the drawing toolbar include `aria-label` with the color name.
- Timer uses `aria-live="polite"` for screen reader announcements at key intervals (30s, 10s, 5s).
- Form error messages are associated with inputs via `aria-describedby`.

---

*End of design system.*
