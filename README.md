# Anvar Life

Personal insurance marketing website for Anvar Baltakhojayev.

- Review site: https://anvar-life-retirement.anvarxadja.chatgpt.site
- Booking: https://calendly.com/anvar-life/15min
- Source: https://github.com/Dante9988/anvar-life

The hosted review is private. Repository visibility is independent of website access.

## Experience

A responsive dark-first design with an optional light theme, gentle ambient motion, a global pause control, and support for device reduced-motion preferences. Every booking button opens the same Calendly event.

The interactive **Clarity Studio** has three educational experiences:

1. A simple life-insurance gap example subtracts existing coverage and earmarked savings from entered responsibilities. A zero gap is not a recommendation to reduce coverage.
2. An IUL lesson compares three hypothetical index periods under invented 8% cap / 0% floor / 100% participation assumptions. Results are interest credits before charges, not cash-value projections or offered rates.
3. A deferred income annuity journey explains funding, the period before income begins, and contractual payment options.

Inputs stay in memory and reset on reload. Only display preferences may be stored on the visitor’s device. There are no analytics, application forms, payment collection, or AI-generated product recommendations.

## Files

| File | Purpose |
| --- | --- |
| dist/index.html | Content, contact details, Calendly links, semantic page structure |
| dist/styles.css | Design, themes, responsive layouts, motion controls |
| dist/site.js | Navigation and interactive behavior |
| dist/experience.mjs | Teaching arithmetic and annuity lesson content |
| dist/family.jpg | Illustrative stock photo |
| dist/favicon.svg | Site monogram |
| scripts/validate.mjs | Static integrity and accessibility-hook checks |
| scripts/experience.test.mjs | Boundary and scenario checks for teaching models |
| .openai/hosting.json | Existing Sites project identity and static-output path |

## Local use

No dependencies or compilation are required. Use Node 22 or newer for the checks.

~~~sh
npm run check
python3 -m http.server 8080 --directory dist
~~~

Open the local server in your own browser. Other static hosts can serve the dist directory directly. The hosted Sites version uses .openai/hosting.json; preserve its project identity when updating that existing site.

## Add a portrait

Add an approved portrait asset to dist/. Replace .portrait-placeholder inside #agent-portrait with an image. Remove the placeholder wrapper’s role="img" and its placeholder aria-label, give the actual image descriptive alternative text, and use width:100%;height:100%;object-fit:cover. The reserved space is intentional.

## Content maintenance

- Confirm legal/agency identity, required state license disclosures, applicable licensing, training, carrier appointments, and advertising approval before public launch.
- Document any approval, discount, customer-count, or geographic claim before adding it. No verified VA discount program has been identified in this version; do not imply VA affiliation from a veteran-focused carrier offer.
- The $15,000 final-expense scenario is hypothetical. It is not an average cost estimate, verified testimonial, or immediate-payment promise.
- Interactive numbers are teaching examples. They do not replace needs analysis, underwriting, carrier illustrations, or contract review.
- Keep required product limitations close to each example.
- Confirm the Calendly location, availability, time zone, and reminders in the owner’s account. Tests do not create real appointments.
- Keep noindex,nofollow while the site remains a private review; review indexing and the canonical domain when launching publicly.
- Review privacy language if forms, analytics, embeds, or integrations are added.

## Research and attribution

Design decisions emphasize readable text and user-controlled motion. Dark mode is an aesthetic choice, not a claim of superior conversion or accessibility for every person.

- W3C motion controls: https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html
- W3C interaction animation: https://www.w3.org/WAI/WCAG21/Understanding/animation-from-interactions
- NN/g dark-mode research review: https://www.nngroup.com/articles/dark-mode/
- NAIC life insurance: https://content.naic.org/consumer/life-insurance.htm
- NAIC illustrations: https://content.naic.org/insurance-topics/life-insurance-illustrations
- Investor.gov annuities: https://www.investor.gov/introduction-investing/investing-basics/investment-products/annuities
- National Life Group crediting explanation: https://www.nationallife.com/resource-center/indexed-life-insurance-upside-potential-and-downside-protection
- VA affiliation information: https://www.benefits.va.gov/INSURANCE/scamcalls.asp

The National Life Group reference informs general mechanics; this site does not represent an offer of that company’s products.

Family photo: RDNE Stock project / Pexels, photo 6149192.
Source: https://www.pexels.com/photo/family-of-different-ages-hugging-6149192/
License: https://www.pexels.com/license/

Photo subjects are illustrative, not identified as clients, veterans, or endorsers. External Google Fonts have system-font fallbacks.
