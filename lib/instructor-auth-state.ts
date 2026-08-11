import {
  INSTRUCTOR_SESSION_COOKIE,
  OIDC_TRANSACTION_COOKIE,
  safeInstructorReturnPath,
  type OidcInstructorAuthConfiguration,
} from "./instructor-auth-contract.ts";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const LOGIN_TRANSACTION_LIFETIME_MS = 10 * 60 * 1_000;
const RETAIN_CONSUMED_TRANSACTION_MS = 24 * 60 * 60 * 1_000;
const RETAIN_EXPIRED_SESSION_MS = 30 * 24 * 60 * 60 * 1_000;
export const MAX_ACTIVE_INSTRUCTOR_SESSIONS = 10;
const SESSION_LIMIT_REVOKE_REASON = "concurrent_session_limit";
const SESSION_ROTATION_REVOKE_REASON = "same_browser_session_rotation";
const OIDC_STATE_HASH_ALGORITHM = "hmac-sha256-oidc-state-v1";
const TRANSACTION_PAYLOAD_ALGORITHM = "aes-256-gcm-v1";
const SESSION_HASH_ALGORITHM = "hmac-sha256-instructor-session-v1";
const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const PKCE_VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;

type D1Executor = Pick<D1Database, "prepare" | "batch">;

export type OidcLoginTransaction = Readonly<{
  pkceVerifier: string;
  nonce: string;
  returnTo: string;
}>;

export type VerifiedOidcIdentityClaims = Readonly<{
  issuer: string;
  subject: string;
  email: string;
}>;

export type TrustedInstructorIdentity = Readonly<{
  accountId: string;
  sessionId: string;
  email: string;
  displayName: string;
  source: "oidc";
}>;

export type CreatedInstructorSession = Readonly<{
  kind: "created";
  identity: TrustedInstructorIdentity;
  token: string;
  expiresAt: number;
}>;

export type InstructorSessionCreationResult =
  | CreatedInstructorSession
  | Readonly<{ kind: "identity_link_required" }>
  | Readonly<{ kind: "account_unavailable" }>;

type AccountRow = {
  id: string;
  authProvider: string;
  authIssuer: string | null;
  authSubject: string;
  identityVersion: number;
  primaryEmail: string;
  normalizedEmail: string;
  status: string;
};

type SessionRow = AccountRow & {
  sessionId: string;
  sessionIdentityVersion: number;
  expiresAt: number;
  revokedAt: number | null;
};

export class InstructorAuthStateError extends Error {
  readonly code:
    | "invalid_identity_claims"
    | "invalid_login_transaction"
    | "invalid_session_configuration";

  constructor(code: InstructorAuthStateError["code"], message: string) {
    super(message);
    this.name = "InstructorAuthStateError";
    this.code = code;
  }
}

export function randomOpaqueAuthValue(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return encodeBase64Url(bytes);
}

export function readUniqueAuthCookie(
  request: Request,
  name: typeof INSTRUCTOR_SESSION_COOKIE | typeof OIDC_TRANSACTION_COOKIE,
): string | null {
  const raw = request.headers.get("cookie");
  if (!raw || raw.length > 8_192) return null;
  const values: string[] = [];
  for (const part of raw.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    values.push(part.slice(separator + 1).trim());
  }
  if (
    values.length !== 1 ||
    !SESSION_TOKEN_PATTERN.test(values[0])
  ) {
    return null;
  }
  return values[0];
}

export function serializeAuthCookie(
  name: typeof INSTRUCTOR_SESSION_COOKIE | typeof OIDC_TRANSACTION_COOKIE,
  value: string,
  lifetimeSeconds: number,
  now = Date.now(),
): string {
  if (
    !SESSION_TOKEN_PATTERN.test(value) ||
    !Number.isSafeInteger(lifetimeSeconds) ||
    lifetimeSeconds < 1 ||
    lifetimeSeconds > 86_400 ||
    !Number.isSafeInteger(now)
  ) {
    throw new InstructorAuthStateError(
      "invalid_session_configuration",
      "The authentication cookie configuration is invalid.",
    );
  }
  return [
    `${name}=${value}`,
    `Max-Age=${lifetimeSeconds}`,
    `Expires=${new Date(now + lifetimeSeconds * 1_000).toUTCString()}`,
    "Path=/",
    "Secure",
    "HttpOnly",
    "SameSite=Lax",
  ].join("; ");
}

export function clearAuthCookie(
  name: typeof INSTRUCTOR_SESSION_COOKIE | typeof OIDC_TRANSACTION_COOKIE,
): string {
  return `${name}=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; Secure; HttpOnly; SameSite=Lax`;
}

export async function createOidcLoginTransaction(input: {
  database: D1Database;
  configuration: OidcInstructorAuthConfiguration;
  state: string;
  pkceVerifier: string;
  nonce: string;
  returnTo: string;
  now?: number;
}): Promise<Readonly<{ expiresAt: number }>> {
  const now = exactTime(input.now);
  assertTransactionValue(input.state, "state");
  assertTransactionValue(input.nonce, "nonce");
  if (!PKCE_VERIFIER_PATTERN.test(input.pkceVerifier)) {
    throw invalidTransaction();
  }
  const returnTo = safeInstructorReturnPath(input.returnTo);
  if (returnTo !== input.returnTo) throw invalidTransaction();

  const stateHash = await authHmacHex(
    input.configuration.sessionPepper,
    "oidc-login-state",
    input.state,
  );
  const sealed = await sealTransactionPayload(
    { pkceVerifier: input.pkceVerifier, nonce: input.nonce, returnTo },
    stateHash,
    input.configuration.transactionEncryptionKey,
  );
  const expiresAt = now + LOGIN_TRANSACTION_LIFETIME_MS;
  await input.database.batch([
    input.database
      .prepare(
        `delete from oidc_login_transactions
          where expires_at <= ? or consumed_at <= ?`,
      )
      .bind(now - RETAIN_CONSUMED_TRANSACTION_MS, now - RETAIN_CONSUMED_TRANSACTION_MS),
    input.database
      .prepare(
        `insert into oidc_login_transactions (
           state_hash, state_hash_algorithm, sealed_payload, payload_iv,
           payload_algorithm, expires_at, consumed_at, created_at, updated_at
         ) values (?, ?, ?, ?, ?, ?, null, ?, ?)`,
      )
      .bind(
        stateHash,
        OIDC_STATE_HASH_ALGORITHM,
        sealed.ciphertext,
        sealed.iv,
        TRANSACTION_PAYLOAD_ALGORITHM,
        expiresAt,
        now,
        now,
      ),
  ]);
  return Object.freeze({ expiresAt });
}

export async function consumeOidcLoginTransaction(input: {
  database: D1Database;
  configuration: OidcInstructorAuthConfiguration;
  state: string;
  now?: number;
}): Promise<OidcLoginTransaction | null> {
  const now = exactTime(input.now);
  if (!SESSION_TOKEN_PATTERN.test(input.state)) return null;
  const stateHash = await authHmacHex(
    input.configuration.sessionPepper,
    "oidc-login-state",
    input.state,
  );
  const database = primaryDatabase(input.database);
  const row = await database
    .prepare(
      `update oidc_login_transactions
          set consumed_at = ?, updated_at = ?
        where state_hash = ?
          and state_hash_algorithm = ?
          and payload_algorithm = ?
          and consumed_at is null
          and expires_at > ?
      returning sealed_payload as sealedPayload, payload_iv as payloadIv`,
    )
    .bind(
      now,
      now,
      stateHash,
      OIDC_STATE_HASH_ALGORITHM,
      TRANSACTION_PAYLOAD_ALGORITHM,
      now,
    )
    .first<{ sealedPayload: string; payloadIv: string }>();
  if (!row) return null;
  try {
    return await openTransactionPayload(
      row.sealedPayload,
      row.payloadIv,
      stateHash,
      input.configuration.transactionEncryptionKey,
    );
  } catch {
    throw invalidTransaction();
  }
}

export async function createInstructorSessionForOidcIdentity(input: {
  database: D1Database;
  configuration: OidcInstructorAuthConfiguration;
  claims: VerifiedOidcIdentityClaims;
  requestId?: string | null;
  replacedSessionToken?: string | null;
  now?: number;
}): Promise<InstructorSessionCreationResult> {
  const now = exactTime(input.now);
  const claims = validateIdentityClaims(input.claims, input.configuration);
  const database = primaryDatabase(input.database);
  const existing = await findOidcAccount(
    database,
    claims.issuer,
    claims.subject,
  );
  if (existing) {
    if (existing.status !== "active") {
      return Object.freeze({ kind: "account_unavailable" });
    }
    return createSessionForAccount({
      database: input.database,
      configuration: input.configuration,
      account: existing,
      requestId: safeRequestId(input.requestId),
      replacedSessionToken: input.replacedSessionToken ?? null,
      now,
      accountCreated: false,
    });
  }

  const emailOwner = await findAccountByNormalizedEmail(
    database,
    claims.normalizedEmail,
  );
  if (emailOwner) {
    return Object.freeze({ kind: "identity_link_required" });
  }

  const account: AccountRow = {
    id: crypto.randomUUID(),
    authProvider: "oidc",
    authIssuer: claims.issuer,
    authSubject: claims.subject,
    identityVersion: 1,
    primaryEmail: claims.email,
    normalizedEmail: claims.normalizedEmail,
    status: "active",
  };
  try {
    return await createSessionForAccount({
      database: input.database,
      configuration: input.configuration,
      account,
      requestId: safeRequestId(input.requestId),
      replacedSessionToken: input.replacedSessionToken ?? null,
      now,
      accountCreated: true,
    });
  } catch (error) {
    // A concurrent callback can win either identity or email uniqueness. Only
    // the exact stable issuer+subject may be reused; email never links it.
    const racedIdentity = await findOidcAccount(
      primaryDatabase(input.database),
      claims.issuer,
      claims.subject,
    );
    if (racedIdentity) {
      if (racedIdentity.status !== "active") {
        return Object.freeze({ kind: "account_unavailable" });
      }
      return createSessionForAccount({
        database: input.database,
        configuration: input.configuration,
        account: racedIdentity,
        requestId: safeRequestId(input.requestId),
        replacedSessionToken: input.replacedSessionToken ?? null,
        now,
        accountCreated: false,
      });
    }
    if (
      await findAccountByNormalizedEmail(
        primaryDatabase(input.database),
        claims.normalizedEmail,
      )
    ) {
      return Object.freeze({ kind: "identity_link_required" });
    }
    throw error;
  }
}

export async function validateInstructorSession(input: {
  database: D1Database;
  configuration: OidcInstructorAuthConfiguration;
  token: string;
  now?: number;
}): Promise<TrustedInstructorIdentity | null> {
  const now = exactTime(input.now);
  if (!SESSION_TOKEN_PATTERN.test(input.token)) return null;
  const tokenHash = await authHmacHex(
    input.configuration.sessionPepper,
    "instructor-session",
    input.token,
  );
  const row = await primaryDatabase(input.database)
    .prepare(
      `select s.id as sessionId,
              s.identity_version as sessionIdentityVersion,
              s.expires_at as expiresAt,
              s.revoked_at as revokedAt,
              a.id as id,
              a.auth_provider as authProvider,
              a.auth_issuer as authIssuer,
              a.auth_subject as authSubject,
              a.identity_version as identityVersion,
              a.primary_email as primaryEmail,
              a.normalized_email as normalizedEmail,
              a.status as status
         from instructor_sessions s
         join accounts a on a.id = s.account_id
        where s.token_hash = ? and s.token_hash_algorithm = ?
        limit 1`,
    )
    .bind(tokenHash, SESSION_HASH_ALGORITHM)
    .first<SessionRow>();
  if (
    !row ||
    row.revokedAt !== null ||
    !Number.isSafeInteger(row.expiresAt) ||
    row.expiresAt <= now ||
    row.sessionIdentityVersion !== row.identityVersion ||
    row.status !== "active" ||
    row.authProvider !== "oidc" ||
    row.authIssuer !== input.configuration.issuer ||
    !validSubject(row.authSubject) ||
    normalizeEmail(row.primaryEmail) !== row.normalizedEmail
  ) {
    return null;
  }
  return trustedIdentity(row, row.sessionId);
}

export async function revokeInstructorSession(input: {
  database: D1Database;
  configuration: OidcInstructorAuthConfiguration;
  token: string;
  reason?: "user_logout" | "security_revocation";
  requestId?: string | null;
  now?: number;
}): Promise<boolean> {
  const now = exactTime(input.now);
  if (!SESSION_TOKEN_PATTERN.test(input.token)) return false;
  const tokenHash = await authHmacHex(
    input.configuration.sessionPepper,
    "instructor-session",
    input.token,
  );
  const reason = input.reason ?? "user_logout";
  const results = await input.database.batch([
    input.database
    .prepare(
      `update instructor_sessions
          set revoked_at = ?, revoke_reason = ?, updated_at = ?
        where token_hash = ? and token_hash_algorithm = ? and revoked_at is null`,
    )
    .bind(
      now,
      reason,
      now,
      tokenHash,
      SESSION_HASH_ALGORITHM,
    ),
    input.database
      .prepare(
        `insert into audit_events (
           id, account_id, actor_type, actor_account_id, action, target_type,
           target_id, outcome, request_id, metadata, occurred_at
         )
         select ?, s.account_id, 'account', s.account_id,
                'account.signed_out', 'instructor_session', s.id,
                'success', ?, ?, ?
           from instructor_sessions s
          where s.token_hash = ? and s.token_hash_algorithm = ?
            and s.revoked_at = ? and s.revoke_reason = ?
            and not exists (
              select 1 from audit_events e
               where e.action = 'account.signed_out'
                 and e.target_type = 'instructor_session'
                 and e.target_id = s.id
            )`,
      )
      .bind(
        crypto.randomUUID(),
        safeRequestId(input.requestId),
        JSON.stringify({ identityProvider: "oidc" }),
        now,
        tokenHash,
        SESSION_HASH_ALGORITHM,
        now,
        reason,
      ),
  ]);
  return Number(results[0]?.meta.changes) === 1;
}

export async function cleanupInstructorAuthState(input: {
  database: D1Database;
  now?: number;
}): Promise<Readonly<{ transactionsDeleted: number; sessionsDeleted: number }>> {
  const now = exactTime(input.now);
  const retentionCutoff = Math.max(0, now - RETAIN_CONSUMED_TRANSACTION_MS);
  const sessionCutoff = Math.max(0, now - RETAIN_EXPIRED_SESSION_MS);
  const results = await input.database.batch([
    input.database
      .prepare(
        `delete from oidc_login_transactions
          where expires_at <= ? or consumed_at <= ?`,
      )
      .bind(retentionCutoff, retentionCutoff),
    input.database
      .prepare("delete from instructor_sessions where expires_at <= ?")
      .bind(sessionCutoff),
  ]);
  return Object.freeze({
    transactionsDeleted: Number(results[0]?.meta.changes ?? 0),
    sessionsDeleted: Number(results[1]?.meta.changes ?? 0),
  });
}

async function createSessionForAccount(input: {
  database: D1Database;
  configuration: OidcInstructorAuthConfiguration;
  account: AccountRow;
  requestId: string | null;
  replacedSessionToken: string | null;
  now: number;
  accountCreated: boolean;
}): Promise<
  CreatedInstructorSession | Readonly<{ kind: "account_unavailable" }>
> {
  const token = randomOpaqueAuthValue();
  const tokenHash = await authHmacHex(
    input.configuration.sessionPepper,
    "instructor-session",
    token,
  );
  const sessionId = crypto.randomUUID();
  const expiresAt =
    input.now + input.configuration.sessionLifetimeSeconds * 1_000;
  const hasReplacedSession = SESSION_TOKEN_PATTERN.test(
    input.replacedSessionToken ?? "",
  );
  const replacedTokenHash = hasReplacedSession
    ? await authHmacHex(
        input.configuration.sessionPepper,
        "instructor-session",
        input.replacedSessionToken ?? "",
      )
    : tokenHash;
  const rotateStatement = input.database
    .prepare(
      `update instructor_sessions
          set revoked_at = ?, revoke_reason = ?, updated_at = ?
        where ? = 1 and token_hash = ? and token_hash_algorithm = ?
          and revoked_at is null
          and exists (
            select 1 from instructor_sessions
             where id = ? and account_id = ?
          )`,
    )
    .bind(
      input.now,
      SESSION_ROTATION_REVOKE_REASON,
      input.now,
      hasReplacedSession ? 1 : 0,
      replacedTokenHash,
      SESSION_HASH_ALGORITHM,
      sessionId,
      input.account.id,
    );
  const capStatement = input.database
    .prepare(
      `update instructor_sessions
          set revoked_at = ?, revoke_reason = ?, updated_at = ?
        where account_id = ? and revoked_at is null and expires_at > ?
          and id <> ?
          and exists (
            select 1 from instructor_sessions
             where id = ? and account_id = ?
          )
          and id in (
            select id from instructor_sessions
             where account_id = ? and revoked_at is null and expires_at > ?
               and id <> ?
             order by created_at desc, id desc
             limit -1 offset ?
          )`,
    )
    .bind(
      input.now,
      SESSION_LIMIT_REVOKE_REASON,
      input.now,
      input.account.id,
      input.now,
      sessionId,
      sessionId,
      input.account.id,
      input.account.id,
      input.now,
      sessionId,
      MAX_ACTIVE_INSTRUCTOR_SESSIONS - 1,
    );
  const sessionStatement = input.database
    .prepare(
      `insert into instructor_sessions (
         id, account_id, identity_version, token_hash, token_hash_algorithm,
         authenticated_at, expires_at, revoked_at, revoke_reason,
         created_at, updated_at
       )
       select ?, a.id, a.identity_version, ?, ?, ?, ?, null, null, ?, ?
         from accounts a
        where a.id = ? and a.auth_provider = 'oidc'
          and a.auth_issuer = ? and a.auth_subject = ?
          and a.identity_version = ? and a.status = 'active'`,
    )
    .bind(
      sessionId,
      tokenHash,
      SESSION_HASH_ALGORITHM,
      input.now,
      expiresAt,
      input.now,
      input.now,
      input.account.id,
      input.account.authIssuer,
      input.account.authSubject,
      input.account.identityVersion,
    );
  const auditStatement = input.database
    .prepare(
      `insert into audit_events (
         id, account_id, actor_type, actor_account_id, action, target_type,
         target_id, outcome, request_id, metadata, occurred_at
       )
       select ?, ?, 'account', ?, ?, 'account', ?, 'success', ?, ?, ?
        where exists (
          select 1 from instructor_sessions
           where id = ? and account_id = ?
        )`,
    )
    .bind(
      crypto.randomUUID(),
      input.account.id,
      input.account.id,
      input.accountCreated ? "account.created" : "account.signed_in",
      input.account.id,
      input.requestId,
      JSON.stringify({ identityProvider: "oidc" }),
      input.now,
      sessionId,
      input.account.id,
    );
  const cleanupStatement = input.database
    .prepare(
      `delete from instructor_sessions
        where expires_at <= ?`,
    )
    .bind(input.now - RETAIN_EXPIRED_SESSION_MS);

  if (input.accountCreated) {
    const results = await input.database.batch([
      input.database
        .prepare(
          `insert into accounts (
             id, auth_provider, auth_issuer, auth_subject, identity_version,
             primary_email, normalized_email, email_verified_at, status,
             last_signed_in_at, created_at, updated_at
           ) values (?, 'oidc', ?, ?, 1, ?, ?, ?, 'active', ?, ?, ?)`,
        )
        .bind(
          input.account.id,
          input.account.authIssuer,
          input.account.authSubject,
          input.account.primaryEmail,
          input.account.normalizedEmail,
          input.now,
          input.now,
          input.now,
          input.now,
        ),
      sessionStatement,
      rotateStatement,
      capStatement,
      auditStatement,
      cleanupStatement,
    ]);
    if (Number(results[1]?.meta.changes) !== 1) {
      return Object.freeze({ kind: "account_unavailable" });
    }
  } else {
    const results = await input.database.batch([
      input.database
        .prepare(
          `update accounts
              set last_signed_in_at = ?, updated_at = ?
            where id = ? and auth_provider = 'oidc'
              and auth_issuer = ? and auth_subject = ?
              and identity_version = ? and status = 'active'`,
        )
        .bind(
          input.now,
          input.now,
          input.account.id,
          input.account.authIssuer,
          input.account.authSubject,
          input.account.identityVersion,
        ),
      sessionStatement,
      rotateStatement,
      capStatement,
      auditStatement,
      cleanupStatement,
    ]);
    if (
      Number(results[0]?.meta.changes) !== 1 ||
      Number(results[1]?.meta.changes) !== 1
    ) {
      return Object.freeze({ kind: "account_unavailable" });
    }
  }
  return Object.freeze({
    kind: "created",
    token,
    expiresAt,
    identity: trustedIdentity(input.account, sessionId),
  });
}

async function findOidcAccount(
  database: D1Executor,
  issuer: string,
  subject: string,
): Promise<AccountRow | null> {
  return database
    .prepare(
      `select id, auth_provider as authProvider, auth_issuer as authIssuer,
              auth_subject as authSubject, identity_version as identityVersion,
              primary_email as primaryEmail, normalized_email as normalizedEmail,
              status
         from accounts
        where auth_provider = 'oidc' and auth_issuer = ? and auth_subject = ?
        limit 1`,
    )
    .bind(issuer, subject)
    .first<AccountRow>();
}

async function findAccountByNormalizedEmail(
  database: D1Executor,
  normalizedEmail: string,
): Promise<{ id: string } | null> {
  return database
    .prepare("select id from accounts where normalized_email = ? limit 1")
    .bind(normalizedEmail)
    .first<{ id: string }>();
}

function primaryDatabase(database: D1Database): D1Executor {
  try {
    return database.withSession("first-primary");
  } catch {
    return database;
  }
}

function validateIdentityClaims(
  claims: VerifiedOidcIdentityClaims,
  configuration: OidcInstructorAuthConfiguration,
): VerifiedOidcIdentityClaims & { normalizedEmail: string } {
  const normalizedEmail = normalizeEmail(claims.email);
  if (
    claims.issuer !== configuration.issuer ||
    !validSubject(claims.subject) ||
    !normalizedEmail
  ) {
    throw new InstructorAuthStateError(
      "invalid_identity_claims",
      "The verified identity claims are invalid.",
    );
  }
  return { ...claims, email: claims.email.trim(), normalizedEmail };
}

function trustedIdentity(
  account: Pick<AccountRow, "id" | "primaryEmail">,
  sessionId: string,
): TrustedInstructorIdentity {
  return Object.freeze({
    accountId: account.id,
    sessionId,
    email: account.primaryEmail,
    displayName: account.primaryEmail,
    source: "oidc",
  });
}

function normalizeEmail(value: string): string | null {
  if (typeof value !== "string") return null;
  if (value !== value.trim()) return null;
  const normalized = value.trim().toLowerCase();
  if (
    !normalized ||
    normalized.length > 254 ||
    !/^[\x21-\x7e]+$/.test(normalized) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
  ) {
    return null;
  }
  return normalized;
}

function validSubject(value: string): boolean {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 1_024 &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

function safeRequestId(value: string | null | undefined): string | null {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
    ? value.toLowerCase()
    : null;
}

function exactTime(value: number | undefined): number {
  const result = value ?? Date.now();
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new InstructorAuthStateError(
      "invalid_session_configuration",
      "The authentication clock is invalid.",
    );
  }
  return result;
}

function assertTransactionValue(value: string, label: "state" | "nonce") {
  if (!SESSION_TOKEN_PATTERN.test(value)) {
    throw new InstructorAuthStateError(
      "invalid_login_transaction",
      `The OIDC ${label} value is invalid.`,
    );
  }
}

async function sealTransactionPayload(
  payload: OidcLoginTransaction,
  stateHash: string,
  rawKey: Uint8Array,
): Promise<{ ciphertext: string; iv: string }> {
  const key = await importAesKey(rawKey);
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const plaintext = encoder.encode(JSON.stringify(payload));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: transactionAdditionalData(stateHash),
      tagLength: 128,
    },
    key,
    plaintext,
  );
  return {
    ciphertext: encodeBase64Url(new Uint8Array(ciphertext)),
    iv: encodeBase64Url(iv),
  };
}

async function openTransactionPayload(
  ciphertext: string,
  encodedIv: string,
  stateHash: string,
  rawKey: Uint8Array,
): Promise<OidcLoginTransaction> {
  if (!HASH_PATTERN.test(stateHash)) throw invalidTransaction();
  const encrypted = decodeBase64Url(ciphertext, 8_192);
  const iv = decodeBase64Url(encodedIv, 16);
  if (!encrypted || !iv || iv.length !== 12) throw invalidTransaction();
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: transactionAdditionalData(stateHash),
      tagLength: 128,
    },
    await importAesKey(rawKey),
    encrypted,
  );
  const parsed = JSON.parse(decoder.decode(plaintext)) as Partial<OidcLoginTransaction>;
  if (
    !PKCE_VERIFIER_PATTERN.test(parsed.pkceVerifier ?? "") ||
    !SESSION_TOKEN_PATTERN.test(parsed.nonce ?? "") ||
    safeInstructorReturnPath(parsed.returnTo) !== parsed.returnTo
  ) {
    throw invalidTransaction();
  }
  return Object.freeze({
    pkceVerifier: parsed.pkceVerifier!,
    nonce: parsed.nonce!,
    returnTo: parsed.returnTo!,
  });
}

async function authHmacHex(
  secret: string,
  purpose: "oidc-login-state" | "instructor-session",
  value: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`roadmap-instructor-auth-v1\u0000${purpose}\u0000${value}`),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function importAesKey(rawKey: Uint8Array): Promise<CryptoKey> {
  if (rawKey.length !== 32) throw invalidTransaction();
  return crypto.subtle.importKey("raw", ownedBytes(rawKey), "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

function transactionAdditionalData(
  stateHash: string,
): Uint8Array<ArrayBuffer> {
  return encoder.encode(`roadmap-oidc-transaction-v1\u0000${stateHash}`);
}

function encodeBase64Url(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function decodeBase64Url(
  value: string,
  maximumLength: number,
): Uint8Array<ArrayBuffer> | null {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > maximumLength ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    return null;
  }
  try {
    const padding = "=".repeat((4 - (value.length % 4)) % 4);
    const binary = atob(
      `${value.replaceAll("-", "+").replaceAll("_", "/")}${padding}`,
    );
    const bytes = new Uint8Array(new ArrayBuffer(binary.length));
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return encodeBase64Url(bytes) === value ? bytes : null;
  } catch {
    return null;
  }
}

function ownedBytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
  const result = new Uint8Array(new ArrayBuffer(value.byteLength));
  result.set(value);
  return result;
}

function invalidTransaction(): InstructorAuthStateError {
  return new InstructorAuthStateError(
    "invalid_login_transaction",
    "The OIDC login transaction is invalid.",
  );
}
