# Inbound life insurance leads with Kixie

Public-source research checked 2026-10-11 UTC; authenticated account settings inspected read-only on 2026-10-12, 01:18–01:21 UTC. This is an operating plan and public-source comparison for an independent life/final-expense agent. Vendor quality tiers are provisional purchasing hypotheses, not independently proven rankings or returns. The application remains a fictional preview. The account audit below verifies displayed settings, not successful live calling or CRM delivery. No settings were changed, calls placed, recordings opened, or purchases made during the audit.

## Verified account audit: 2026-10-12

The following was observed in an authenticated Kixie Manager session. Personal/account identifiers, the assigned phone number and customer data are omitted from this repository. Account-page links require an authorized Kixie login; they are evidence locations, not public access to the account.

| Area | Observed state | Remaining verification |
| --- | --- | --- |
| Subscription | Professional Phone, three-month billing cycle; displayed current period ends 2026-11-28; one Local Number | Billing does not establish that the account is cleared for live inbound traffic. Confirm any unresolved verification with Kixie. [Subscription](https://app.kixie.com/billing/subscription) |
| Agent and number | Agent plan displays Professional Per Minute; Power Dialer displays None. One active local number is assigned to the agent. | No test proved the number rings the intended device or preserves destination attribution. The number is intentionally omitted here. [Number inventory](https://app.kixie.com/manage/numbers/unblocked) |
| Verification banner | A trial/inbound-SMS verification banner still requests representative verification despite the displayed subscription. | Ask Kixie to clarify and resolve the banner; do not assume either paid billing or the banner alone proves working inbound service. |
| Devices and direct-line routing | Inbound Dialing Device is Not set; Ring Devices is OFF; Forward is OFF and no forwarding devices are listed. PowerCall WebRTC and a mobile app are registered. | Registration does not prove the Chrome extension is installed or signed in on the intended PC. Select and test the intended inbound device only after approval. Observed in the agent profile's Devices and Routing page. |
| Business routing | Zero business routing rules are configured. | Direct-line/no-answer handling and any future licensed-agent routing still need approved configuration and functional tests. [Routing](https://app.kixie.com/manage/numbers/routing) |
| Webhook/API controls | Allow Webhooks is ON; External API keys are disabled. No webhook destination, custom-header setup or delivery was verified. | Do not treat External API keys as a proven prerequisite for Kixie-to-CRM webhook delivery. API-based webhook management and Make a Call are separate API uses. Confirm the supported account configuration path and header delivery before enabling any integration. [Account settings](https://app.kixie.com/manage/account) |
| Recording/CRM controls | Account and agent recording controls are ON; outbound recording is All; Send Recordings to CRM is ON, while CRM is None. | These are existing settings, not approval or evidence of recording consent, working CRM delivery, accessible recordings or lawful retention. No recordings were opened. Review notice/consent, destination and retention before live testing. [Account settings](https://app.kixie.com/manage/account) |

The immediate blockers are the unresolved representative-verification banner, unset inbound/ringing configuration, and the hosted backend/authentication plus secure webhook-secret setup. The hosted authenticated preview and end-to-end live flow remain unverified. The receiver also deliberately accepts fictional fixtures only; live collection requires a separately approved and reviewed code change. Neither this audit nor a draft PR authorizes credential configuration, routing changes, recording changes, test calls, purchases or production deployment.

## Recommended starting setup

Use Kixie PowerCall in Google Chrome on the PC with a USB headset as the primary call device. Give each purchased-call vendor or distinct campaign its own destination number when feasible, then map that destination to the CRM's source record. Start with direct routing to the agent; add queues or ring groups only when multiple licensed agents are actually ready. Optional cell forwarding is a fallback. Public documentation supports this architecture without requiring a second phone platform. The account audit confirms the displayed Professional subscription and an assigned number; feature activation, intended-PC setup and delivery behavior still need verification. Additional numbers require a separate purchase decision.

Do not add Twilio merely to duplicate Kixie's calling. Consider another provider only after documenting a specific unmet requirement, such as a routing/authentication behavior Kixie cannot support, and evaluating number ownership, call-leg billing, consent, transfer behavior, failure modes and added maintenance.

## Set up the PC and headset

1. In Google Chrome, use the official [PowerCall extension](https://chrome.google.com/webstore/detail/kixie-powercall-dialer/bmdpeakaalmaaflnkckhjcojpemlkjig?hl=en). Kixie instructs users to install in Chrome, sign in, allow the microphone, and pin the extension. Installation, sign-in, and permission changes are user-controlled setup steps; none was performed here. [Installation guide](https://support.kixie.com/hc/en-us/articles/360019966513-How-to-Download-the-Kixie-PowerCall-Dialer-Chrome-Extension)
2. Connect the USB headset. In PowerCall audio settings choose the microphone, speaker and ringtone outputs, and test them. On Windows, the Chrome app's input/output can be pinned in System > Sound > Volume Mixer to avoid unexpected device switching. [Audio guide](https://support.kixie.com/hc/en-us/articles/219599807-Kixie-PowerCall-Dialer-Audio-Settings)
3. Keep PowerCall selected as the dialing device. Verify a direct number is assigned and test an authorized call before routing paid traffic. The standard direct-line flow rings PowerCall and then Kixie voicemail. [New-agent guide](https://support.kixie.com/hc/en-us/articles/4472693973403-New-Agent-Setup-Guide)
4. If desired, add a cell-forward fallback after PowerCall, with Announce Call/press-one acceptance and then Kixie voicemail. The mobile app is not guaranteed to ring consistently. Direct-line forwarding does not automatically apply to ring-group or queue calls, which target a device separately. [Direct-line flow](https://support.kixie.com/hc/en-us/articles/40259980714779-Setting-up-Your-Direct-Line-s-Inbound-Call-Flow)
5. Leave cell-based Kixie Connect as an optional manual-call contingency. It retains Kixie call logging but does not support PowerList dialing. [Kixie Connect](https://support.kixie.com/hc/en-us/articles/4423458188955-Kixie-Connect-Using-your-cell-phone-or-existing-phone-service-with-Kixie)

### Clicking a number in the CRM

Kixie documents its red injected click-to-call icon beside recognized numbers. Enable click-to-call in the extension and select PowerCall as the device. A generic `tel:` link is not proof that Kixie will handle a call; no official custom Kixie URI scheme was verified. [Click-to-call instructions](https://support.kixie.com/hc/en-us/articles/208338457-How-do-I-use-Kixie-Click-To-Call)

Kixie also offers a server-side Make a Call API that rings the agent before dialing the prospect. That is a separate integration requiring activated credentials and explicit call authority. A CRM button should say whether it copies a number, invokes an OS phone handler, uses a tested extension path, or initiates a real Kixie API call. Never present an untested link as an operational dialer. [Make a Call API](https://www.kixie.com/developer/make-a-call/)

## Attribute each vendor without guessing

Create a controlled mapping of Kixie destination DID to vendor, campaign, lead type, agreed price and effective date. Kixie numbers can be assigned to an agent, IVR, queue or ring group. A reassigned DID needs a dated mapping so old calls retain their original attribution. [Number assignment](https://support.kixie.com/hc/en-us/articles/18954796970395-Assigning-and-Reassigning-Phone-Numbers-to-Agents)

The event payload includes customer/business numbers and call numbers; it does not establish a generic lead-vendor campaign ID. Test that the purchased destination remains identifiable through each real route and transfer. Never assume caller ID proves who bought the lead, the consumer's residence, consent, or identity. If the vendor replaces caller ID with its transfer number, require an agreed metadata path or reconcile using its call ID and call report. Unknown source stays unknown until resolved. [End Call payload](https://www.kixie.com/developer/webhooks-end-call-webhook/)

Suggested source record:

| Field | Purpose |
| --- | --- |
| Vendor and product | Keep screened transfer, unfiltered TV inbound and data leads separate |
| Destination DID | Attribute only where the tested route preserves it |
| Vendor campaign/call IDs | Reconcile against the seller's billed-call report |
| Effective unit price and currency | Preserve original cost when future pricing changes |
| Buffer and clock start | Store exact contract rule, not an assumed duration |
| IVR/hold/voicemail treatment | Affects whether non-conversations consume budget |
| State/age/product filters | Record ordered criteria and independently verified eligibility |
| Daily cap and operating hours | Stop paid supply when agents cannot answer |
| Credit deadline and reason | Track disputes separately from eventual approved credits |

## Route to the right available person

For small teams, Kixie supports simultaneous, linear and linear-round-robin ring groups. A group needs a number or IVR route and explicit no-answer handling. Kixie advises no more than ten agents per group. [Ring-group setup](https://support.kixie.com/hc/en-us/articles/4402351318939-Setting-up-a-Ring-Group)

For concurrent traffic, queues hold calls for available agents. Availability depends on queue subscription, no active call and no DND; setup includes teams, voicemail/callback options and optional DND after a missed call. Avoid enabling automatic callbacks until the callback purpose and consent process are approved. [Queue setup](https://support.kixie.com/hc/en-us/articles/360047302494-Setting-up-a-Call-Queue), [queue availability](https://support.kixie.com/hc/en-us/articles/17234547300251-Inbound-Call-Queues-FAQs)

Kixie's CRM routing documentation lists conditions such as ownership, first caller, deal status/value and last-contact dates. It does not demonstrate a turnkey state-license registry or support for arbitrary fields in this custom CRM. Matching every rule condition and configuring fallback routes remain necessary. [Routing setup](https://support.kixie.com/hc/en-us/articles/17326350115227-CRM-Rules-Based-Routing-Setup), [routing rules](https://support.kixie.com/hc/en-us/articles/17588281635355-CRM-Rules-Based-Routing-FAQs)

Operational requirement: establish the consumer's actual state and the agent's verified authority for the product before assignment or sale. Area code alone is not a trustworthy residence check. Use vendor state filters plus an approved intake/verification step and an exception destination for unknown or unsupported states. A website dashboard assignment cannot reroute an active phone call by itself. Confirm the actual telephony rule before promising automatic licensed-agent routing.

## Keep these outcomes separate

| Measure | What it means |
| --- | --- |
| Ringing | Call initiation; not a finished missed call |
| Answered | Telephony reports an answer; not necessarily a qualified consumer |
| Kixie reporting connection | Configurable duration classification in Kixie's reporting |
| Vendor billable | Seller's particular clock, threshold and acceptance rules |
| Qualified | Meets recorded product, state and agent-approved criteria |
| Application submitted | Application stage, not issued revenue |
| Issued and paid | Confirmed policy and received commission |
| Persisted business | Still in force after the chosen observation period, net of reversals |

Kixie's standard reporting connection threshold is 180 seconds. That is independent of any vendor's 180-second charge buffer. The webhook's `amount` field is telephony cost, not purchased-lead price. [Kixie account settings](https://support.kixie.com/hc/en-us/articles/4405882549531-Manager-Dashboard-Account-Settings)

A 30/90/180-second buffer is a billing or screening period. It is not a deadline to close a policy. Confirm precisely when the seller's clock starts and which time counts. Never infer vendor billability from Kixie duration alone.

## Recording and data handling

Kixie has account/agent recording controls and inbound greeting messages for direct lines, groups, queues and IVRs. Product controls and a generic recorded-line greeting do not establish that a particular state-specific recording policy is lawful. Confirm an approved consent/notice policy for the actual jurisdictions before enabling recording or forwarding recordings to this CRM. No jurisdiction-specific legal determination is made here. [Recording controls](https://support.kixie.com/hc/en-us/articles/360009448814-How-Do-I-Control-Settings-for-Call-Recordings)

The recording FAQ describes storage while an account is active, archiving after eighteen months, support-configured age-based deletion, and removal from the platform after cancellation. It also says CRM recording URLs remain active after cancellation. These statements leave deletion/link access consequences unclear. Obtain written confirmation of retention, link authentication, archive restoration, deletion scope and backup handling. Do not promise permanent access or deletion from this page alone. [Recording FAQ](https://support.kixie.com/hc/en-us/articles/360019966353-Call-Recording-FAQs)

CRM implementation requirements: store only approved normalized call fields; never raw-persist webhook bodies or credential-like nested CRM objects. Restrict call history, notes and any recording references to authorized agency members. Keep lead identities, health/financial details, credentials and recordings out of public previews, logs, screenshots, and fixture files. Recording, transcription and automated follow-up remain separately gated capabilities.

## Purchase and acceptance checklist

Before spending, obtain a written offer specifying:

1. Product/source mix: consumer-initiated inbound, screened outbound transfer, or data lead; TV/CTV channels if claimed; exclusivity and resale rules.
2. State, age, product and screening criteria; proof of the permission relevant to any follow-up channel; explicit handling of unsupported states and wrong-party calls.
3. Total spend cap, taxes/fees, prepay amount, auto-recharge behavior, term, cancellation/pause mechanism and unused-balance refund policy.
4. Buffer clock start, threshold boundary, IVR/hold/voicemail treatment, failed transfer treatment, duplicate definition and charge-dispute evidence.
5. Approved Kixie destination, caller-ID preservation, metadata/report delivery, operating hours, daily cap and simultaneous-call cap.
6. Credit/refund eligibility, reporting deadline, cap, evidence required and expected decision time. Replacement credit and cash refund are different.
7. An agreed low-volume test plan. Do not order until the agent can answer and the destination has passed functional tests.

Controlled tests should cover a normal answered call, decline, no answer, voicemail, offline/DND, after hours, concurrent calls, optional cell forwarding, unsupported state, duplicate contact, transfer and repeated webhook delivery. Use fictional or explicitly authorized test parties; never ring random numbers. Verify audio, source DID, displayed caller identity, call ID, times, outcome, cost reconciliation and fallback route. Keep the live integration disabled until authentication, tenant isolation and event behavior are verified.

## Evaluate the test on net outcomes

Track attempted/delivered calls, billed calls, actual live conversations, qualified prospects, applications, issued-and-paid policies, credit requests/approvals, refunds, agent time and reversals. Use the same observation window and definitions for every vendor. A provider's advertised close rate or a reviewer claiming one sale is not a reliable forecast.

Suggested calculations:

- Net acquisition spend = vendor charges + attributable phone/software costs - refunds/approved credits actually realized.
- Cost per qualified prospect = net acquisition spend / verified qualified prospects.
- Cost per issued-and-paid policy = net acquisition spend / confirmed issued-and-paid policies.
- Net contribution = commission actually received - acquisition spend - chargebacks and other attributable variable costs.

Do not rank vendors by sticker price alone. Predefine acceptable unit economics using the agency's own commission and persistency data, then compare matched batches. Stop or pause when agreed caps, routing availability or eligibility checks fail. A small pilot supports a cautious next decision, not a guaranteed long-run ROI claim.

## Production readiness boundary

Current public plans show Developer API and inbound routing features, while API authentication requires Professional-or-above access and activation. The read-only audit confirms a displayed Professional subscription, Allow Webhooks ON and External API keys disabled. It does not establish activated API access, a configured webhook or successful delivery. API credentials for management or server-initiated calls are distinct from the supported custom secret header on Kixie's outgoing webhook requests; disabled External API keys alone do not prove webhook delivery is unavailable. Confirm that distinction with Kixie for this account rather than enabling keys speculatively. [Plans](https://www.kixie.com/pricing/), [authentication](https://support.kixie.com/hc/en-us/articles/7273987300635-Kixie-API-Authentication-Your-API-Key-and-Business-ID)

Webhook API configuration supports custom headers. No provider HMAC signing algorithm, delivery ID, retry schedule, or ordering SLA was verified. Use a dedicated secret header, expected Business ID, strict event/schema validation, atomic deduplication, out-of-order handling, and sanitized exceptions. Live header delivery must be demonstrated. The technical implementation/rollout documentation is authoritative for what this application actually supports; a documented Kixie feature is not automatically implemented here. [Webhook management](https://support.kixie.com/hc/en-us/articles/20871662051739-Managing-Kixie-Event-Webhooks-via-API)

Vendor evidence follows below. Prices and marketing claims require reconfirmation in the actual order before payment.

## Vendor shortlist and published offers

The user's provisional S shortlist is Final Expense Leads Specialist and LeadSwitch Media; the A comparison group is Final Expense TV, 23 Insurance and Callmart. These labels express testing priority only. Research does not establish superior conversion, persistency, compliance or ROI for either group.

| Vendor | Advertised offer in USD | What is actually being purchased | Main unresolved purchase condition |
| --- | --- | --- | --- |
| Final Expense Leads Specialist | $30 per transfer / 180-second buffer; alternative $25 / 120 seconds | Human-screened warm transfers sourced from inquiries, re-engaged/aged prospects and opt-in lists. Not verified as consumer-initiated TV inbound. | Actual transfer minimum; when timer starts; hold/whisper/IVR treatment; criteria mismatch credits. [Offer](https://finalexpenseleadsspecialist.com/live-transfers/) |
| LeadSwitch Media | $55 per TV/CTV call / 90 seconds | Consumer-initiated inbound from streaming/CTV advertising, explicitly without health/budget screening. Other inbound/recovered/outbound-transfer products are separate. | $500 funding minimum, agreement and insertion order; authoritative linked live rate list was inaccessible. Confirm quoted rate and contract. [TV offer](https://leadswitchmedia.com/insurance/final-expense-tv-calls) |
| Final Expense TV | $45 per connected call; smallest package 10 calls / $450 | Claims TV/CTV/broadcast/streaming consumer inbound, without outbound call-center transfers. | No numeric billing buffer or detailed credit/refund window verified. Confirm what connected means. [Pricing](https://finalexpensetv.com/pricing), [call source](https://finalexpensetv.com/inbound-calls) |
| 23 Insurance | Quote only; 30-second buffer | Claims direct consumer TV inbound, with the agent as first voice. | Dollar rate, external DID delivery, affiliation requirements, timer details and invalid-call credits. No public fixed price verified. [Offer](https://go.23insurance.com) |
| Callmart | Screened FE from $25; CTV from $50; campaign-specific buffer, at least 10 seconds | Separate screened-inbound and CTV marketplace products. | Final campaign rate/criteria and unused-wallet refund. Publicly supports phone number/SIP destinations; Kixie integration not specifically certified. [FE calls](https://callmart.io/calls/final-expense), [pricing](https://callmart.io/pricing) |
| AgentCalls | Indexed production page: FE $60 / 85 sec; live transfer $60 / 80 sec; raw FE $27 / 10 sec; premium FE $75 / 55 sec; individual platform $97/month plus call credits | Browser-softphone inbound platform with separate campaigns. | Indexed rates remain provisional because the directly fetched page did not render the rate table; external Kixie delivery unverified. [Homepage](https://agentcalls.io/), [cost guide](https://agentcalls.io/guides/what-inbound-insurance-calls-actually-cost/) |
| Speakeasy Leads | FE form leads: 30/$780, 60/$1,500, 90/$2,160, 120/$2,760 before promotions | Exclusive Facebook-generated data/form leads delivered to Sheets for the agent to contact; no call buffer. | Conflicting screening and replacement/refund policies require written resolution. [Product](https://speakeasyleads.com/product/exclusive-final-expense-leads/) |
| G.O.A.T. Leads | Fresh FE data leads advertised $19–$31 each; aged $4 | Social/search/video form leads for outbound follow-up; no equivalent TV inbound-call product verified. | Confirm one-time order versus weekly subscription and total commitment; policy distinctions for fresh/aged leads. [FE product](https://goatleads.com/life-insurance-leads/final-expense), [homepage](https://www.goatleads.com/) |

### Terms that materially change the comparison

- FELS: the general FAQ lists a 20-lead minimum, but applicability to the live-transfer offer is unclear. Policy generally rules out refunds after service; missing-information/out-of-area replacement claims need recording evidence within seven days. The detailed offer and homepage disagree on the upper age target, so the order must specify it. [Policy](https://finalexpenseleadsspecialist.com/final-expense-leads-specialist-refund-and-replacement-policy/), [FAQ](https://finalexpenseleadsspecialist.com/)
- LeadSwitch: public offer excludes hold, IVR and voicemail from its connected-talk timer; disputes are due within seven days. It describes no subscription, optional auto-reload and conditional unused-cash refunds on account closure/request. Missed calls can be offered to another buyer. Confirm contract precedence before funding. [Offer and terms](https://leadswitchmedia.com/insurance/final-expense-tv-calls)
- Final Expense TV: advertises no setup fee, long-term contract or monthly minimum, but the listed starting package is still $450. Website terms refer service arrangements to separate agreements. Obtain the actual package refund/credit terms. [Pricing](https://finalexpensetv.com/pricing), [terms](https://finalexpensetv.com/terms)
- 23 Insurance: advertises no contract, minimum, package or large prepay. Detailed refund/replacement conditions were not verified. These are public marketing statements, not a reviewed order. [Offer](https://go.23insurance.com), [website terms](https://go.23insurance.com/terms)
- Callmart: ringing is excluded, but buyer IVR/voicemail after answer counts toward its timer. Prepaid wallet; unused funds refunded only case by case, and eligible disputes may earn credits. Extra softphone seats are advertised at $50/month. A Kixie route must be tested before assuming the buyer needs any seat add-on. [Pricing](https://callmart.io/pricing), [terms](https://callmart.io/terms)
- AgentCalls: going offline is separate from cancelling its recurring platform plan. Call-credit dispute approval is not automatic; no firm public unused-credit refund window was established. [Cost guide](https://agentcalls.io/guides/what-inbound-insurance-calls-actually-cost/)
- Speakeasy: replacement policy says 48 hours, 20% cap and no refunds/cancellation; Terms instead describe five business days and a possible refund for undelivered orders. Do not choose the friendlier sentence and assume it governs. [Replacement policy](https://speakeasyleads.com/replacement-policy/), [Terms](https://speakeasyleads.com/terms-of-service/)
- GOAT: quality remedy is replacement, with defect/reporting limits. Subscription terms describe the initial purchase plus three weekly renewals. Homepage terminology is inconsistent about three versus four weeks; review all four charges. Terms also contain a material payment-dispute administrative charge provision. [Terms](https://signup.goatleads.com/welcome/terms)

No vendor here had a publicly verified named Kixie integration. Callmart explicitly documents external phone/SIP routing. The other own-phone claims make a Kixie DID plausible, but compatibility, caller-ID preservation and billing must be demonstrated rather than promised.

### Independent review quality

FELS has a small self-selected [Trustpilot review set](https://www.trustpilot.com/review/finalexpenseleadsspecialist.com), with positive anecdotes but no audited issued-and-retained policy cohort. Independent hosting does not validate every review or advertised sales result.

Speakeasy has only a few [Fiverr reviews](https://www.fiverr.com/speakeasyleads) and mixed [agent forum accounts](https://www.insurance-forums.com/community/threads/purchasing-leads.115245/page-2). GOAT has mixed [agent discussion](https://www.reddit.com/r/InsuranceAgent/comments/1r1fxpz/should_i_get_500_dollars_worth_of_aged_leads_or/), without standardized campaign or outcome data. These are clues for questions, not a dependable ranking.

No substantial independently verified vendor-specific performance corpus was established for LeadSwitch, Final Expense TV, 23 Insurance, Callmart or AgentCalls in this research. Self-published comparison articles, testimonials and automated domain-safety scores do not establish lead quality. Absence of review evidence is also not proof a seller is bad. Use bounded, instrumented tests and written terms to make the next purchasing decision.
