# Benefits with Veterans

Review-only redesign for Anvar Baltakhojayev, NPN 22327730. Lightweight static website with two clear paths: online life insurance rate checking through the exact Ethos partner URL, and a free consultation through Google Calendar.

## Approval and production safety

**Do not merge or deploy to production until the owner explicitly approves and required carrier marketing approval is obtained.** This draft's build script deliberately rejects `VERCEL_ENV=production` and `VERCEL_TARGET_ENV=production`. Remove that limited guard in a reviewed release change only after approval. No production domain, Vercel account setting, existing Sites project identity, or production branch is changed by this PR.

- Rate checking: https://app.ethoslife.com/partner/780a6/q/goals
- Booking: https://calendar.app.google/PF12N8i49QaFAV7o9
- Intended canonical domain: https://www.benefitswithveterans.com/
- Business email: anvar@benefitswithveterans.com

The domain and mailbox are business details supplied by the owner. Their inclusion does not establish that DNS, website hosting, or email delivery is operational. Inbound email must be verified separately before launch.

## Experience

- Homepage and `/veterans/` both use the new identity, large legible type, high-contrast CTAs, and consistent conversion destinations.
- No JS is required for navigation, CTAs or native FAQ disclosure controls.
- Senior/final-expense section is distinct from family-protection messaging and avoids large-benefit or price promises.
- Whole-life, IUL and annuity education remains available. IUL limitations cover caps/participation, charges, lapse, and policy loans.
- No lead forms, health/SSN fields, iframes, tracking scripts, analytics, fonts from third parties, or fake quote calculators.
- Links navigate in the same tab and browser Back remains available. No artificial urgency or fabricated testimonials.
- Mobile quick actions have reserved footer space and safe-area padding.
- Old active Calendly links and old interactive funnel scripts have been removed.
- Original teaching math module and its unit tests remain as reference, but are not loaded by the new pages.

## Local review

Node 22+ is supported. There are no install dependencies.

```sh
npm run build
python3 -m http.server 8080 --directory dist
```

`npm run check` checks static content, exact referral/booking links, safety/SEO/accessibility hooks, product limitations and deployment guard behavior, plus the preserved educational math tests. No separate lint or typecheck is configured for this static HTML/CSS project.

Vercel uses `dist`, `npm run build`, clean URLs and the existing security headers. Preview builds set `noindex,nofollow` and disallow crawling. Canonical, Open Graph and sitemap URLs use the intended business domain; `SITE_URL` accepts a clean HTTPS origin. A preview URL does not mean the business domain is live.

## Marketing review required

Ethos's official agent guidelines require prior review/approval of marketing referencing Ethos and specific insured/policy details for sample premiums: https://www.ethos.com/agents/legal/

No $25/month, $1M-for-$25, pre-approved, guaranteed-approval, no-medical-exam or specific senior benefit claim is published in this draft. The owner's premium claim remains unsubstantiated for advertising purposes. The partner flow's first screen offers a funeral-expense goal, but this does not verify any person's eligibility, age limits, final rates or product suitability. The site describes exploration only and discloses waiting periods/graded benefits and state/product variations.

Before release: obtain owner design approval, Ethos/carrier approval, verify licensing/appointments and required state disclosures, confirm domain setup and email receipt, and recheck the partner and booking flows on desktop and mobile without submitting an application or appointment.

## Images

Anvar portrait is the existing approved repository asset. Family photo is illustrative, not a customer or veteran endorsement. Original attribution: RDNE Stock project / Pexels, photo 6149192, https://www.pexels.com/photo/family-of-different-ages-hugging-6149192/ ; license https://www.pexels.com/license/ .
