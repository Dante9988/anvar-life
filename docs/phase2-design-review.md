# Phase 2: personal, editorial, precise

Review-only branch, based on merged functionality PR #1 at `2cd966d5676a9796edec2c3c8ca731e9c2758384`. No production release is authorized. The production build guard was removed on this branch at the owner’s subsequent explicit request. A merge or production deployment still requires approval.

## Design decisions

- Midnight navy and warm ivory carry the visual system. Champagne is used sparingly for dividers and editorial accents; deep crimson identifies the primary action.
- A new original two-part V monogram gives the agency its own identity without government, VA or military insignia. Separate light/dark SVG marks and an SVG favicon are included.
- Locally served, open-licensed Newsreader and Manrope replace system-only typography. Newsreader is an optical-size-32 regular instance; Manrope retains variable weights. Both are subset to Latin and compressed as WOFF2. License files ship with the assets. No third-party font requests.
- The hero pairs a shorter editorial heading with the retained rate-check message. A tall, restrained family-photo composition and an offset gold rule replace the previous rounded-card treatment. The mobile hero places copy and primary action before imagery.
- Coverage uses one substantial navy feature panel beside two quieter ruled entries instead of three identical boxes. The personal introduction follows the Ethos conversion section. Senior guidance receives a distinct, warm, outlined treatment.
- Native disclosure elements retain keyboard and no-JavaScript behavior. Buttons have restrained state transitions; reduced-motion users receive no animation or translated hover effects.
- Existing licensed family photography and the approved Anvar portrait are preserved and converted to responsive WebP assets. The original JPG remains for social metadata compatibility.

## Before / after

| Area | Merged functionality baseline | Phase 2 |
| --- | --- | --- |
| Identity | Circular `bv` text mark | Original scalable V, light/dark SVG and favicon |
| Palette | Teal/cream | Navy/ivory, gold detail, crimson action |
| Typography | Georgia/Arial | Self-hosted Newsreader/Manrope |
| Hero | Long headline; arched photo card | Editorial headline; tall image, precise asymmetry |
| Coverage | Three equal cards | Feature panel with two ruled entries |
| Introduction | Portrait card after senior section | Framed editorial portrait directly after rate section |
| Photography | 224,734-byte JPEG hero; 60,417-byte portrait | Responsive hero WebP; 25KB portrait WebP |
| Mobile actions | Prior baseline included undersized labels | 14–16px labels, 52–60px targets and reserved safe-area space |

This comparison describes implementation; it is not a substitute for the outstanding visual inspection.

## Preservation and verification

- Exact Ethos attribution and Google Calendar destinations remain on both routes.
- NPN, email, independence/VA disclosure, privacy, eligibility/state limits, graded-benefit warning and IUL caveats remain.
- No application forms, tracking, embeds, new price claims, or additional client JavaScript.
- Preview noindex, canonical URLs and existing security headers preserved. The production-only throw is removed as requested; both production environment variables are tested for successful builds.
- The previously unmerged repeated-build SEO correction is integrated: origins normalize on subsequent builds and preview indexing resets when environments change.
- `npm run build` and `npm run check` pass, including static validator and 20 tests.
- Added automated checks cover self-hosted assets, core color contrast, responsive media markup and asset budgets. These are targeted checks, not a WCAG certification or runtime performance measurement.
- Independent source review confirmed the complete original link destination multiset and all legal/privacy/product caveats remain. It also identified and corrected responsive portrait sizing and strengthened photo-caption contrast.
- Both 390px mobile, 768px tablet and 1440px desktop layouts are explicitly implemented. Manual layout, zoom, keyboard, overflow and below-the-fold inspection remain required.

## Outstanding visual review

The available local Chromium cannot start: its default-security launch fails with a socket permission error. The managed browser only accepts HTTP/HTTPS and cannot reach this container's localhost. The existing Vercel preview requires authentication. No protection was disabled and no production deployment attempted.

Consequently, full-page before/after screenshots, runtime accessibility checks, measured CTA fold placement and Lighthouse/Core Web Vitals comparisons are NOT yet verified. Review the preview in a browser-capable authorized environment before merge. Baseline source is reproducible with `git archive 2cd966d5676a9796edec2c3c8ca731e9c2758384`.

## Release checklist

- [ ] Open the new branch preview with authorized access
- [ ] Capture full-page mobile and desktop before/after screenshots
- [ ] Inspect 390/768/1440 layouts, 200% zoom, keyboard focus, repeated FAQ toggles and browser Back
- [ ] Confirm hero CTA stays visible above the fold and fixed actions do not obstruct content
- [ ] Check external CTA destinations without submitting an application or appointment
- [ ] Measure runtime accessibility and performance
- [ ] Owner design approval
- [ ] Required Ethos/carrier marketing and licensing review
- [ ] Separate explicit approval before merging or production deployment
