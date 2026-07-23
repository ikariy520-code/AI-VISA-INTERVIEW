# Mobile App-Like Homepage Design QA

## Comparison target

- Source visual truth: `C:\Users\IKARIS~1\AppData\Local\Temp\codex-clipboard-656b8056-fb5c-4155-afe1-65570d41d31f.png`
- Mobile implementation: `D:\vibe coding\tmp\design-qa\mobile-home-final.jpg`
- Desktop regression capture: `D:\vibe coding\tmp\design-qa\desktop-home-regression.jpg`
- Combined comparison evidence: `D:\vibe coding\tmp\design-qa\desktop-mobile-comparison.jpg`
- Focused officer screen: `D:\vibe coding\tmp\design-qa\mobile-officers.jpg`
- Focused visa-type screen: `D:\vibe coding\tmp\design-qa\mobile-visa-types.jpg`
- Source pixels: 2549 x 1403.
- Mobile implementation: 390 x 844 CSS pixels and 390 x 844 captured pixels after browser zoom normalization; device pixel ratio 1.
- Desktop regression: 1434 x 896 CSS viewport and 1428 x 892 captured pixels because of the visible scrollbar gutter.
- Compared state: settled homepage after entry motion. The source is a desktop visual and the implementation is an intentional mobile reflow, so geometry was not normalized 1:1. The combined evidence compares visual language, hierarchy, tokens, copy, and component treatment rather than identical coordinates.

## Full-view comparison evidence

- The mobile homepage preserves the desktop source's centered eyebrow, blue English slogan, two-line black/blue headline, gray supporting copy, compact blue CTA, green reassurance, white feature surfaces, subtle ambient color, and quiet footer.
- The desktop's two equal cards become two full-width stacked cards. This is the only structural reflow required by the phone width; both destinations remain visible in the first 390 x 844 viewport without horizontal gestures.
- The mobile layout uses a separate component tree below 640px. The desktop component tree and its layout remain unchanged.
- The user explicitly excluded the Lucy pet from the mobile design reference, so it is intentionally absent.

## Focused region evidence

- Homepage hero: the same copy, line breaks, gradient emphasis, button treatment, and visual hierarchy are retained. The headline contains no added comma.
- Homepage feature cards: the same icon tones, English eyebrows, titles, descriptions, actions, radii, border color, and elevation are retained in a compact horizontal card interior.
- Officer selection: the former horizontal rail is now a normal vertical app-like list; all cards have full viewport width and no horizontal overflow.
- Visa selection: the former horizontal rail is now a vertical two-card list; both choices are visible in a 390 x 844 viewport.

## Required fidelity surfaces

- Fonts and typography: the existing system, SF Pro, and PingFang stack remains unchanged. Display weight, tight tracking, compact line height, English eyebrow spacing, and Chinese copy hierarchy match the desktop visual language.
- Spacing and layout rhythm: the mobile page uses 16px side margins, a centered compact hero, 12px card gaps, 24px card radii, and a stable vertical flow. At 390 x 844 the page has no horizontal or vertical overflow and both feature cards are fully visible.
- Colors and visual tokens: existing ink, canvas, Apple blue, mint, line, and shadow tokens are reused. No new palette, oversized decorative blue area, 3D art, shield, or ornamental illustration was introduced.
- Image quality and asset fidelity: the source's required UI icons are represented by the project's existing React Icons set. The Lucy pet was explicitly excluded. No placeholder, custom SVG, CSS-drawn icon, or generated artwork was added.
- Copy and content: all product copy remains unchanged. The main title keeps the source line break and contains no comma.
- Accessibility and interaction: primary navigation uses semantic links, cards expose readable accessible names, touch targets are at least 44px, focus-visible styling remains available, and reduced-motion behavior remains inherited from the app.

## Comparison history

1. The previous mobile implementation had two P1 issues: the fixed desktop-style header overlapped at phone width, and horizontal snap rails hid available destinations. The homepage was split into an independent mobile component tree and all feature-selection rails were replaced with normal vertical flow.
2. The first browser capture appeared cropped because the in-app browser retained a non-default zoom. Browser zoom was normalized, after which DOM bounds and the 390 x 844 capture both showed correct centering and no overflow.
3. Final comparison found no actionable P0, P1, or P2 mismatch. The responsive structural changes are intentional mobile translations of the desktop source rather than a new visual design.

## Primary interactions and responsive checks

- Homepage primary action navigated to `/voice`.
- Random officer selection displayed the selected state and bottom action area.
- “选择签证类型” navigated to `/practice`.
- Officer and visa screens had no horizontal overflow at 390px.
- Homepage checks passed at 320 x 700, 390 x 844, and 430 x 932; exactly one layout tree was visible at each size.
- Desktop regression was captured at 1434 x 896 with the existing desktop layout intact.
- Browser console warning/error log was empty.
- `npm test`, `npm run build`, and `git diff --check` passed.

## Final result

final result: passed
