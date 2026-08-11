# Production SaaS Functional Completion Goal

**Prepared:** 2026-08-10  
**Authority:** `AUTH-005` plus Aaron's 2026-08-10 request for a functionality-first completion plan  
**Status:** Execution-ready goal brief; not a claim that the product or release is complete  
**Primary implementation surface:** [`10_production_saas`](../10_production_saas/)  
**Authoritative business source:** [`00_source/BUSINESS_PLAN_V2.md`](../00_source/BUSINESS_PLAN_V2.md)

**Implementation-status reconciliation (2026-08-11):** Sections 2–4 and the
“Current state” column in section 9 preserve the pre-functional baseline used to
define this goal; they are not the active frozen-candidate status. The current
source has 17 migrations through `0016_handy_green_goblin` and implemented rich
media/branding/coaching surfaces. Use
[`10_production_saas/docs/REQUIREMENTS_TRACEABILITY.md`](../10_production_saas/docs/REQUIREMENTS_TRACEABILITY.md)
for source-by-source reconciliation. Frozen-source revision 9 `npm run verify`
exited 0 with 526/526 passing and zero fail/cancel/skip/todo; Node reported
`40865.1364ms`, tool wall time was `55057ms`, and the exact candidate-scoped log is
[`output/playwright/candidate-functional-final-20260811-r9/verify-functional-final-20260811-r9.log`](../output/playwright/candidate-functional-final-20260811-r9/verify-functional-final-20260811-r9.log).
The source identity is
`bf27e9b45ff00401511bde350cca7319dbfd8ed89b8c0dbc434f52b19bc4a2f2`; the exact
build identity is
`6b1b5d298536c951e074c1e495f909bb626a62ef58ba1a8590bc23e3f3329d44`.
Revision 9 is still acceptance-ineligible: exact Playwright A–H browser, visual,
and PDF evidence remains `not_recorded` because the Playwright daemon escalation
was rejected by the Codex usage limit until August 17. That is an execution-service
blocker, not a product pass or failure. Revision 8 remains historical and
browser-ineligible after its upload-form snapshot and proxy-masking defects; both
are fixed and tested in revision 9 source, which does not rehabilitate revision 8.
The dated 389/389 baseline below remains historical. Revisions 1–7 are also
historical, acceptance-ineligible diagnostics. Revision 6 remains ineligible for
its media-limit and golfer-directory blockers; revision 5 remains ineligible for
its staged-golfer and expired-session defects; revision 4 remains ineligible for
its CSP `blob:` media defect. Scratch replays are diagnostic only and supply no
acceptance evidence. No Scenario A–H or overall acceptance is recorded; exact-final
Playwright A–H evidence and overall acceptance remain pending.

## 1. Outcome

Take Roadmap from its current reliable, text-first private candidate to a polished,
functionally complete self-serve golf-coaching SaaS that an independent instructor
can use without founder help and that a golfer will find genuinely useful between
lessons.

The target product must make coach-authored roadmaps faster to create, easier to
manage, visually richer, and more valuable over time. It must include first-class
places for swing videos, practice-drill examples, structured launch-monitor data,
lessons, evidence comparisons, phase reviews, and golfer check-ins while preserving
the coach's judgment and existing tools.

This goal deliberately prioritizes product functionality, UX, UI, and content
quality. It does **not** ask the completing agent to spend the workstream primarily
on new security hardening, provider-log remediation, legal review, or operational
certification. Existing safety, privacy, tenancy, truthfulness, and test controls
must not be removed or weakened. Functional work that handles private media or
golfer data must still maintain the minimum access and consent boundaries required
for the feature to work correctly.

## 2. Baseline position recorded at goal creation

### 2.1 Verified facts

- The current application is a real Vinext/React/Cloudflare Worker application
  backed by D1 and an R2 binding, not merely a visual prototype.
- At goal creation, the local source built cleanly and `npm run verify` had passed
  **389 of 389 tests** on 2026-08-10 with no failures, skips, or todos.
- The Sites project still reports saved version **16** as the newest version. Its
  source commit is `91f37ebd542774779f6db7e000832c2f6714e528`.
- The recorded version-16 private deployment reports `succeeded` at
  `https://roadmap-golf-coaching.aar-landry.chatgpt.site` and remains owner-only
  staging rather than a public, accepted customer release.
- The current product implements the text-first core loop: coach profile, coaching
  packages, adult golfer creation, goal and assessment capture, three- or four-phase
  roadmaps, preview, publication, revocable sharing, golfer choices, lesson chapters,
  practice directions, evidence notes, phase review, return-state navigation, data
  controls, and a locally verified SaaS billing boundary.
- The current visual direction is coherent and distinctive. Existing desktop and
  mobile evidence shows a calm editorial style, responsive layouts, clear typography,
  and a strong golfer-facing roadmap foundation.
- A live mounted-browser review could not be performed during this audit because no
  supported browser was available. UX/UI findings therefore use the current source,
  production build, rendered-route tests, and the repository's 320/390/1440-pixel
  visual evidence. This limitation must not be mistaken for live interaction evidence.

### 2.2 Functionality-first completion estimate

Completion percentages are planning estimates, not test-coverage claims or business
validation. The score measures the richer functional product defined in this brief.

| Functional area | Weight | Current estimate | Evidence-based assessment |
|---|---:|---:|---|
| Core platform and record lifecycle | 12% | 85% | Strong persistence, lifecycle, concurrency, recovery, and automated coverage |
| Acquisition, onboarding, and branding | 10% | 55% | Strong landing page and basic profile; no true guided activation, logo/photo workflow, or public signup |
| Coach packages and SaaS billing | 10% | 55% | Coach-package CRUD is usable; Stripe lifecycle is implemented locally but Checkout is disabled and commercial configuration is unresolved |
| Golfer and roadmap authoring | 16% | 75% | Full text-first flow works; authoring is long, form-heavy, and lacks templates, autosave clarity, rich previews, and reusable content |
| Preview, sharing, and golfer roadmap | 14% | 80% | Shared renderer, private links, and golfer choices are strong; delivery, media, print/export, and engagement feedback are thin |
| Living coaching journey | 12% | 55% | Lessons, practice, evidence, and phase reviews exist but expose only part of the schema and do not yet feel like a complete ongoing coaching workspace |
| Swing media, drill library, and launch-monitor data | 16% | 10% | Useful schema scaffolding exists, but there is no end-to-end user-facing media flow, drill library, structured metric entry/import, or comparison visualization |
| UX/UI polish and self-serve discoverability | 10% | 55% | Visual foundation is strong; dense authoring, sparse management views, limited guidance, and missing rich states reduce usability and delight |
| **Weighted functional completion** | **100%** | **about 58%** | **About 42 percentage points remain for the richer target product** |

Against the repository's narrower, text-first bounded V1, the implementation is
approximately **78% functionally complete**. Against the product Aaron requested in
this task—rich media, drill examples, launch-monitor evidence, excellent UX/UI, and
a compelling living journey—the better planning number is **about 58% complete**.

That dated 389-test baseline demonstrates engineering maturity in the implemented
surface. It does not make absent product features complete.

## 3. What works today

### 3.1 Instructor experience

- Basic coach identity, contact details, location, philosophy, and accent colour.
- Coaching-package creation, editing, archiving, restoring, and external booking or
  purchase link.
- Resumable minimum-first golfer creation with an explicit adult confirmation.
- Goal, context, assessment, strengths, primary pattern, evidence limits, current
  priority, three or four phases, progress signals, and first-phase package link.
- Core roadmap editing with revision protection.
- Exact coach preview using the same renderer as the golfer view.
- Deliberate publish, reissue, revoke, and account-level share controls.
- Lesson-chapter, practice-direction, evidence-note, and phase-review authoring.
- Golfer records, package lists, workspace summary, contextual next actions, billing
  page, profile/settings, data requests, and export controls.

### 3.2 Golfer experience

- A private, mobile-responsive roadmap organized into Now, Goal, Roadmap, Lessons,
  Practice, Evidence, and Phase Review.
- Coach identity, goal context, honest assessment limits, ordered phases, current
  priority, package fit, and external next action.
- Choices to ask, wait, decline, request reassessment, practise independently, or
  open the coach's external action.
- Expired, revoked, replaced, and closed-access behavior.

### 3.3 Engineering foundation worth preserving

- At goal creation, thirty-one application tables and eleven committed migrations.
- Tenant-owned records, revision fences, publication invalidation, share-session
  lifecycle, idempotent mutations, and bounded failure recovery.
- A media-asset table and R2 binding that provide useful scaffolding for the missing
  media product surface.
- Evidence fields for metric name, value, unit, comparison groups, and media links,
  even though the current UI/API/view model does not use them.
- Schema states for planned/completed lessons and practice items, even though the
  current UI implements only a smaller subset.

## 4. Largest functional gaps

### 4.1 Swing video and rich media are schema-only

The `media_assets` table supports image, video, audio, and document metadata, and
the project declares an R2 `MEDIA` binding. Instructor profiles also contain logo
and profile-photo foreign keys, and evidence can reference a media asset.

However, there is no complete upload API, upload UI, progress state, processing
state, attachment workflow, thumbnail/poster experience, secure playback route,
gallery, replacement flow, or user-facing media removal flow. The evidence API
explicitly excludes the schema's `media` evidence type. Coach logos and profile
photos are likewise not usable from the profile form.

### 4.2 Launch-monitor data is not a real feature

The evidence schema has `metricName`, `metricValue`, `metricUnit`, comparison role,
comparison group, and device source fields. The current evidence form does not ask
for metric name, numeric value, unit, club, session, conditions, or shot series.
The API does not accept the metric fields, and the golfer view does not render them.

Today, a coach can type a launch-monitor observation into prose and label its source
as a device. That is not structured launch-monitor support.

### 4.3 Practice is one free-text direction, not a drill system

Current practice authoring captures a title, objective, rationale, instructions,
cadence, success check, common mistake, stop/ask rule, and constraint note. This is
a good assignment shape, but there is no coach drill library, no provided examples,
no clone/customize flow, no thumbnails or demo video, no equipment/setup metadata,
no progression/regression, no favourites, no search, and no reusable templates.

The data model includes completed and paused practice states, but the UI mainly adds
or replaces an active practice item. A golfer cannot mark practice complete, report
difficulty/confidence, or submit a bounded practice check-in.

### 4.4 The living journey exposes only part of its potential

- Lessons can be added only after completion even though the schema supports planned,
  scheduled, completed, and cancelled states.
- `golferLearning` exists in the lesson schema but is not captured or displayed.
- Evidence comparisons, representative flags, numeric values, and media are not
  authorable or visible.
- Phase reviews use typed summaries rather than allowing the coach to select the
  exact evidence, videos, measurements, lessons, and practice results considered.
- There is no unified chronological journey or activity timeline.
- Milestone recognition is absent. Referral and public/social sharing should remain
  outside this functional goal unless Aaron separately expands that boundary.

### 4.5 Authoring is correct but too laborious

The core forms are long, technical, and field-by-field. They lack a clear guided
wizard, example-driven prompts, field-level preview, reusable roadmap templates,
saved coach defaults, visible save state, easy phase reordering, drag/drop, and a
side-by-side golfer preview. Optional and advanced details are not progressively
disclosed strongly enough.

This threatens the Business Plan V2 self-serve promise even though the underlying
mutations work.

### 4.6 Management views are too sparse

The workspace shows counts and recent golfers, while the golfer list is a paginated
record list. There is no search, filter, sort, quick-create menu, task inbox,
practice-due view, phase-review queue, recently opened/share-engagement state,
media-processing state, or clear cross-golfer coaching calendar.

Roadmap must not become a general CRM, but a solo instructor still needs a useful
coaching command centre.

### 4.7 Branding is incomplete

At goal creation, accent colour worked while logo and coach-photo schema fields were
unavailable.
There is no live brand preview, logo crop, light/dark mark handling, or consistent
brand application to downloadable/print views.

### 4.8 The commercial self-serve loop is not live

The billing implementation is substantial, but new Checkout is disabled. Exact
price, trial, pause, cancellation, tax/refund/failure behavior, public identity,
domain, and provider configuration remain unresolved. The private staging site is
not a public signup experience.

This is partly an external-dependency lane, but it remains a functional gap between
the current candidate and a purchasable self-serve SaaS.

## 5. Goal command for the completing agent

Use this document as the main specification and start the work with a goal equivalent
to:

> Bring the Roadmap production SaaS from the verified 2026-08-10 text-first baseline
> to 100% of the functionality-first definition of done in
> `08_implementation_handoff/PRODUCTION_SAAS_FUNCTIONAL_COMPLETION_GOAL.md`. Build
> complete vertical slices for exceptional instructor and golfer UX, swing media,
> reusable drill examples, structured launch-monitor data, the living coaching
> journey, onboarding, branding, sharing, and commercial test-mode flows. Preserve
> existing behavior and controls, keep Business Plan V2 authoritative, use synthetic
> data, run the full verification suite throughout, and do not mark the goal complete
> while any required functional acceptance scenario or P0/P1 item remains open.

The agent should treat the goal as persistent and should not stop after creating
schemas, mockups, isolated components, or planning notes. A feature is complete only
when its data model, server behavior, instructor UX, golfer UX where applicable,
error/empty states, and automated acceptance evidence work together.

## 6. Product boundary for this goal

### 6.1 In scope

`[SUPPORTED BY BUSINESS PLAN V2]`

- Canada-wide self-serve B2B SaaS for one independent adult-golfer instructor account.
- Coach-owned diagnosis, language, priorities, phases, evidence interpretation, and
  package recommendation.
- Goals, assessments, roadmaps, packages, lessons, practice, evidence, measurements,
  swing media, phase reviews, progress, renewal context, and private golfer delivery.
- Compatibility with the instructor's existing booking, payment, communication,
  swing-video, and launch-monitor tools.
- A calm, credible, mobile-first golfer experience and an efficient desktop/mobile
  instructor experience.

`[IMPLEMENTATION RECOMMENDATION UNDER AUTH-005]`

- First-party storage and playback for approved coach/golfer media.
- Vendor-neutral launch-monitor sessions with manual entry and CSV import before any
  vendor API integration.
- A coach-owned drill library with editable example templates and media attachments.
- Bounded golfer practice check-ins rather than a general messaging product.
- A coaching-focused command centre, not a general CRM.
- Print-friendly and downloadable roadmap summaries.
- Prepared share-message copy and QR code, without claiming a message was sent.

### 6.2 Still out of scope unless Aaron explicitly expands it

- AI diagnosis, AI coaching, automated roadmap generation, or outcome prediction.
- Native booking or payment for the instructor's lesson packages.
- Teams, facilities, academies, permissions, seat management, or aggregate reporting.
- Junior golfer use.
- Public coach marketplace or public golfer profiles.
- General CRM, inbox, chat, social feed, or marketing automation.
- Native iOS/Android applications, simulator control, GPS, or on-course tracking.
- Automated swing analysis or a launch-monitor replacement.
- Public milestone/social sharing, referral rewards, or automated referrals.

### 6.3 Security and operations treatment

Do not create a parallel security-hardening project inside this goal. Preserve all
current tests and controls, add only the access/validation behavior necessary for new
features, and record—not silently erase—existing release blockers. Provider-log
privacy, formal threat review, production recovery certification, legal review, and
operational acceptance remain in the existing full-live completion records.

## 7. Target end-to-end experience

### 7.1 Instructor first session

1. Understand Roadmap from the landing page and inspect a realistic synthetic example.
2. Create/sign into an account and see a short setup checklist.
3. Add name, business identity, logo/photo if desired, accent colour, and contact route.
4. Add a current coaching package or skip it without blocking initial value.
5. Create an adult golfer from a small first step.
6. Choose a roadmap starting template or start blank.
7. Enter the golfer goal, assessment, priority, and three or four phases with examples
   and progressive disclosure.
8. Add one or more swing videos, selected launch-monitor values, and a practice drill
   where they strengthen the plan; none is mandatory for the text-first core.
9. Preview the exact mobile golfer experience alongside authoring.
10. Resolve clear completeness issues, publish, copy the private link/QR/prepared
    message, and understand that Roadmap did not send anything automatically.

### 7.2 Golfer first visit

1. Open the private roadmap on a phone without installing an app.
2. Immediately understand the current priority and next useful action.
3. Review the goal and directional phases without scrolling through a data dump.
4. Play coach-selected swing clips with captions/context.
5. See a concise launch-monitor summary chosen and interpreted by the coach.
6. Open the current drill with setup, steps, dosage, demo media, success signal,
   common miss, and stop/ask guidance.
7. Record a bounded practice check-in or choose an existing response path.
8. Review lesson chapters, evidence comparisons, and the current phase outcome over
   time.

### 7.3 Instructor return journey

1. Land on a command centre showing the few coaching items that need attention.
2. Search for a golfer and open the current plan quickly.
3. Add a planned or completed lesson, replace/complete practice, attach new media,
   import or enter measurements, and capture golfer learning/check-in context.
4. Build a phase review by selecting the exact evidence considered.
5. Compare baseline and current media/data, write the coach conclusion, advance,
   revise, pause, or complete the phase, and connect the next package if appropriate.
6. Preview and republish the exact updated revision.

## 8. Required workstreams

Each workstream must be delivered as complete vertical slices. Detailed UX may evolve
during implementation, but the acceptance outcomes may not be replaced by database
scaffolding or static mockups.

### Workstream F1 — Information architecture and coaching command centre

Build a clearer application shell and a golfer-centred workspace.

Required capabilities:

- Workspace cards for setup progress, plans needing review, active practice, recent
  golfer responses/check-ins, incomplete drafts, and media/import failures.
- Golfer search plus useful status/phase filters and stable sorting.
- Quick actions for new golfer, new package, new lesson, new drill, media upload, and
  evidence entry when context allows.
- A golfer hub with clear Overview, Roadmap, Lessons, Practice, Media, Data/Evidence,
  and Reviews destinations. On narrow screens, destinations must remain discoverable
  without clipping important actions.
- One primary next action per major state, with secondary actions visually quieter.
- Purposeful empty, loading, success, partial, and error states.

Acceptance:

- A coach can find any seeded golfer by name and reach the current task in no more
  than a few obvious interactions.
- The interface remains a coaching workspace rather than becoming a generic CRM.
- Desktop, tablet, and 320/390-pixel mobile layouts preserve content and actions.

### Workstream F2 — Fast, guided roadmap authoring

Replace the highest-friction parts of the long forms with a guided flow while keeping
advanced fields available.

Required capabilities:

- A step-based creation/editing experience with Goal, Assessment, Priority, Phases,
  Evidence, Package, and Preview steps.
- Visible draft/save state, safe autosave or explicit section-save behavior, recovery,
  and a clear completion indicator.
- Example text and coaching-neutral prompts that teach field purpose without writing
  a diagnosis for the coach.
- Coach-owned reusable roadmap/phase templates and the ability to start blank.
- Easy three/four-phase selection, reordering, duplication, and editing.
- Progressive disclosure for optional details.
- Side-by-side or immediately reachable exact golfer preview at meaningful breakpoints.
- Preserve the current minimum-first resumable record path.

Acceptance:

- A synthetic first roadmap can be completed without reading repository documentation.
- Optional media/data never blocks a complete text-first roadmap.
- Refresh, interruption, validation errors, and stale revisions do not silently lose
  completed sections.
- All current publication-readiness rules remain visible and actionable.

### Workstream F3 — Complete media and swing-video experience

`[SUPPORTED BY BUSINESS PLAN V2]` Swing videos and progress evidence are part of the
product thesis.  
`[OWNER INPUT REQUIRED]` Exact live formats, file-size/duration limits, retention,
consent copy, and production processing policy are not yet approved. The agent may
implement configurable behavior and exercise it with synthetic media, but must not
claim those policy choices are approved.

Required capabilities:

- Complete upload, progress, success, failure, retry, replace, and remove flows backed
  by the existing private R2 binding and `media_assets` lifecycle.
- Coach logo and profile-photo upload/crop/preview.
- Swing-video and image attachment to assessments, lessons, practice assignments,
  evidence, and phase reviews through an explicit content-attachment model.
- Video poster/thumbnail, duration, caption, alt text, coach context, orientation/view
  label, captured date, and optional transcript fields.
- A responsive private player with keyboard/touch controls, fullscreen behavior,
  loading/failure fallback, and no forced autoplay.
- Media gallery and contextual attachment picker so an asset can be reused without
  re-uploading.
- Baseline/current pairing for coach-selected visual comparison. Side-by-side playback
  synchronization is a stretch improvement only after reliable independent playback.
- Clear processing states; no indefinite spinner or invisible failure.
- Golfer-facing media displays only when attached to the exact published revision.

Acceptance:

- A coach can upload two synthetic swing clips, label one baseline and one current,
  attach them to evidence, preview them, publish, play them on desktop/mobile, replace
  one, and remove access by republishing.
- A media feature is not complete if it works only through manual database insertion.
- Roadmap does not analyze the swing or generate a diagnosis.

### Workstream F4 — Coach drill library and rich practice assignments

Required capabilities:

- Account-level, coach-owned drill templates separate from golfer assignments.
- Create, edit, duplicate, archive, search, favourite, and preview a drill.
- Structured drill fields: title, purpose, when it fits, equipment, setup, numbered
  steps, dosage/cadence, feel/cue, success check, common miss, stop/ask rule,
  constraint/adaptation, progression, and regression.
- Optional demo video/image attachment through the shared media system.
- A small synthetic example library that demonstrates the content shape. Example
  coaching content must be clearly editable and must never be treated as a diagnosis
  or universal instruction. `[UNVALIDATED BUSINESS ASSUMPTION]`
- Assign from library to a golfer/phase, customize without changing the source
  template, start blank, replace, pause, complete, retire, and view history.
- Bounded golfer check-in: completed/not completed, perceived difficulty or confidence,
  optional short note, and request-help path. This is not a chat system.

Acceptance:

- A coach can create a reusable drill with a demo clip, assign and customize it for
  two golfers independently, and update one assignment without changing the other.
- A golfer can understand the drill on a phone and record a check-in.
- The coach can see the check-in and use it as selected context in a later review.

### Workstream F5 — Structured launch-monitor data and evidence comparison

Roadmap should curate launch-monitor evidence, not replace the launch monitor.

Required capabilities:

- Vendor-neutral launch-monitor session records with date, device/source, club,
  environment/conditions, notes, and optional attachment/source file.
- Manual quick entry for individual summary metrics.
- CSV import with a mapping/review step, validation report, partial-row handling, and
  an explicit final commit. Provide adaptable presets for common exports only when
  fixture-backed; do not promise a live vendor integration.
- Metric definitions that preserve original name, numeric value, unit, and direction
  while allowing familiar display names such as ball speed, club speed, carry,
  launch angle, spin, attack angle, club path, face-to-path, dynamic loft, and smash.
  The system must not assume every device supplies every metric.
- Shot-series storage where useful, plus coach-selected summary values. Do not flood
  the golfer view with every imported column.
- Baseline/current comparison groups, deltas, simple accessible trend charts, and
  accompanying text summaries.
- Coach interpretation, limitation, representativeness, and next-evidence fields.
- Evidence picker for roadmap and phase-review inclusion.

Acceptance:

- A coach can manually enter a small measurement set and import a synthetic CSV,
  correct the mapping before commit, select a few golfer-facing metrics, write the
  interpretation/limits, and publish an accessible comparison.
- Units are never silently converted or mixed. Missing data remains missing.
- The golfer sees what changed and what it may mean according to the coach, not a raw
  spreadsheet or automated diagnosis.

### Workstream F6 — Complete living journey

Required capabilities:

- Planned, scheduled, completed, cancelled, and archived lesson states with useful
  transitions and a chronological timeline.
- Lesson purpose, coach observation, golfer learning, takeaway, next check, phase
  connection, attached media, and selected measurements/evidence.
- Practice assignment lifecycle and history from Workstream F4.
- Evidence creation for observation, golfer report, measurement, outcome count,
  media, comparison, and note using the full relevant schema.
- Phase-review builder that selects the lessons, practice, check-ins, media, and data
  actually considered rather than relying only on typed summary prose.
- Clear continue, revise, pause, advance, goal-changed, insufficient-evidence, and
  complete-plan outcomes.
- Private coach-controlled milestone cards for meaningful progress moments. Do not
  add public/social sharing or rewards in this goal.
- A unified timeline with filters, while the golfer's default view stays focused on
  Now and the next useful action.

Acceptance:

- One synthetic golfer can move from assessment through two lessons, two practice
  assignments, a check-in, media evidence, launch data, a phase review, advancement,
  and a republished next phase without direct database intervention.
- Historical truth remains understandable after edits, replacements, and withdrawal.

### Workstream F7 — Exceptional golfer view and sharing

Required capabilities:

- Preserve the calm editorial design while adding media, metrics, drill cards,
  timeline, and phase-review evidence without creating a dashboard-like data dump.
- A sticky/current-action treatment that works on small screens and does not cover
  content.
- Clear media thumbnails and launch-data summaries with accessible text equivalents.
- Prepared share-message copy, copy link, QR code, link-expiry choice, reissue, and
  revoke in one share centre. Roadmap must still state when it has not sent a message.
- Print stylesheet and downloadable/print-ready roadmap summary with coach branding.
- Honest last-opened/response state only if recorded by existing first-party product
  events; never claim message delivery, booking, payment, or a coaching outcome.
- Useful low-bandwidth and media-failure states.

Acceptance:

- The same published revision is understandable and attractive at 320, 390, 768,
  and 1440 pixels.
- The golfer can find Now, current practice, selected swing clips, selected metrics,
  and the coach's next action without guessing.
- Print/download output is legible and contains no controls that make sense only on
  screen.

### Workstream F8 — Onboarding, examples, branding, and product content

Required capabilities:

- A first-run checklist that reflects actual persisted state and takes the coach to
  the next incomplete step.
- An optional interactive synthetic demo that can be reset and is unmistakably
  synthetic.
- Useful field examples, drill examples, launch-data sample, media sample, and one
  complete living-journey example.
- Logo/photo/accent preview and consistent application across coach workspace,
  golfer view, social preview where applicable, and print output.
- Contextual help close to difficult fields plus a findable support surface.
- Copy review for clarity, brevity, and removal of excessive compliance language from
  primary task paths while retaining truthful boundaries where needed.

Acceptance:

- A new user can understand what to do next from each empty state.
- The example content shows realistic instructor effort rather than an idealized
  marketing artifact.
- Branding never blocks first value and remains recognizably Roadmap rather than an
  unlimited website builder.

### Workstream F9 — Self-serve commercial function

Implement and verify the complete product behavior that can be completed without
inventing owner decisions. Keep unresolved commercial values configurable.

Required capabilities:

- Public acquisition to sign-in/signup routing on the selected production identity
  boundary.
- Test-mode Stripe Checkout, webhook, reconciliation, Portal, cancellation-state,
  pause/resume-state, failed-payment-state, and entitlement journeys using exact
  configured policy values.
- Clear account state when a trial/subscription is unavailable, active, past due,
  paused, cancelled, or ended.
- No confusion between the Roadmap SaaS subscription and the coach's external lesson
  package.
- Functional configuration checklist that identifies missing provider/owner inputs
  without exposing secrets.

`[OWNER INPUT REQUIRED]`

- Exact production price and Price identifier.
- Trial choice, cancellation, pause/resume, tax, refund, failed-payment, and data
  consequences.
- Public domain, OIDC provider/account, Stripe account, credentials, and support
  contact.

Acceptance:

- All states work end to end in local/provider test mode with synthetic accounts.
- No live charge or public-access claim is made without exact owner configuration and
  controlled evidence.
- If external inputs remain unavailable, the functional candidate may be complete
  only with a precise `CONFIGURATION READY — EXTERNAL ACTIVATION PENDING` record; the
  overall public production release must still be reported as incomplete.

### Workstream F10 — Functional quality and visual acceptance

Required capabilities:

- Preserve the dated 389-test baseline and add tests for every new vertical slice.
- Migrations for all schema changes, including upgrade coverage from the current
  eleven-migration state.
- Browser-level critical-journey coverage for the instructor and golfer scenarios in
  this document.
- Visual review at 320, 390, 768, and 1440 pixels for landing, onboarding, dashboard,
  authoring, golfer hub, media, data import, drill, share, and golfer roadmap states.
- Keyboard/touch behavior, labels, focus, reflow, contrast, reduced motion, and media
  alternatives as part of UX quality rather than a separate compliance project.
- Realistic short, long, empty, loading, partial, error, and recovery content states.
- Lazy media loading and responsive assets so rich content does not make the current
  priority slow or unusable.

Acceptance:

- `npm run verify` passes with no failures, skips, or todos after all work.
- New end-to-end functional tests pass against a fresh database and synthetic R2
  state.
- No required interaction is a dead button, placeholder, manual database step, or
  test-only path.
- Visual evidence is reviewed for the exact final candidate, not inherited from
  version 9.

## 9. Prioritized execution backlog

| ID | Priority | Deliverable | Current state | Completion evidence |
|---|---|---|---|---|
| `FUNC-001` | P0 | Preserve verified baseline and create fresh functional fixtures | Implemented baseline; fixtures incomplete for rich product | Existing and new suites pass from a fresh state |
| `FUNC-010` | P0 | Coaching command centre, search, filters, task-oriented golfer hub | Partial | Browser journey across seeded multi-golfer data |
| `FUNC-020` | P0 | Guided roadmap wizard, templates, progressive disclosure, exact preview | Partial | First-roadmap journey with interruption/recovery |
| `FUNC-030` | P0 | End-to-end media asset upload, management, private delivery, and player | Schema/R2 scaffolding only | Two-video baseline/current scenario passes |
| `FUNC-031` | P0 | Attach media to profile, assessment, lesson, practice, evidence, review | Missing | Attachment/reuse/replace/withdraw scenario passes |
| `FUNC-040` | P0 | Coach drill library and editable examples | Missing | Create/duplicate/search/archive/assign scenario passes |
| `FUNC-041` | P0 | Rich practice lifecycle and golfer check-in | Partial | Assign/complete/check-in/review scenario passes |
| `FUNC-050` | P0 | Launch-monitor sessions, metrics, manual entry, and CSV mapping/import | Schema fragments only | Manual and synthetic import scenarios pass |
| `FUNC-051` | P0 | Accessible selected-metric and baseline/current comparison UX | Missing | Coach-selection and golfer-comparison scenario passes |
| `FUNC-060` | P0 | Full lesson and evidence lifecycle with attachments | Partial | Planned-to-complete lesson and all evidence types pass |
| `FUNC-061` | P0 | Evidence-backed phase-review builder and unified timeline | Partial | Two-phase longitudinal scenario passes |
| `FUNC-070` | P0 | Rich mobile golfer roadmap with media, data, drill, timeline, and clear Now | Partial | 320/390/768/1440 visual and interaction evidence |
| `FUNC-071` | P1 | Share centre, prepared message, QR, print/download summary | Partial | Share/reissue/revoke/print scenario passes |
| `FUNC-080` | P1 | Logo/photo branding and live preview | Schema-only | Upload/crop/preview/publish/print scenario passes |
| `FUNC-081` | P1 | Interactive synthetic demo and complete example content | Partial | Resettable demo covers full value story |
| `FUNC-090` | P1 | Functional Stripe test-mode and subscription-state journey | Local backend strong; user journey externally blocked | Controlled test-mode E2E or exact blocker record |
| `FUNC-091` | P1 | Public signup/identity/configuration-ready journey | Direct OIDC boundary local; public provider absent | Controlled hosted test or exact blocker record |
| `FUNC-100` | P1 | Exact-candidate browser, visual, mobile, and long-content verification | Historical predecessor evidence only | Final-candidate evidence packet |

P0 items define the core functionality-first product and cannot be deferred while
claiming 100% functional completion. P1 items complete the self-serve and presentation
quality expected of the production SaaS. A P1 item may be recorded as externally
activation-blocked only where this document explicitly identifies owner/provider
input; its code and test-mode experience must still be complete.

## 10. Required acceptance scenarios

The completing agent must automate where practical and manually review every scenario.

### Scenario A — First self-serve roadmap

- Start from a fresh synthetic instructor account.
- Complete coach setup with and without optional branding.
- Add a coaching package.
- Create a minimum golfer record, resume it, finish a three-phase roadmap, preview,
  publish, copy a link, and open the golfer view.
- Repeat using four phases and no package.

### Scenario B — Swing-video evidence

- Upload two synthetic videos with different sizes/orientations.
- Add captions, context, dates, and baseline/current roles.
- Attach to a lesson/evidence pair, preview, publish, and play on desktop/mobile.
- Replace one asset, republish, and verify the old published access is unavailable.
- Exercise processing failure and retry.

### Scenario C — Practice-drill reuse

- Create a drill template with demo media and complete structured guidance.
- Duplicate and edit it.
- Assign custom variants to two golfers.
- Complete/check in on one assignment and leave the other active.
- Use the check-in in a phase review without changing the original template.

### Scenario D — Launch-monitor import and comparison

- Enter a manual measurement set.
- Import a synthetic CSV with recognized, unrecognized, missing, and invalid columns.
- Review/correct mapping before commit.
- Select a small golfer-facing metric set, preserve units, and write interpretation
  plus limitations.
- Publish a baseline/current comparison and verify accessible chart/text parity.

### Scenario E — Living journey and phase transition

- Schedule and complete lessons.
- Record golfer learning, coach takeaway, media, practice, check-in, and measurements.
- Build a review from selected evidence.
- Continue, revise, pause, advance, and complete across separate synthetic cases.
- Confirm revision invalidation and republishing remain understandable.

### Scenario F — Return and management

- Seed at least 30 golfers across incomplete, draft, published, paused, completed,
  archived, and review-needed states.
- Search, filter, sort, paginate, and open the correct next action.
- Verify the dashboard shows useful bounded work rather than vanity metrics.

### Scenario G — Golfer mobile and print experience

- Use short and extreme-length names/content.
- Navigate all sections at 320 and 390 pixels with touch and keyboard equivalents.
- Play media, inspect selected launch data, follow a drill, submit a check-in/choice,
  and print/download a branded summary.
- Exercise low-bandwidth, missing-media, expired, revoked, and republished states.

### Scenario H — SaaS billing in test mode

- Start Checkout, return cancelled, return without assuming success, apply a signed
  test webhook, reconcile, open Portal, and exercise configured subscription states.
- Confirm coach-package external action remains completely separate.
- If credentials or policy are not supplied, demonstrate the configuration-ready
  fail-closed journey and record the exact external dependency.

## 11. UX/UI quality bar

- Preserve the existing cream, deep-green, restrained editorial direction unless a
  superseding design decision is recorded in `DECISION_LOG.md`.
- Prioritize the golfer's current focus over navigation or historical density.
- Use progressive disclosure: beginner-simple first, advanced evidence available when
  needed.
- Prefer cards, timelines, thumbnails, comparisons, steppers, and inline previews
  where they materially reduce cognitive load; do not turn every record into a card.
- Use concrete golf-coaching language and realistic synthetic content.
- Make destructive/withdraw/revoke actions clear but visually secondary.
- Avoid walls of cautionary prose in the main flow. Keep truthful boundaries concise
  and place deeper explanation where it is useful.
- Never use colour alone to communicate phase, evidence, upload, or billing state.
- Make mobile a first-class coaching context: tap targets, bottom/sticky actions,
  horizontal navigation, media controls, tables, and charts must be intentionally
  designed rather than merely wrapped.
- Use charts only for meaningful comparisons or trends. Every chart needs an equally
  useful textual explanation.
- Do not let media or launch data overwhelm the coach-authored narrative.

## 12. Implementation discipline

1. Read `AGENTS.md`, Business Plan V2, `DECISION_LOG.md`, the current requirements
   traceability, and this brief before changing product behavior.
2. Preserve `00_source/BUSINESS_PLAN.md` unchanged.
3. Inspect the current route, repository, schema, and test patterns before introducing
   a parallel abstraction.
4. Work in vertical slices: migration/model -> repository/service -> route ->
   instructor UX -> golfer UX -> tests -> evidence.
5. Generate a new migration for schema changes; never rewrite applied migrations.
6. Keep media and launch-monitor support vendor-neutral at the core.
7. Use synthetic fixtures and media only.
8. Do not label example drills, metrics, or outcomes as validated coaching guidance.
9. Do not introduce AI as a shortcut for templates, diagnoses, summaries, or content.
10. Keep optional rich content optional; the text-first roadmap must always remain a
    valid path.
11. Re-run focused tests after each slice and the complete `npm run verify` before
    handoff.
12. Update requirements traceability and release evidence only with evidence actually
    produced. Do not relabel historical screenshots or hosted evidence as current.
13. For Sites project `appgprj_6a76957326fc819196ebf3a0c95f1ec3`, never call the
    generic Sites `get_site` operation and never generate, rotate, display, persist,
    or use a SIWC bypass bearer without Aaron's exact authorization.

## 13. Definition of 100% functional completion

The functionality-first goal is complete only when all of the following are true:

- Every P0 and P1 backlog item is implemented and meets its acceptance evidence, or
  an explicitly permitted external-activation dependency is recorded precisely.
- All eight acceptance scenarios work through the real user interfaces without direct
  database manipulation.
- Media, drill, launch-monitor, lesson, practice, evidence, review, and sharing features
  persist real synthetic state and appear correctly in the exact golfer view.
- The product remains useful when no media, launch-monitor data, or package is present.
- Instructor activation, interruption/resume, editing, and return journeys are clear
  on desktop and mobile.
- Golfer Now, roadmap, current practice, media, evidence, and next action are coherent
  on a phone.
- No required control is decorative, permanently disabled without explanation, or
  backed only by a mock response.
- There are no open P0/P1 functional defects and no known data-loss defect in a normal
  user journey.
- The existing 389 tests continue to pass, the expanded suite passes without skips or
  todos, and all migrations pass fresh-install and upgrade tests.
- Exact-final-candidate browser and visual evidence covers the required routes, states,
  content extremes, and breakpoints.
- Current documentation explains the implemented product without claiming unobserved
  demand, business outcomes, public readiness, or release acceptance.
- The final report separately states:
  - functional candidate status;
  - public production activation status;
  - owner/provider inputs still required;
  - tests and scenarios completed;
  - exact remaining functional defects, if any; and
  - why the goal is or is not eligible to be marked complete.

## 14. What this goal completion will and will not mean

Completing this brief means the product's planned functionality and experience are
implemented, integrated, polished, and verified with synthetic/test-mode evidence.

It does **not** by itself prove:

- public production release readiness;
- security/privacy/legal compliance;
- provider-log remediation;
- approved media or retention policy;
- approved pricing or commercial terms;
- a working live charge without controlled provider evidence;
- demand, activation, retention, conversion, revenue, golfer improvement, or coaching
  efficacy; or
- Aaron's acceptance of the exact release.

Those claims remain governed by the existing full-live completion audit and owner
decision records. This separation lets the next agent finish the product experience
aggressively without misrepresenting unresolved production-release facts.
