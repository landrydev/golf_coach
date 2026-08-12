import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  accounts,
  auditEvents,
  consentRecords,
  developmentPlans,
  golfers,
  shareLinks,
  shareSessions,
} from "@/db/schema";
import { RequestError } from "@/lib/http";

export const CONSENT_PURPOSES = [
  "terms",
  "privacy_notice",
  "golfer_record",
  "roadmap_sharing",
  "media_use",
  "service_email",
  "optional_analytics",
] as const;

export const CONSENT_RECORD_STATUSES = [
  "granted",
  "declined",
  "withdrawn",
  "expired",
] as const;

export const CONSENT_SUBJECT_TYPES = ["account", "golfer"] as const;

export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];
export type ConsentRecordStatus = (typeof CONSENT_RECORD_STATUSES)[number];
export type ConsentSubjectType = (typeof CONSENT_SUBJECT_TYPES)[number];

export type ConsentSubject = Readonly<{
  type: ConsentSubjectType;
  golferId: string | null;
}>;

export type ConsentPolicyEntry = Readonly<{
  version: string;
  purposeDescription: string;
  subjectTypes: readonly ConsentSubjectType[];
}>;

export type ConsentPolicyRegistry =
  | Readonly<{
      state: "ready";
      entries: Readonly<Partial<Record<ConsentPurpose, ConsentPolicyEntry>>>;
    }>
  | Readonly<{
      state: "missing" | "invalid";
      entries: Readonly<Record<string, never>>;
    }>;

export type ConsentRecordView = Readonly<{
  id: string;
  purpose: ConsentPurpose;
  status: ConsentRecordStatus;
  policyVersion: string;
  purposeDescription: string;
  captureMethod:
    | "self_service"
    | "instructor_attested"
    | "support_assisted"
    | "imported";
  grantedAt: number | null;
  declinedAt: number | null;
  withdrawnAt: number | null;
  expiresAt: number | null;
  createdAt: number;
}>;

export type ConsentCurrentState = Readonly<{
  purpose: ConsentPurpose;
  policy: Readonly<{
    configured: boolean;
    version: string | null;
    purposeDescription: string | null;
  }>;
  currentRecord: ConsentRecordView | null;
  effectiveGranted: boolean;
  withdrawalAvailable: boolean;
}>;

export type ConsentGrantRequirement = Readonly<{
  subject: ConsentSubject;
  purpose: ConsentPurpose;
  policyVersion: string;
  purposeDescription: string;
}>;

export type RecordConsentTransitionInput = Readonly<{
  accountId: string;
  action: "grant" | "withdraw";
  purpose: ConsentPurpose;
  policyVersion: string;
  subject: ConsentSubject;
  expectedCurrentRecordId: string | null;
  evidenceReference: string | null;
  idempotencyKey: string;
  requestId: string;
  registry: ConsentPolicyRegistry;
}>;

export type RecordConsentTransitionResult = Readonly<{
  record: ConsentRecordView;
  replayed: boolean;
}>;

const MAX_POLICY_REGISTRY_BYTES = 16 * 1024;
const MAX_POLICY_DESCRIPTION_CHARACTERS = 500;
const SAFE_VERSION = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;

/**
 * Parses owner-supplied versioned purpose text without selecting a legal basis,
 * drafting policy language, or enabling any processing. One malformed entry
 * invalidates the complete registry so callers cannot operate on a partial or
 * ambiguously parsed policy set.
 */
export function parseConsentPolicyRegistry(
  raw = process.env.CONSENT_POLICY_REGISTRY_JSON,
): ConsentPolicyRegistry {
  if (!raw?.trim()) return { state: "missing", entries: {} };
  if (new TextEncoder().encode(raw).byteLength > MAX_POLICY_REGISTRY_BYTES) {
    return { state: "invalid", entries: {} };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { state: "invalid", entries: {} };
  }
  if (!isPlainObject(parsed)) return { state: "invalid", entries: {} };

  const entries: Partial<Record<ConsentPurpose, ConsentPolicyEntry>> = {};
  for (const [purpose, value] of Object.entries(parsed)) {
    if (!isConsentPurpose(purpose) || !isPlainObject(value)) {
      return { state: "invalid", entries: {} };
    }
    if (!hasExactlyKeys(value, ["version", "purposeDescription", "subjectTypes"])) {
      return { state: "invalid", entries: {} };
    }
    if (typeof value.version !== "string" || !SAFE_VERSION.test(value.version)) {
      return { state: "invalid", entries: {} };
    }
    if (
      typeof value.purposeDescription !== "string" ||
      value.purposeDescription !== value.purposeDescription.trim() ||
      value.purposeDescription.length < 1 ||
      value.purposeDescription.length > MAX_POLICY_DESCRIPTION_CHARACTERS ||
      /[\u0000-\u001f\u007f]/u.test(value.purposeDescription)
    ) {
      return { state: "invalid", entries: {} };
    }
    if (
      !Array.isArray(value.subjectTypes) ||
      value.subjectTypes.length < 1 ||
      value.subjectTypes.length > CONSENT_SUBJECT_TYPES.length ||
      value.subjectTypes.some((subject) => !isConsentSubjectType(subject)) ||
      new Set(value.subjectTypes).size !== value.subjectTypes.length
    ) {
      return { state: "invalid", entries: {} };
    }
    entries[purpose] = {
      version: value.version,
      purposeDescription: value.purposeDescription,
      subjectTypes: [...value.subjectTypes],
    };
  }

  return { state: "ready", entries };
}

/**
 * Reports only whether the owner-supplied registry contains the two policies
 * required by the bounded V1 product. It intentionally does not expose policy
 * text or versions and does not supply defaults for either purpose.
 */
export function requiredConsentPolicyConfigurationReady(
  raw: string | undefined,
): boolean {
  const registry = parseConsentPolicyRegistry(raw);
  return (
    registry.state === "ready" &&
    registry.entries.golfer_record?.subjectTypes.includes("account") === true &&
    registry.entries.roadmap_sharing?.subjectTypes.includes("golfer") === true
  );
}

export async function assertConsentSubjectOwned(
  accountId: string,
  subject: ConsentSubject,
): Promise<void> {
  if (subject.type === "account") {
    if (subject.golferId !== null) throw invalidConsentSubject();
    return;
  }
  if (!subject.golferId) throw invalidConsentSubject();

  const [owned] = await getDb()
    .select({ id: golfers.id })
    .from(golfers)
    .where(
      and(
        eq(golfers.accountId, accountId),
        eq(golfers.id, subject.golferId),
      ),
    )
    .limit(1);
  if (!owned) {
    throw new RequestError(
      404,
      "consent_subject_not_found",
      "The consent subject was not found.",
    );
  }
}

export async function listConsentCurrentState(
  accountId: string,
  subject: ConsentSubject,
  registry = parseConsentPolicyRegistry(),
): Promise<ConsentCurrentState[]> {
  await assertConsentSubjectOwned(accountId, subject);
  const records = await Promise.all(
    CONSENT_PURPOSES.map((purpose) =>
      getCurrentConsentRecord(accountId, subject, purpose),
    ),
  );
  const now = Date.now();

  return CONSENT_PURPOSES.map((purpose, index) => {
    const currentRecord = records[index];
    const entry = policyEntryForSubject(registry, purpose, subject.type);
    return {
      purpose,
      policy: {
        configured: Boolean(entry),
        version: entry?.version ?? null,
        purposeDescription: entry?.purposeDescription ?? null,
      },
      currentRecord: currentRecord ? view(currentRecord) : null,
      effectiveGranted: isEffectiveGrant(currentRecord, entry, now),
      // Withdrawal remains available for a persisted unexpired grant even if
      // configuration is later removed or superseded. This is intentionally
      // broader than effective processing authorization.
      withdrawalAvailable: Boolean(
        currentRecord?.status === "granted" &&
          (!currentRecord.expiresAt || currentRecord.expiresAt.getTime() > now),
      ),
    };
  });
}

/**
 * This is the only helper optional processing should use. Historical rows do
 * not authorize processing when registry configuration is missing, malformed,
 * inapplicable to the subject, stale, withdrawn, declined, or expired.
 */
export async function hasCurrentConsentGrant(
  accountId: string,
  subject: ConsentSubject,
  purpose: ConsentPurpose,
  registry = parseConsentPolicyRegistry(),
  now = Date.now(),
): Promise<boolean> {
  await assertConsentSubjectOwned(accountId, subject);
  const entry = policyEntryForSubject(registry, purpose, subject.type);
  if (!entry) return false;
  return isEffectiveGrant(
    await getCurrentConsentRecord(accountId, subject, purpose),
    entry,
    now,
  );
}

export function configuredConsentGrantRequirement(
  subject: ConsentSubject,
  purpose: ConsentPurpose,
  registry = parseConsentPolicyRegistry(),
): ConsentGrantRequirement {
  const entry = policyEntryForSubject(registry, purpose, subject.type);
  if (!entry) {
    throw new RequestError(
      503,
      "consent_policy_unavailable",
      "The current consent policy is unavailable for this purpose.",
    );
  }
  return {
    subject,
    purpose,
    policyVersion: entry.version,
    purposeDescription: entry.purposeDescription,
  };
}

export async function requireCurrentConsentGrant(
  accountId: string,
  subject: ConsentSubject,
  purpose: ConsentPurpose,
  registry = parseConsentPolicyRegistry(),
): Promise<ConsentGrantRequirement> {
  const requirement = configuredConsentGrantRequirement(subject, purpose, registry);
  await assertConsentSubjectOwned(accountId, subject);
  const current = await getCurrentConsentRecord(accountId, subject, purpose);
  const entry = policyEntryForSubject(registry, purpose, subject.type);
  if (!isEffectiveGrant(current, entry, Date.now())) {
    throw new RequestError(
      409,
      "current_consent_required",
      "A current configured authorization is required for this action.",
    );
  }
  return requirement;
}

export async function consentGrantRequirementsCurrent(
  accountId: string,
  requirements: readonly ConsentGrantRequirement[],
  now = Date.now(),
): Promise<boolean> {
  if (requirements.length < 1) return false;
  const records = await Promise.all(
    requirements.map(async (requirement) => {
      await assertConsentSubjectOwned(accountId, requirement.subject);
      return getCurrentConsentRecord(
        accountId,
        requirement.subject,
        requirement.purpose,
      );
    }),
  );
  return requirements.every((requirement, index) =>
    isEffectiveGrant(
      records[index],
      {
        version: requirement.policyVersion,
        purposeDescription: requirement.purposeDescription,
        subjectTypes: [requirement.subject.type],
      },
      now,
    ),
  );
}

/**
 * Serializes a sensitive D1 mutation with consent withdrawal on the account
 * row. The NOT NULL account email is a rollback sentinel: if any configured
 * current grant is absent, stale, corrupt, withdrawn, or expired, the complete
 * batch aborts rather than committing a partial mutation. Expiry is evaluated
 * by SQLite inside that batch, so a caller-side preflight timestamp cannot
 * extend processing past the recorded expiry boundary.
 */
export function consentGrantTransactionGuard(
  accountId: string,
  requirements: readonly ConsentGrantRequirement[],
) {
  const allCurrent = currentConsentGrantsCondition(accountId, requirements);
  return getDb()
    .update(accounts)
    .set({
      normalizedEmail: sql<string>`case when ${allCurrent}
        then ${accounts.normalizedEmail} else null end`,
    })
    .where(eq(accounts.id, accountId));
}

/**
 * Returns the database-clock predicate used by both transactional mutation
 * guards and final disclosure-edge capability checks. Keeping this predicate
 * shared prevents a public read from weakening the exact current-record,
 * policy-text, expiry, or contradictory-timestamp semantics used for writes.
 */
export function currentConsentGrantsCondition(
  accountId: string,
  requirements: readonly ConsentGrantRequirement[],
) {
  if (requirements.length < 1) {
    throw new Error("At least one consent grant requirement is required.");
  }
  return sql.join(
    requirements.map((requirement) =>
      currentConsentGrantCondition(accountId, requirement),
    ),
    sql` and `,
  );
}

export async function recordConsentTransition(
  input: RecordConsentTransitionInput,
): Promise<RecordConsentTransitionResult> {
  await assertConsentSubjectOwned(input.accountId, input.subject);
  const inputFingerprint = await sha256Hex(
    JSON.stringify([
      "consent-transition-v1",
      input.action,
      input.purpose,
      input.policyVersion,
      input.subject.type,
      input.subject.golferId,
      input.expectedCurrentRecordId,
      input.evidenceReference,
    ]),
  );
  const receiptId = await sha256Hex(
    `consent-audit-receipt-v1\u0000${input.accountId}\u0000${input.idempotencyKey}`,
  );
  const recordId = await sha256Hex(
    `consent-record-receipt-v1\u0000${input.accountId}\u0000${input.idempotencyKey}`,
  );

  const replay = await replayReceipt(
    input.accountId,
    receiptId,
    inputFingerprint,
  );
  if (replay) return replay;

  const current = await getCurrentConsentRecord(
    input.accountId,
    input.subject,
    input.purpose,
  );
  const transition = resolveTransition(input, current);
  // IDs are deterministic hashes, so they cannot break a timestamp tie in
  // transition order. Keep the append timestamp strictly above its observed
  // predecessor even when two actions occur within one wall-clock millisecond
  // or the runtime clock trails a previously imported record.
  const now = new Date(
    Math.max(Date.now(), (current?.createdAt.getTime() ?? -1) + 1),
  );
  const db = getDb();
  const currentIdSubquery = currentConsentIdSubquery(
    input.accountId,
    input.subject,
    input.purpose,
  );
  const currentVersionMatches = input.expectedCurrentRecordId === null
    ? sql`not exists (${currentIdSubquery})`
    : sql`${input.expectedCurrentRecordId} = (${currentIdSubquery})`;
  const subjectOwnership = input.subject.type === "account"
    ? sql`1 = 1`
    : sql`exists (
        select 1 from ${golfers}
        where ${golfers.accountId} = ${input.accountId}
          and ${golfers.id} = ${input.subject.golferId}
      )`;

  // D1 batches are transactional. Setting the tenant's existing normalized
  // email to itself serializes transitions on the tenant row; a failed CAS
  // resolves to NULL, violates the NOT NULL constraint, and rolls back the
  // consent and audit inserts together.
  const transitionGuard = db
    .update(accounts)
    .set({
      normalizedEmail: sql<string>`case
        when ${subjectOwnership} and ${currentVersionMatches}
        then ${accounts.normalizedEmail}
        else null
      end`,
    })
    .where(eq(accounts.id, input.accountId));

  const insertRecord = db.insert(consentRecords).values({
    id: recordId,
    accountId: input.accountId,
    golferId: input.subject.golferId,
    subjectType: input.subject.type,
    scope: input.purpose,
    status: transition.status,
    policyVersion: transition.policyVersion,
    purposeDescription: transition.purposeDescription,
    captureMethod:
      input.subject.type === "account" ? "self_service" : "instructor_attested",
    evidenceReference: input.evidenceReference,
    recordedByAccountId: input.accountId,
    grantedAt: transition.status === "granted" ? now : null,
    declinedAt: null,
    withdrawnAt: transition.status === "withdrawn" ? now : null,
    expiresAt: null,
    createdAt: now,
  });
  const insertAudit = db.insert(auditEvents).values({
    id: receiptId,
    accountId: input.accountId,
    actorType: "account",
    actorAccountId: input.accountId,
    action: transition.auditAction,
    targetType: "consent_record",
    targetId: recordId,
    outcome: "success",
    requestId: input.requestId,
    // Fingerprint only: do not copy policy text, evidence references,
    // idempotency keys, account identity, or golfer identifiers into audit.
    metadata: { inputFingerprint },
    occurredAt: now,
  });
  const consentRevocations = withdrawalRevocationStatements(input, now);

  try {
    await db.batch([
      transitionGuard,
      ...consentRevocations,
      insertRecord,
      insertAudit,
    ]);
  } catch (error) {
    const racedReplay = await replayReceipt(
      input.accountId,
      receiptId,
      inputFingerprint,
    );
    if (racedReplay) return racedReplay;
    await throwCurrentStateConflict(input);
    throw error;
  }

  const saved = await getConsentRecordById(input.accountId, recordId);
  if (!saved) throw new Error("The consent transition could not be loaded.");
  return { record: view(saved), replayed: false };
}

function resolveTransition(
  input: RecordConsentTransitionInput,
  current: ConsentRow | null,
): Readonly<{
  status: "granted" | "withdrawn";
  policyVersion: string;
  purposeDescription: string;
  auditAction: "consent.granted" | "consent.replaced" | "consent.withdrawn";
}> {
  if (input.action === "grant") {
    const entry = policyEntryForSubject(
      input.registry,
      input.purpose,
      input.subject.type,
    );
    if (!entry) {
      throw new RequestError(
        503,
        "consent_policy_unavailable",
        "The current consent policy is unavailable for this purpose.",
      );
    }
    if (input.policyVersion !== entry.version) {
      throw new RequestError(
        409,
        "stale_consent_policy",
        "The consent policy changed. Refresh before recording a choice.",
      );
    }
    if (isEffectiveGrant(current, entry, Date.now())) {
      throw new RequestError(
        409,
        "consent_already_current",
        "A current grant is already recorded for this purpose.",
      );
    }
    assertExpectedCurrentRecord(input.expectedCurrentRecordId, current);
    return {
      status: "granted",
      policyVersion: entry.version,
      purposeDescription: entry.purposeDescription,
      auditAction: current ? "consent.replaced" : "consent.granted",
    };
  }

  assertExpectedCurrentRecord(input.expectedCurrentRecordId, current);
  if (!current || current.status !== "granted") {
    throw new RequestError(
      409,
      "consent_not_granted",
      "There is no current grant to withdraw for this purpose.",
    );
  }
  if (current.expiresAt && current.expiresAt.getTime() <= Date.now()) {
    throw new RequestError(
      409,
      "consent_not_granted",
      "There is no current grant to withdraw for this purpose.",
    );
  }
  if (input.policyVersion !== current.policyVersion) {
    throw new RequestError(
      409,
      "stale_consent_policy",
      "The consent policy changed. Refresh before recording a choice.",
    );
  }
  return {
    status: "withdrawn",
    policyVersion: current.policyVersion,
    purposeDescription: current.purposeDescription,
    auditAction: "consent.withdrawn",
  };
}

async function throwCurrentStateConflict(
  input: RecordConsentTransitionInput,
): Promise<never> {
  const current = await getCurrentConsentRecord(
    input.accountId,
    input.subject,
    input.purpose,
  );
  if (current?.id !== input.expectedCurrentRecordId) {
    throw new RequestError(
      409,
      "stale_consent_state",
      "The consent state changed. Refresh before recording a choice.",
    );
  }
  throw new Error("The consent transition could not be committed.");
}

function assertExpectedCurrentRecord(
  expectedCurrentRecordId: string | null,
  current: ConsentRow | null,
): void {
  if ((current?.id ?? null) !== expectedCurrentRecordId) {
    throw new RequestError(
      409,
      "stale_consent_state",
      "The consent state changed. Refresh before recording a choice.",
    );
  }
}

async function replayReceipt(
  accountId: string,
  receiptId: string,
  inputFingerprint: string,
): Promise<RecordConsentTransitionResult | null> {
  const [receipt] = await getDb()
    .select({ targetId: auditEvents.targetId, metadata: auditEvents.metadata })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.id, receiptId),
        eq(auditEvents.accountId, accountId),
        eq(auditEvents.targetType, "consent_record"),
        eq(auditEvents.outcome, "success"),
      ),
    )
    .limit(1);
  if (!receipt) return null;
  if (
    receipt.metadata?.inputFingerprint !== inputFingerprint ||
    typeof receipt.targetId !== "string"
  ) {
    throw new RequestError(
      409,
      "idempotency_key_reused",
      "This Idempotency-Key was already used for a different consent transition.",
    );
  }

  const record = await getConsentRecordById(accountId, receipt.targetId);
  if (!record) throw new Error("The consent receipt target is unavailable.");
  return { record: view(record), replayed: true };
}

function currentConsentIdSubquery(
  accountId: string,
  subject: ConsentSubject,
  purpose: ConsentPurpose,
) {
  const subjectMatch = subject.golferId === null
    ? sql`${consentRecords.golferId} is null`
    : sql`${consentRecords.golferId} = ${subject.golferId}`;
  return sql`
    select ${consentRecords.id}
    from ${consentRecords}
    where ${consentRecords.accountId} = ${accountId}
      and ${consentRecords.subjectType} = ${subject.type}
      and ${consentRecords.scope} = ${purpose}
      and ${subjectMatch}
    order by ${consentRecords.createdAt} desc, ${consentRecords.id} desc
    limit 1
  `;
}

function currentConsentGrantCondition(
  accountId: string,
  requirement: ConsentGrantRequirement,
) {
  const currentId = currentConsentIdSubquery(
    accountId,
    requirement.subject,
    requirement.purpose,
  );
  return sql`exists (
    select 1 from ${consentRecords}
    where ${consentRecords.accountId} = ${accountId}
      and ${consentRecords.id} = (${currentId})
      and ${consentRecords.status} = 'granted'
      and ${consentRecords.policyVersion} = ${requirement.policyVersion}
      and ${consentRecords.purposeDescription} = ${requirement.purposeDescription}
      and ${consentRecords.grantedAt} is not null
      and ${consentRecords.grantedAt} <= ${consentRecords.createdAt}
      and ${consentRecords.declinedAt} is null
      and ${consentRecords.withdrawnAt} is null
      and (
        ${consentRecords.expiresAt} is null
        or (
          ${consentRecords.expiresAt} >
            cast((julianday('now') - 2440587.5) * 86400000 as integer)
          and ${consentRecords.expiresAt} > ${consentRecords.grantedAt}
        )
      )
  )`;
}

function withdrawalRevocationStatements(
  input: RecordConsentTransitionInput,
  now: Date,
) {
  if (
    input.action !== "withdraw" ||
    (input.purpose !== "roadmap_sharing" && input.purpose !== "golfer_record")
  ) {
    return [];
  }

  const db = getDb();
  const linkIsAffected = input.subject.type === "account"
    ? sql`${shareLinks.accountId} = ${input.accountId}`
    : sql`${shareLinks.accountId} = ${input.accountId} and exists (
        select 1 from ${developmentPlans}
        where ${developmentPlans.accountId} = ${shareLinks.accountId}
          and ${developmentPlans.id} = ${shareLinks.planId}
          and ${developmentPlans.golferId} = ${input.subject.golferId}
      )`;
  const sessionIsAffected = input.subject.type === "account"
    ? sql`${shareSessions.accountId} = ${input.accountId}`
    : sql`${shareSessions.accountId} = ${input.accountId} and exists (
        select 1 from ${shareLinks}
        join ${developmentPlans}
          on ${developmentPlans.accountId} = ${shareLinks.accountId}
         and ${developmentPlans.id} = ${shareLinks.planId}
        where ${shareLinks.accountId} = ${shareSessions.accountId}
          and ${shareLinks.id} = ${shareSessions.shareLinkId}
          and ${developmentPlans.golferId} = ${input.subject.golferId}
      )`;
  const reason = input.purpose === "roadmap_sharing"
    ? "roadmap sharing authorization withdrawn"
    : "golfer record authorization withdrawn";

  return [
    db
      .update(shareSessions)
      .set({ revokedAt: now, revokeReason: reason, updatedAt: now })
      .where(sql`${sessionIsAffected} and ${shareSessions.revokedAt} is null`),
    db
      .update(shareLinks)
      .set({
        status: "revoked" as const,
        revokedAt: now,
        revokeReason: reason,
        updatedAt: now,
      })
      .where(sql`${linkIsAffected} and ${shareLinks.status} = 'active'`),
  ];
}

async function getCurrentConsentRecord(
  accountId: string,
  subject: ConsentSubject,
  purpose: ConsentPurpose,
): Promise<ConsentRow | null> {
  const [record] = await getDb()
    .select()
    .from(consentRecords)
    .where(
      and(
        eq(consentRecords.accountId, accountId),
        eq(consentRecords.subjectType, subject.type),
        eq(consentRecords.scope, purpose),
        subject.golferId === null
          ? isNull(consentRecords.golferId)
          : eq(consentRecords.golferId, subject.golferId),
      ),
    )
    .orderBy(desc(consentRecords.createdAt), desc(consentRecords.id))
    .limit(1);
  return record ?? null;
}

async function getConsentRecordById(
  accountId: string,
  recordId: string,
): Promise<ConsentRow | null> {
  const [record] = await getDb()
    .select()
    .from(consentRecords)
    .where(
      and(
        eq(consentRecords.accountId, accountId),
        eq(consentRecords.id, recordId),
      ),
    )
    .limit(1);
  return record ?? null;
}

function policyEntryForSubject(
  registry: ConsentPolicyRegistry,
  purpose: ConsentPurpose,
  subjectType: ConsentSubjectType,
): ConsentPolicyEntry | null {
  if (registry.state !== "ready") return null;
  const entry = registry.entries[purpose];
  return entry?.subjectTypes.includes(subjectType) ? entry : null;
}

function isEffectiveGrant(
  record: ConsentRow | null,
  entry: ConsentPolicyEntry | null,
  now: number,
): boolean {
  return Boolean(
    record &&
      entry &&
      record.status === "granted" &&
      record.policyVersion === entry.version &&
      record.purposeDescription === entry.purposeDescription &&
      record.grantedAt !== null &&
      record.grantedAt.getTime() <= record.createdAt.getTime() &&
      record.declinedAt === null &&
      record.withdrawnAt === null &&
      (!record.expiresAt ||
        (record.expiresAt.getTime() > now &&
          record.expiresAt.getTime() > record.grantedAt.getTime())),
  );
}

function view(record: ConsentRow): ConsentRecordView {
  return {
    id: record.id,
    purpose: record.scope,
    status: record.status,
    policyVersion: record.policyVersion,
    purposeDescription: record.purposeDescription,
    captureMethod: record.captureMethod,
    grantedAt: record.grantedAt?.getTime() ?? null,
    declinedAt: record.declinedAt?.getTime() ?? null,
    withdrawnAt: record.withdrawnAt?.getTime() ?? null,
    expiresAt: record.expiresAt?.getTime() ?? null,
    createdAt: record.createdAt.getTime(),
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactlyKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

export function isConsentPurpose(value: unknown): value is ConsentPurpose {
  return typeof value === "string" && (CONSENT_PURPOSES as readonly string[]).includes(value);
}

export function isConsentSubjectType(value: unknown): value is ConsentSubjectType {
  return (
    typeof value === "string" &&
    (CONSENT_SUBJECT_TYPES as readonly string[]).includes(value)
  );
}

function invalidConsentSubject(): RequestError {
  return new RequestError(
    400,
    "invalid_consent_subject",
    "The consent subject is invalid.",
  );
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

type ConsentRow = typeof consentRecords.$inferSelect;
