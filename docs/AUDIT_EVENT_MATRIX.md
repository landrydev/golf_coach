# Production mutation route audit-event matrix

This is the first-party completeness contract for production HTTP mutation routes. A listed action is the privacy-safe `audit_events.action` written when the corresponding durable business transition commits successfully; conditional actions are emitted only when that transition occurs. The matrix is enforced by `tests/audit-event-matrix.test.mjs`, which discovers route methods, checks producer wiring, and requires every mapped action literal to remain in its named production source.

Authenticated routes may additionally emit the cross-cutting identity actions `account.created`, `account.activated`, or `identity.mapping_updated` while reconciling the trusted Sites identity. Those actions describe identity/account lifecycle, not the route-specific business mutation, so they are not repeated in every row.

`[TRANSPORT-ONLY]` marks state that deliberately has no first-party audit event because it only authenticates, serializes, retries, deduplicates, or cleans up transport and does not assert a new product, payment, access, or entitlement outcome. `[IDEMPOTENT NO-OP]` marks a successful response that committed no new state and therefore must not create a duplicate event.

## Enforced route matrix

<!-- AUDIT_EVENT_MATRIX_START -->
| Method | Route | Route producer marker(s) | Expected success audit action(s) | Audit source(s) | Deliberate no-new-audit behavior |
|---|---|---|---|---|---|
| `POST` | `/api/billing/checkout` | `expireStrandedCheckoutReservation`<br>`expireCheckoutAttemptAfterProviderConfirmation`<br>`markCheckoutAttemptCompletedPendingSync`<br>`finalizeCheckoutAttemptOpen` | `billing.checkout_reservation_expired`<br>`billing.checkout_session_expired`<br>`billing.checkout_completion_pending_sync`<br>`billing.checkout_session_created` | `lib/checkout-repository.ts` | `[TRANSPORT-ONLY]` Provider-call reservation, account-operation leases, bounded retry/error fields, and reuse of an already-audited open session are concurrency/transport state. They create no charge or entitlement and add no audit row. |
| `POST` | `/api/billing/portal` | `recordHostedBillingSession` | `billing.portal_session_created` | `lib/billing-repository.ts` | — |
| `POST` | `/api/billing/reconcile` | `reconcileBillingAccount` | `billing.checkout_session_expired`<br>`billing.checkout_completion_pending_sync`<br>`billing.reconciliation_checked`<br>`billing.subscription_reconciled` | `lib/checkout-repository.ts`<br>`lib/billing-repository.ts` | — |
| `POST` | `/api/billing/webhook` | `applyStripeSubscriptionEvent` | `billing.subscription_synced` | `lib/billing-repository.ts` | `[TRANSPORT-ONLY]` Signed receipt, processing lease, duplicate acknowledgement, and ignored/non-actionable disposition stay in `billing_events`. Without a subscription projection they add no second audit row. Processing failure is separately recorded as `billing.webhook_failed`. |
| `POST` | `/api/data-export` | `createInstructorDataExport` | `data_export.generated`<br>`data_request.submitted` | `lib/data-export.ts` | `[IDEMPOTENT NO-OP]` An oversized workspace creates one open manual-fulfilment request; a retry returns that request without a duplicate submission event. |
| `POST` | `/api/data-requests` | `createAccountDataRequest` | `data_request.submitted` | `lib/repository.ts` | `[IDEMPOTENT NO-OP]` A matching still-open request returns the existing request and emits no duplicate submission event. |
| `POST` | `/api/golfers` | `createGolferWorkspace` | `golfer_workspace.created` | `lib/repository.ts` | `[IDEMPOTENT NO-OP]` A replay of the same idempotency key returns the original workspace and audit receipt. |
| `POST` | `/api/golfers/staged` | `createStagedGolferWorkspace` | `golfer_workspace.staged` | `lib/repository.ts` | `[IDEMPOTENT NO-OP]` A replay of the same idempotency key returns the original staged workspace and audit receipt. |
| `DELETE` | `/api/golfers/[golferId]` | `archiveGolfer` | `golfer.archived` | `lib/golfer-lifecycle.ts` | — |
| `PUT` | `/api/golfers/[golferId]` | `updateGolferIdentity` | `golfer.identity_updated` | `lib/golfer-lifecycle.ts` | — |
| `POST` | `/api/golfers/[golferId]/complete` | `completeStagedGolferWorkspace` | `golfer_workspace.authoring_completed` | `lib/repository.ts` | `[IDEMPOTENT NO-OP]` A replay of the same idempotency key returns the original completion and audit receipt. |
| `POST` | `/api/packages` | `createCoachingPackage` | `coaching_package.created` | `lib/repository.ts` | `[IDEMPOTENT NO-OP]` A replay of the same idempotency key returns the original package and audit receipt. |
| `DELETE` | `/api/packages/[packageId]` | `archiveCoachingPackage` | `coaching_package.archived` | `lib/repository.ts` | — |
| `PUT` | `/api/packages/[packageId]` | `updateCoachingPackage` | `coaching_package.updated` | `lib/repository.ts` | — |
| `PUT` | `/api/plans/[planId]` | `editCorePlan` | `plan.core_edited` | `lib/plan-editor.ts` | — |
| `DELETE` | `/api/plans/[planId]/content` | `withdrawPlanContent` | `lesson.archive`<br>`practice.retire`<br>`evidence.withdraw` | `lib/plan-content.ts` | — |
| `POST` | `/api/plans/[planId]/content` | `addCompletedLesson`<br>`addPracticeItem`<br>`addEvidenceItem`<br>`addPhaseReview` | `lesson.create`<br>`practice.create`<br>`practice.retire`<br>`evidence.create`<br>`phase_review.transition` | `lib/plan-content.ts` | `practice.retire` is conditional: a replacement emits exactly one event for each active practice item actually retired; an initial practice emits none. Stale, retried, or concurrent losing revisions commit neither content nor audit events. |
| `POST` | `/api/plans/[planId]/publish` | `publishPlanAndCreateShare` | `plan.publish_and_share` | `lib/plans.ts` | — |
| `PUT` | `/api/profile` | `saveProfile` | `profile.saved` | `lib/repository.ts` | — |
| `DELETE` | `/api/shares/[shareId]` | `revokeShareLink` | `share.revoke` | `lib/plans.ts` | `[IDEMPOTENT NO-OP]` An already inactive link changes no state and emits no duplicate revocation event. |
| `POST` | `/r/response` | `recordGolferResponse` | `golfer.response_recorded` | `lib/plans.ts` | — |
| `DELETE` | `/r/session` | `endShareSession` | `share.session_ended` | `lib/plans.ts` | `[TRANSPORT-ONLY]` Clearing the browser cookie when no live server session exists is client transport cleanup with no durable target to audit. |
| `POST` | `/r/session` | `endShareSession`<br>`createShareSession` | `share.session_ended`<br>`share.session_created`<br>`share.access` | `lib/plans.ts` | The end event is conditional on replacing a live prior session; every successful new exchange emits the create and access events atomically. |
<!-- AUDIT_EVENT_MATRIX_END -->

## Boundary

The matrix covers exported `POST`, `PUT`, `PATCH`, and `DELETE` handlers under `app/**/route.ts`. Read-only handlers, scheduled recovery work, D1 leases, rate-limit counters, and provider receipt bookkeeping are outside the route/method inventory. That exclusion does not permit a durable business transition to hide as transport state: provider-confirmed Checkout expiry and completion-pending-sync are explicitly audited above without storing customer email, hosted URLs, provider session IDs, payloads, or payment details.

Practice replacement retirement events target the retired practice item and carry only a stable reason, a relationship label, and the opaque replacement practice-item ID. They share the replacement request ID and occurrence timestamp with the corresponding `practice.create` event. The audit insert, retirement update, replacement insert, revision fence, publication invalidation, and creation audit commit in one D1 batch, so a counted retirement cannot survive a rolled-back or stale replacement.
