---
target: event creation flow / when the seat plan is decided
total_score: 20
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 3
timestamp: 2026-09-17T03-51-54Z
slug: src-components-events-event-form-tsx
---
Method: dual-agent (A: design review · B: detector + mechanical evidence)

## Answer to the question asked

Deferring the seat **plan** out of event creation is correct. Deferring the seat **question** is a sequencing failure. And the flow is worse than that: **it never delivers the organiser to the screen that asks it.**

`event-form.tsx:127` redirects a newly created event to `/events/{id}/edit`. `ticket-form.tsx:142` redirects a newly created tier to `/`. The seating offer lives only on `/events/{id}` (`event-manager.tsx:221-223`), and no automatic transition in the flow ever lands there. An organiser can create an event and three tiers without the product mentioning seating once.

So the collapsed one-line offer, good disclosure, right copy, is mounted on a page the flow routes around. Two redirect lines are the highest-leverage fix in this report.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Per-action status is strong (dirty chip, upload counters, busy spinners), but four async calls in the seating panel have no pending state at all, and the event's setup state is never summarised. |
| 2 | Match System / Real World | 4 | Best dimension in the product. Brazilian ticketing taxonomy, CEP-first address entry, `odd_even` numbering for old houses, Decreto 5.296/2004 cited by article. |
| 3 | User Control and Freedom | 1 | The one irreversible action has no confirmation; "Cancelar" on the create form is a bare `<Link>` and no `beforeunload` guard exists anywhere in `src/`. |
| 4 | Consistency and Standards | 2 | "Local" labels three unrelated data sources; the same destination is "Novo lote" and "Novo ingresso"; `ConfirmDialog`'s default `cancelLabel` ships hardcoded Portuguese to en/de/es. |
| 5 | Error Prevention | 2 | Draft-by-default and published-plans-only are good guards. But "Cancelado" is offered as a status on a brand-new event, and the one-way bind has no second gate. |
| 6 | Recognition Rather Than Recall | 2 | The irreversible choice is made from `{name} · v{version}` alone: no seat count, no sectors, no date. "A plan must be published first" is said once, in 12px grey. |
| 7 | Flexibility and Efficiency | 2 | No duplicate-event, no template, no "same plan as last time". The global "Criar evento" button renders only `{!isOrganizer && ...}`, so the heaviest user is the one without it. |
| 8 | Aesthetic and Minimalist Design | 3 | The collapsed seating line is exemplary. Against it: six same-size buttons in the manager header with no primary once published, and 11px type carrying the irreversibility warning. |
| 9 | Error Recovery | 1 | Five async actions discard their error and render an empty state, so "couldn't load your venues" reads as "you haven't drawn a venue yet". `Field` computes `aria-describedby` ids and never binds them; errors have no `role="alert"`. The most consequential operation has the vaguest message: "Não foi possível concluir." |
| 10 | Help and Documentation | 1 | Nothing explains the seating model. `nav.layouts` is the bare noun "Plantas" with no description while every sibling context has one. No onboarding, no checklist. |
| **Total** | | **20/40** | **Acceptable, significant improvements needed** |

Two adjustments from Assessment A's own scoring, both downward, both on B's evidence: status 3→2 (four unindicated async calls) and recovery 2→1 (five discarded errors rendering as false empty states).

## Design Specificity Verdict

**Authored at the sentence. Category-interchangeable at the journey.**

Evidence it was written by people who sell tickets in Brazil: `EVENT_CATEGORIES` includes `pride`, `religiao_espiritualidade`, `stand_up_comedy`; CEP → address → pin with a debounced lookup that fills blanks and never overwrites typed text; `UF` clamped to two uppercase characters with `CE` as the placeholder; placeholders reading `Arena Castelão` and `Av. Alberto Craveiro, 2901`; `numbering.odd_even` hinted "Casas antigas: ímpares de um lado do corredor central, pares do outro"; compliance citing Decreto 5.296/2004 art. 23 with the shortfall computed live and liability stated.

Evidence of interchangeable admin UI, all structural: the create form is the canonical left-label CRUD shape; naming a venue and naming a plan are `window.prompt()` in a product that otherwise owns every pixel of its chrome; and the *route*, create → edit form → list → manage → global catalogue → back to manage, is what a scaffold produces when every screen is written well and nobody owns the path between them.

The product knows an extraordinary amount about Brazilian ticketing and almost nothing about the order in which a Brazilian organiser does the work.

**Deterministic scan.** `detect.mjs --json` over `src/components/events`, `src/components/seating`, `src/app/[locale]/(app)/events` and `src/app/[locale]/(app)/venues`: **exit 0, zero findings**, identical with `--scope layout,type`. The mechanical design-pattern detector is clean; every finding below is outside what it inspects. Its one correctly-rejected false positive: `field.tsx:26`'s `focus-visible:outline-none` looks like a removed focus ring but is compensated by `FIELD_CHROME` in `elevated-input.tsx:175-181`.

**Visual overlays.** None. No browser automation is exposed in this session and starting a dev server is prohibited in this project, so no user-visible overlay exists and none was faked.

## Overall Impression

Every individual screen in this flow is better than the flow. The copy is the best thing in the product: `eventSeating.closed` pre-answers the seating question for the majority instead of making them learn a concept to dismiss it, and `layoutStudio.fields.rowsNumbered` explains a machine rule in one plain sentence. Then the routing throws all of it away: the seating question sits on a page nothing navigates to, opting in with no venue empties the organiser's hands, and the single irreversible act in the product is the only consequential one without a confirmation dialog.

The biggest opportunity is one field. If the event record knew *how it sells*, by quantity or by seat, the create form could ask one binary question with no id and no tiers required, and the redirect, the tier form and the seating panel could all branch on an answer instead of a guess.

## What's Working

1. **The collapsed seating question.** It asks in the organiser's own terms, "Este evento vende lugares numerados? Fila e poltrona, como um teatro ou uma arena", and pre-answers it for the majority: "Se for ingresso comum, não precisa de nada aqui." One line of page for a feature most events never use, and nobody has to learn a concept to dismiss it.
2. **Sold / held / available as one capacity bar**, with revenue defined as paid-only. It refuses to flatter: a hold looks exactly like a sale in every naive dashboard, and this one separates them in colour, in three counts, and in the revenue definition, with the reason in the hint. An operator can act on it on the night without arithmetic.
3. **The accessibility compliance panel.** Names the decree and article, states the shortfall as a countable, offers to fix it with its algorithm stated, and still says whose responsibility it is. That is the difference between a compliance warning and a compliance feature.

## Priority Issues

**[P0] The flow never routes to the page that asks the seating question.**
`event-form.tsx:127` → `/events/{id}/edit`; `ticket-form.tsx:142` → `/`. The seating offer exists only on `/events/{id}`. A first-timer with a theatre booking sells unnumbered tickets because nothing told them otherwise, and finds out from a buyer. The event list is already deliberate about going to the manager instead of the edit form and says so in a comment; the create form contradicts its own codebase.
**Fix:** `router.push(\`/events/${saved.id}\`)` on create, and return the tier form to `/events/{eventId}` when it was opened from an event context, the query param is already there. Zero design cost, puts the question in front of every new organiser twice.
**Suggested command:** `/impeccable onboard`

**[P0] The only irreversible action is the only consequential one without a confirmation.**
`event-seating-panel.tsx:326-333` is a plain `<Button>`. `ConfirmDialog` exists, describes itself as "the single confirmation modal for destructive and other consequential actions", and is used for *cancelling a tier*, which is less permanent, since existing orders stay valid. The warning paragraph sits below the button, unwired to it, and is `text-muted-foreground` when everything is valid and `text-warning-ink` only when pricing is missing: the recoverable problem is styled louder than the permanent one.
**Fix:** Wrap the bind in `ConfirmDialog`, `tone="danger"`, and make the description *enumerate the commit*: "640 lugares em 4 setores. Plateia → Inteira. Balcão → Meia. Mesas → não vendidas. Depois disto a planta desta noite não pode ser trocada." Move `oneWay` out of 11px grey into that dialog and invert the warning colour. Also worth deciding: permit unbind while `sold + reserved === 0`, since the copy's own justification is what *could* happen, not what has.
**Suggested command:** `/impeccable harden`

**[P1] Five async actions discard their errors and render a false empty state.**
`event-manager.tsx:75` drops `page.error` and shows "this event has no tiers yet". `event-seating-panel.tsx:83-87`, `:96-100`, `:110-118` and `:128-140` each drop an error and render "you haven't drawn a venue yet", "this venue has no published plan", or a 300px empty room. A failure is indistinguishable from an absence, and the absence copy is confident.
**Fix:** Branch on `result.error` in each, surface a retry, and give `listLayouts`/`fetchLayout` a pending state, three of the four have none.
**Suggested command:** `/impeccable harden`

**[P1] "Local" is two unrelated entities under one label, one click apart.**
The event's `location.venue` is free text labelled "Local"; the seating system has a real `Venue` entity, also labelled "Local", created by `window.prompt`. The organiser types "Teatro José de Alencar" into the event form, then picks a "Local" from a list that has never heard of it, and names the same building twice.
**Fix:** Make the create form's Local a combobox over real venues with inline creation: the interaction `AddressSearch` already proves the team can build. The event then carries `venueId`, the seating panel's venue select disappears entirely (one fewer decision at the irreversible step), and address, pin and plan hang off one object.
**Suggested command:** `/impeccable shape`

**[P1] Opting in with no venue or no published plan discards the intent.**
`event-seating-panel.tsx:225-239` renders a sentence and a link to `/venues`, carrying nothing. The builder then says "Escolha um local e uma planta" with zero of either, `sr-only` select labels, and a 14px `+` opening `window.prompt`. This is the highest-intent second in the journey, they just said yes, and the product answers it by emptying their hands.
**Fix:** Pass the intent through as `/venues?for={eventId}`; render a real first-run state when there are no venues; show a persistent "Voltar para {event.name}" while `for` is set; after Publicar, offer "Usar esta planta em {event.name}" and return. Also give the `needsTier` branch the "Criar lote" link it currently lacks.
**Suggested command:** `/impeccable onboard`

**[P2] The dependency chain is never drawn, and the create form never admits seating exists.**
venue → plan → publish plan → event → tiers → bind is six steps; the flow surfaces four, five and half of six. `/venues` is referenced from exactly two places in the codebase. The manager already computes every fact needed to say where the organiser stands, `tiers.length`, `totals.onSale`, `bound`, `event.status`, and spends them on three unrelated prose notices in three places.
**Fix:** One binary question on the create form ("Ingresso comum, por quantidade" / "Lugar marcado, fila e poltrona") stored on the event, the only seating decision a create form *can* make without an id or tiers. Then replace the three scattered notices with one "Para vender" step line: lote → lugares (se houver) → publicar, current step marked.
**Suggested command:** `/impeccable shape`

**[P2] Create-form specifics.** Field order and grouping are sound; four concrete faults. **Situação does not belong on a create form**: every new event is a draft by design, and "Cancelado" lets an organiser create an event that is born dead and can never be published. **Six required fields are unmarked** (name, category, venue, city, uf, startsAt); the form is `noValidate`, has no `required`/`aria-required` anywhere, and requiredness is discoverable only by submitting and failing, while `common.optional` exists and the sibling tier form uses it. **Sixteen ungrouped categories** in a flat native select. **"Salvar" is a filing verb for an act of creation**, and "Cancelar" is an unguarded `<Link>` that discards a filled form silently.
**Suggested command:** `/impeccable clarify`

## Persona Red Flags

**Jordan (confused first-timer)**, breaks at the `/venues` handoff: dropped into a full-bleed canvas told to "escolha um local e uma planta" while both selects are empty placeholders with `sr-only` labels and the only way forward is an unlabelled 14px `+` opening `window.prompt`. Will never connect **"Plantas"**, a bare noun under Bilheteria with no description, while every sibling context has one, to a seat map. After Publicar, gets a toast and no idea that publishing was the gate.

**Alex (impatient power user)**, breaks at `event-form.tsx:127`. Creating event #18: Salvar → dumped on the edit form → back → Eventos → Gerenciar → Novo lote → dumped on `/` → navigate back. **Four unnecessary navigations per event, every event.** The global "Criar evento" button renders only `{!isOrganizer && ...}`, so the person who creates the most events is the only one without it. And the bind re-asks venue, plan and every sector price for the same room they used last month.

**Riley (deliberate stress tester)**, three breaks in five minutes. Fills the create form, clicks **Cancelar**: everything gone, no prompt, no `beforeunload` anywhere in `src/`. Sets Situação = **"Cancelado"** on a new event and creates an unrecoverable record with the publish toggle permanently disabled. Opens the event in two tabs and binds in one: the other still offers the bind, because `bound` is computed once on mount from a stale aggregate with no refetch, and the second click surfaces as "Não foi possível concluir."

## Minor Observations

- **`Field` computes `aria-describedby` ids and never binds them.** `ui/field.tsx:42-43` builds `hintId`/`errorId`, puts them on the `<p>` elements, and never wires the control, because `Field` renders `children` opaquely and never clones them. Every hint and error in the event form, the tier form and the seating panel is unassociated for a screen reader, and the error `<p>` has no `role="alert"` or `aria-live`.
- **Hardcoded Portuguese reaches en/de/es.** `event-manager.tsx:399` renders `ConfirmDialog` without `cancelLabel`, so the default `"Cancelar"` at `confirm-dialog.tsx:77` ships to every locale. Also `{name} · v{version}`, the `v` prefix is untranslated.
- **The cancel-tier confirm dialog always closes as success.** `moveTier` never throws, it toasts and returns, so `confirm-dialog.tsx:104-108`'s "stay open so the user can retry" branch is unreachable.
- **Three interactive elements have no focus indicator**: the transparent `<select>` in `catalogue-filters.tsx:205` whose chip wrapper has no `focus-within:` (zero `focus-within` matches in either directory), the "load more" button in `event-combobox.tsx:232`, and the seat `<g onClick>` in `builder-nodes.tsx:258` which is not focusable at all: marking a seat in the builder is unreachable by keyboard.
- **Responsive is clean.** Every fixed dimension in the three files is a `max-w`, a percentage clamped to 0–100, or gated behind `lg:`. No overflow risk at 390px. No `md:` or `xl:` anywhere in the three, though.
- `staged-media.tsx:241`: an `sr-only` file input with no accessible name, still in the accessibility tree and tab-focusable.
- The event form borrows the **tickets** namespace for its media copy, so the event's image ceiling is literally `MAX_MEDIA_PER_TICKET`.
- `eventSeating.goToStudio` = "Abrir plantas e assentos", a label matching no destination name in the product.
- `RoomPreview` renders `seats={[]}` at `min-h-[300px]` before any plan loads, a 300px empty box on first open.
- Two page-header idioms: the create form hand-rolls an `h1` and back button inside the `<form>`; the manager uses `DashboardPageHeader`.
- `layoutStudio.layout.frozenExplained` explains freezing only after it has happened; nothing warns before Publicar that a published plan bound to an event becomes unchangeable.
- i18n parity is intact: `eventSeating` and `layoutStudio` are fully present in en/de/es, and the Spanish is correctly Rioplatense-neutral.

## Questions to Consider

1. **Why is "numbered seats or general admission" a property of the *bind* rather than of the *event*?** `EventSummary` has twelve fields and not one says what kind of event this is commercially. If it did, the create form could ask one binary question with no id and no tiers required, and the redirect, the tier form and the seating panel could all branch on an answer instead of a guess.
2. **Why does an event have a free-text venue at all, when the product owns a `Venue` entity?** Collapsing them would delete an entire decision from the irreversible step and end the "Local means two things" confusion permanently.
3. **Is a lote the right unit for a seated event?** Today the organiser invents tiers in the abstract and maps them onto sectors afterwards. Reversing it, draw the room, then generate one tier per sector, would make the chain produce its own next step instead of asking the organiser to hold six steps in their head.
4. **Should the bind be irreversible before the first seat is held?** The copy's own justification is that seats "passam a **poder** ser reservados", what could happen, not what has. Permitting unbind while `sold + reserved === 0` would turn the scariest button in the product into an ordinary one for the overwhelming majority of cases.
