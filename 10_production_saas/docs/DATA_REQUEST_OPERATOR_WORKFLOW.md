# Data-request operator workflow

**Status:** implemented local control surface; policy-neutral and non-destructive
**Audit contract:** [Audit Event Matrix](AUDIT_EVENT_MATRIX.md)
**Security boundary:** [Security and Privacy Plan](SECURITY_PRIVACY.md)

## Purpose and current limit

The operator API supplies mechanics for reviewing account data requests without
claiming that a request was fulfilled and without deleting, exporting, or
delivering customer data. It does not determine identity-verification evidence,
legal deadlines, denial grounds, retention, backup expiry, or who is qualified
to operate the workflow.

`[OWNER INPUT REQUIRED]` Aaron must approve the exact policy, assign a privacy
lead, approve customer-facing copy and contacts, and obtain the required
Canadian privacy/legal review before real-user fulfillment or deletion is made
available. `[REAL-WORLD VALIDATION REQUIRED]` The named operator must exercise
the exact hosted identity, authorization, queue, detail, transition, audit, and
incident paths before unattended operation.

## Authorization

Every route requires both:

1. an identity forwarded by dispatch-owned Sign in with ChatGPT; local
   development fallback identity is explicitly rejected; and
2. membership in the independent privacy-operator allowlist.

The allowlist uses
`DATA_REQUEST_OPERATOR_ACCESS_PEPPER` (at least 32 characters) and
`DATA_REQUEST_OPERATOR_EMAIL_DIGESTS`, a unique comma-separated list of
HMAC-SHA-256 digests of trimmed, lowercase SIWC email addresses. Plaintext
emails are never configuration values, API fields, audit actor references, or
logs. Missing pepper/list, malformed or duplicate digests, and a short pepper
fail closed with `503`; a valid configuration that does not contain the signed-in
identity fails with `403`. The pepper is independent from instructor product
access and abuse-control secrets.

## API surface

| Method and route | Bounded behavior |
|---|---|
| `GET /api/operations/data-requests` | Returns a newest-first keyset page of active requests (default 50, maximum 100). Only exact `cursor` and `limit` query keys are accepted. Only `submitted`, `identity_verification_required`, `verified`, and `in_progress` are queued, preventing old in-progress or terminal history from hiding new work. |
| `GET /api/operations/data-requests/{requestId}` | Returns one minimal request detail plus a count-only account inventory. Existing `identity_verification_required`, `verified`, `in_progress`, `cancelled`, `denied`, `fulfilled`, and `failed` records remain available by known opaque ID as read-only history and truthfully report `statusTransitionAvailable: false`. |
| `PATCH /api/operations/data-requests/{requestId}` | Applies only the non-attesting `submitted` -> `identity_verification_required` marker using an exact expected status and `updatedAt` version. |

There is intentionally no operator `POST`, `PUT`, or `DELETE` handler. The API
does not expose requester contact hashes, account or profile emails, free-text
request details, provider/customer identifiers, export hashes, storage keys, or
record contents. Queue rows use a domain-separated SHA-256 reference derived
from the opaque account ID so records can be grouped without returning the
underlying tenant key.

Queue cursors are opaque, canonical base64url values bound to the last
`createdAt` and request ID. Duplicate or unknown query keys, non-canonical page
sizes, malformed/oversized cursors, invalid IDs, and future cursor timestamps
return `400`. The queue fixes an `asOf` boundary for each query, filters active
rows with a null tenant reference or future `createdAt`, and reports only
`excludedOrphanCount` and `excludedFutureDatedCount`. It never returns or audits
the excluded request IDs. This is non-mutating exclusion, not a claim that the
records were placed into a durable quarantine state.

The detail inventory returns counts for 29 directly account-scoped D1
collections. It reports only the count and declared bytes of private-object
references; it does not list or read R2 object keys. Global scheduler state and
HMAC-only abuse counters cannot be attributed reliably to one tenant and are
explicitly identified as excluded. Missing or malformed count results fail the
entire inventory rather than underreporting as zero. Every response says that
fulfillment and deletion are unavailable and that no destructive action was
performed.

## Review-state mechanics

The API spelling `cancelled` maps the historical database value `canceled` for
read-only detail. The only allowed review marker is deliberately limited to:

| Current | Allowed next state |
|---|---|
| `submitted` | `identity_verification_required` |

`identity_verification_required`, `verified`, `in_progress`, `cancelled`,
`denied`, `fulfilled`, and `failed` are outside the mutation surface as current
states. In particular, the API cannot attest `verified`, cannot set
`identity_verified_at`, and cannot advance a request to `in_progress`. No
transition makes a legal/policy decision, sets `fulfilled_at`,
`deletion_scheduled_at`, an export object, or an account deletion state. A
future verification, processing, denial, cancellation, fulfillment, or deletion
workflow requires owner-approved method, evidence, roles, recovery, and a
separately reviewed implementation; it cannot be enabled through configuration
alone.

Every patch requires:

- an exact JSON key set (`expectedStatus`, `expectedUpdatedAt`, `targetStatus`);
- a same-origin browser request;
- a 20-128 character safe `Idempotency-Key`; and
- the current status and millisecond `updatedAt` value from detail/queue.

The receipt ID is a deterministic SHA-256 value derived from the opaque request
ID and idempotency key. Its payload fingerprint binds the operator digest,
request, expected version, and target state. The receipt ID is separate from the
trusted HTTP `request_id`. A D1 batch couples the compare-and-swap update, audit
insert, and tenant-row guard. Same-payload retries replay the immutable result;
changed payloads conflict; only one concurrent transition can commit.

## Abuse controls

Role authorization is followed by two independent fixed-window controls before
queue audit work, count-only inventory, or transition processing begins:

| Subject | Maximum | Fixed window |
|---|---:|---:|
| Trusted client-network subject | 60 | 5 minutes |
| Authorized operator digest | 30 | 5 minutes |

The network address and first-stage operator digest are HMAC-SHA-256 protected
again with the separate abuse-control pepper, scope, and window before D1. The
counter table and audit ledger contain no raw network address or email. An
exceeded dimension returns a private, no-store `429` response with a bounded
`Retry-After` and performs no queue, inventory, or status/audit work.

## Audit and evidence boundary

Successful queue reads, detail/inventory reads, and status changes create
`data_request.operator_queue_viewed`, `data_request.operator_detail_viewed`, and
`data_request.operator_status_transitioned` events. Actor references are the
HMAC digest, and metadata remains bounded. The mutation action is enforced in
the audit-event matrix. Queue audit metadata records the page limit, returned
count, `hasMore`, query `asOf`, and safe excluded-row counts, never a cursor or
excluded request identifier.

Local tests cover configuration failure, operator denial, SIWC-only source
checks, account-control path classification, minimal output, tenant-scoped
inventory, strict keyset parsing and traversal, newest-work visibility,
orphan/future exclusion, read-only verification/in-progress/terminal detail,
dual-dimension `429` behavior, exact-key and same-origin rejection, cross-target
key separation, same-key replay, changed-payload conflict, concurrent CAS loss,
migration upgrade preservation, audit coupling, and absence of verification,
in-progress, fulfillment, or deletion effects. Passing local tests is not
hosted operator, policy, verification, or fulfillment evidence.
