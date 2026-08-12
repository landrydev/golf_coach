# Roadmap Beta 2 — Product and Experience Reset

**Status:** active product direction for `product/beta-2-experience-reset`  
**Purpose:** turn the recovered feature-rich SaaS into a low-administration coach tool and a genuinely premium golfer experience  
**Relationship to Beta 1:** Beta 1 remains preserved as functional inventory and engineering evidence. Beta 2 is not required to expose every capability with equal prominence.

## 1. Diagnosis

Beta 1 proves that the application can support a broad coaching journey, but its visible experience has two material product defects:

1. **The instructor experiences the product as administration.** Too many concepts, records, destinations, statuses, and decisions compete for attention. The product asks the coach to operate software instead of helping the coach present a clear plan.
2. **The golfer receives a functional portal rather than a premium artifact.** The current output communicates information, but it does not yet feel luxurious, emotionally resonant, editorial, or special enough to strengthen the perceived value of the coach.

The problem is not missing functionality. The problem is hierarchy, workflow, language, visual design, and progressive disclosure.

## 2. Product promise

> **Create a personal, premium development roadmap in minutes, then keep it alive with a sixty-second update after each lesson.**

Roadmap should make the coach's thinking visible without making the coach document everything.

## 3. Non-negotiable experience targets

- A qualified coach can create and publish a credible first roadmap in **five minutes or less** once their profile and package are configured.
- A coach can record the meaningful result of a lesson in **sixty seconds or less**.
- The coach is never required to understand the internal data model.
- The golfer's first view immediately answers:
  - What am I trying to achieve?
  - What is holding me back?
  - What are we working on now?
  - What comes next?
  - How will I know I am improving?
  - What should I do before the next lesson?
- The golfer experience feels like a bespoke coach-created publication, not a dashboard, CRM, report builder, or task system.
- Advanced evidence, launch data, media, templates, and lifecycle controls remain available but appear only where they strengthen the current coaching story.
- No feature receives top-level navigation merely because it exists.

## 4. The new visible product structure

### Primary navigation

The default coach navigation should contain only:

1. **Home** — the next meaningful actions across the coach's golfers.
2. **Players** — the coach's client list and each player's journey.
3. **Library** — optional reusable drills, roadmap patterns, and saved media.
4. **Settings** — coach identity, branding, packages, and account configuration.

Billing, media administration, roadmap-template administration, launch-data administration, and other operational surfaces must not compete as primary destinations.

### Player workspace

Each player has one coherent workspace with four human-readable areas:

1. **Roadmap** — the goal, starting point, current priority, phases, and package connection.
2. **Today** — the immediate practice, lesson takeaway, and next appointment/action.
3. **Progress** — selected evidence, milestones, media, measurements, and completed phase reviews.
4. **Share** — preview, publish, link status, print, and golfer response.

The coach should not need to navigate separate applications for lessons, practice, evidence, media, launch data, reviews, and sharing.

## 5. First-roadmap workflow

The creation flow should feel like a short guided conversation, not a form.

### Step 1 — The outcome

Ask only:

- What does the golfer want to achieve?
- Why does it matter now?

Provide concise examples and allow one clear sentence for each.

### Step 2 — The coach's read

Ask:

- What is the golfer doing well?
- What is the primary pattern preventing the goal?
- What should change first?

The coach can enter natural-language notes. The interface may structure them behind the scenes, but should not force the coach to classify every observation.

### Step 3 — The path

Present a three-phase roadmap by default:

1. **Build the foundation**
2. **Make it reliable**
3. **Transfer it to play**

The titles and descriptions are editable. A fourth phase is optional, not a default decision.

Each phase requires only:

- a short outcome;
- what the golfer will notice;
- how progress will be recognized.

### Step 4 — The first commitment

Allow the coach to connect an existing package or choose **No package recommendation yet**.

The product must not make the roadmap feel like a disguised sales pitch. The recommendation follows the coaching logic.

### Step 5 — Preview and publish

Show the exact golfer experience immediately. The primary actions are:

- Edit
- Publish privately
- Copy link

Advanced sharing controls remain available under a secondary menu.

## 6. Sixty-second lesson update

After a lesson, the default update asks only:

1. **What changed today?**
2. **What should the golfer practise next?**
3. **What should they pay attention to?**
4. Optional: add one photo, video, drill, or measurement.

From this one update, the product should update the golfer's **Today** view, add a timeline entry, and preserve any attached evidence.

The coach should not separately create a lesson record, evidence record, practice assignment, media attachment, launch-data association, and timeline event unless they deliberately choose advanced editing.

## 7. Phase review

A phase review should take approximately two minutes and answer:

- What improved?
- What remains inconsistent?
- Is the golfer ready to advance, continue, or pause?
- What is the next priority?

The golfer receives a polished progress chapter, not an administrative status transition.

## 8. Golfer experience

### Overall form

The golfer experience should be an editorial, vertically scrolling journey with restrained navigation. It should resemble a premium private publication created by the coach.

### Opening composition

The first screen contains:

- coach identity and understated branding;
- golfer name;
- **Your roadmap to [goal]**;
- one personal sentence explaining why the goal matters;
- the current priority;
- one calm action: **See your plan**.

### Story sequence

1. **Where you are going** — the goal and motivation.
2. **Where you are starting** — coach-written assessment with strengths first.
3. **What matters now** — one current priority, not a competing list.
4. **Your path** — a visual three-phase journey.
5. **This week** — lesson takeaway, practice, and the next check.
6. **Evidence of progress** — a curated gallery of only the strongest evidence.
7. **Your coaching plan** — package connection and next action, when relevant.
8. **A note from your coach** — a personal closing statement.

### Visual direction

- generous whitespace;
- large editorial typography;
- warm neutral surfaces;
- one coach accent colour;
- restrained borders and shadows;
- no dense tables or dashboard grids on the golfer side;
- no implementation terminology;
- motion only where it reinforces sequence or progress;
- media presented as intentional editorial moments rather than file attachments;
- measurements translated into meaning before values are shown.

## 9. Existing-feature disposition

| Existing capability | Beta 2 treatment |
|---|---|
| Coach profile and branding | Keep; simplify setup and make branding immediately visible |
| Packages | Keep; configure in Settings and connect contextually during roadmap creation |
| Golfer directory | Keep; redesign around recent and next meaningful action |
| Guided roadmap authoring | Replace with the five-step conversational flow |
| Three/four phases | Keep; default to three, make four optional |
| Lessons | Keep behind the sixty-second update and advanced history |
| Practice assignments | Keep; create primarily from the lesson update |
| Drill library | Keep inside Library and contextual pickers |
| Evidence | Keep; curate automatically from lesson updates and attachments |
| Phase reviews | Keep; simplify to a short guided reflection |
| Timeline | Keep; generate from meaningful activity rather than requiring separate administration |
| Media | Keep; expose through contextual upload and Library, not as mandatory administration |
| Launch-monitor data | Keep; make it optional evidence attached to a player/lesson, not a separate product centre |
| CSV import | Keep as an advanced option within evidence/measurement attachment |
| Comparisons | Keep; show coach-selected meaning first and values second |
| Share centre | Keep; simplify the default to preview, publish, copy, and revoke |
| QR and print | Keep under secondary share actions |
| Golfer responses | Keep; make the response invitation calm and unobtrusive |
| Billing | Remove from primary navigation during product evaluation |
| Operational/security states | Preserve in the system; expose only when the coach must act |

## 10. Home experience

The coach home page should answer **What deserves my attention?**

Show no more than three sections:

1. **Continue where you left off** — one dominant resume action.
2. **Players needing attention** — maximum five, with a plain-language reason.
3. **Recent progress** — recent golfer milestones and responses.

Do not lead with counts, system status, feature promotion, or operational readiness.

## 11. Language principles

Prefer:

- Player
- Roadmap
- Current priority
- This week
- Progress
- Coach's note
- Next step

Avoid visible terms such as:

- workspace revision;
- evidence item;
- launch session;
- mutation recovery;
- publication revision;
- content lifecycle;
- assignment replacement;
- readiness state;
- capability exchange.

The underlying engineering may retain precise language internally.

## 12. Implementation strategy

1. Preserve the existing backend, routes, migrations, tests, and advanced feature capability.
2. Build a new experience shell and information hierarchy.
3. Build the new golfer experience first because it defines the product's standard of quality.
4. Build the five-step roadmap creation flow against existing domain capabilities.
5. Build the sixty-second lesson update and derive downstream records from it.
6. Consolidate the player workspace.
7. Simplify home and primary navigation.
8. Move advanced capabilities behind contextual actions and progressive disclosure.
9. Add new visual-regression and task-completion tests around the simplified journeys.
10. Package Beta 2 as a separate local experience for owner evaluation.

## 13. Beta 2 acceptance criteria

Beta 2 is ready for owner evaluation when:

- a synthetic coach can create and publish a complete roadmap through the new flow;
- the visible default workflow contains no unnecessary domain/admin decisions;
- a lesson update can be completed from one compact surface;
- the player workspace presents one coherent journey;
- all existing rich capabilities remain reachable contextually or through advanced controls;
- the golfer experience feels intentionally designed at mobile and desktop sizes;
- the golfer can identify the goal, current priority, current phase, practice, evidence, and next action without explanation;
- browser review passes at 320, 390, 768, and 1440 pixels;
- the original Beta 1 and recovered source remain preserved.

## 14. Product test

Every visible element must pass at least one of these tests:

1. Does it help the coach create the roadmap faster?
2. Does it help the golfer understand the plan?
3. Does it make progress visible or believable?
4. Does it strengthen the next coaching decision?
5. Does it reduce uncertainty or administration?

If not, it should be removed, hidden, combined, or deferred.
