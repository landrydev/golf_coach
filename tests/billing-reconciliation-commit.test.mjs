import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("reconciliation performs no fallible work after its atomic success commit", async () => {
  const source = await readFile(
    new URL("../lib/billing-reconciliation.ts", import.meta.url),
    "utf8",
  );
  const commitStart = source.indexOf(
    "    await applyStripeSubscriptionReconciliation({",
  );
  const commitProof = source.indexOf(
    "    // The atomic terminal batch is the commit proof.",
    commitStart,
  );
  const successReturn = source.indexOf("    return {", commitProof);

  assert.ok(commitStart >= 0, "expected the atomic reconciliation commit");
  assert.ok(commitProof > commitStart, "expected the post-commit invariant");
  assert.ok(successReturn > commitProof, "expected the immediate success return");
  assert.doesNotMatch(
    source.slice(commitProof, successReturn),
    /\bawait\b|\bthrow\b|getSubscriptionForAccount\s*\(/,
  );
  assert.doesNotMatch(
    source.slice(commitStart, successReturn),
    /billing_reconciliation_verification_failed/,
  );

  const checkedStart = source.indexOf("async function checked(");
  const checkedEnd = source.indexOf(
    "async function recordFailureBestEffort(",
    checkedStart,
  );
  const checkedBody = source.slice(checkedStart, checkedEnd);
  assert.match(
    checkedBody,
    /try\s*\{[\s\S]*?await recordBillingReconciliationCheck\([\s\S]*?\}\s*catch\s*\{[\s\S]*?\}\s*return result;/,
  );
  assert.doesNotMatch(checkedBody, /catch\s*\{[\s\S]*?\bthrow\b/);
});
