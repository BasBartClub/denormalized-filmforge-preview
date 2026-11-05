# Denormalized → FilmForge preview — INVENTORY

Built: 2026-11-05 (Europe/Amsterdam)
Workdir: `/workspace/denormalized-filmforge/site/`
Visual clone of https://denormalized.co/ with Dutch FilmForge content.

## Pages
| Path | Notes |
|------|--------|
| `/` (`index.html`) | Hero, cases pin-scroll, capabilities tabs, dossier/about, work-mode timers, 8-step process, insights swiper, footer |
| `/contact/` | Black page + white Case Request Mad-Libs form → mailto daniel@filmforge.nl |
| `/werk/fixyourfilm/` | Case Closed sheet |
| `/werk/daniel-volt/` | Case Closed sheet |
| `/werk/huis-zelfverkoop/` | Case Closed sheet |
| `/werk/filmforge-website/` | Case Closed sheet |
| `/werk/ai-film-15s/` | Case Closed sheet |

## Design system (kept exact)
- Colors: bg `#fff`, fg `#000`, muted `#4c4c4c`, accent yellow `#eae63a`, marker red `#e72b25`
- Fonts: RegestoGrotesk (Regular/Medium woff), Hawk Regular ttf, SF Pro Annotations
- CSS: mirrored Webflow + tokens/hero/footer/mobile-menu/cookie/contact/case-fixes

## Effects / motion
- Motion-logo 29-frame walkcycle (two hat figures)
- Canvas ink page transition
- Custom red-dot / glove cursor (desktop)
- Scroll-pinned cases list with fill-progress + cover wipe (images)
- Dossier redaction bars + classified secure text
- Work Mode presence timers
- Process sticky cards + progressive blur
- Insights Swiper carousel
- Letter-roll / data-roll hovers
- Cookie banner (Reject / OK)
- Mobile menu drawer
- Contact cloth/fold form (GSAP) + mailto fallback

## FilmForge content mapping
- Hero/about/process/contact → Dutch FilmForge positioning (Voorthuizen, AI+editors)
- Cases → FixYourFilm, DANIEL/VOLT, Huis Zelfverkoop, FilmForge.nl, AI 15s (local photos)
- Contact → daniel@filmforge.nl · +31 6 22 88 44 63 · Apeldoornsestraat 12, 3781 BJ Voorthuizen · KvK 83071830
- Logo slot: Denormalized motion figures kept for visual fidelity; wordmark = FilmForge; favicons = FilmForge

## Deploy target
GitHub Pages: `BasBartClub/denormalized-filmforge-preview`
