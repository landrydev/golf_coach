"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { FormErrorSummary } from "@/components/forms/FormErrorSummary";
import {
  clientMutationErrorMessage,
  isClientMutationApiError,
  isClientMutationOutcomeUnknown,
  requestClientMutation,
} from "@/lib/client-mutation-recovery";
import {
  isPackageLifecycleMutationResponse,
  requireExactClientMutationJson,
  type PackageLifecycleExpectedPackage,
  type PackageLifecycleMutationResponse,
} from "@/lib/instructor-mutation-response-contracts";
import type { PackageView } from "@/lib/repository";
import styles from "../workspace.module.css";

export function PackageLifecycleControls({ item }: { item: PackageView }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const summaryOnlyRef = useRef<HTMLFormElement>(null);
  const mutationInFlightRef = useRef(false);
  const [state, setState] = useState<
    | "idle"
    | "saving"
    | "archiving"
    | "success"
    | "error"
    | "reload_required"
  >("idle");
  const [errorFocus, setErrorFocus] = useState<"form" | "summary">("form");
  const [message, setMessage] = useState("");
  const errorSummaryId = `package-${item.id}-lifecycle-error-summary`;

  function startMutation(): boolean {
    if (mutationInFlightRef.current) return false;
    mutationInFlightRef.current = true;
    return true;
  }

  function handleFailure(error: unknown, fallback: string, committed: string) {
    const authoritativeReloadRequired =
      isClientMutationOutcomeUnknown(error) ||
      (isClientMutationApiError(error) && error.status === 409);
    if (!authoritativeReloadRequired) mutationInFlightRef.current = false;
    setState(authoritativeReloadRequired ? "reload_required" : "error");
    setMessage(
      clientMutationErrorMessage(
        error,
        committed,
        "reload_before_retry",
        fallback,
      ),
    );
  }

  if (item.status === "archived") {
    return (
      <p className={styles.muted} style={{ gridColumn: "1 / -1", margin: 0 }}>
        Archived. Its external action is unavailable in golfer views; no booking,
        purchase, phase, or plan completion was recorded.
      </p>
    );
  }

  async function updatePackage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!startMutation()) return;
    setErrorFocus("form");
    setState("saving");
    setMessage("");
    const form = new FormData(event.currentTarget);
    const priceText = String(form.get("price") ?? "").trim();
    const price = priceText ? Number(priceText) : null;
    const priceCents =
      price !== null && Number.isFinite(price) ? Math.round(price * 100) : null;
    const requestedStatus = form.get("status") === "draft" ? "draft" : "active";
    const payload: PackageUpdatePayload = {
      name: canonicalText(form.get("name")),
      purpose: canonicalText(form.get("purpose")),
      fitDescription: canonicalText(form.get("fitDescription")),
      status: requestedStatus,
      priceCents,
      currency:
        priceCents === null
          ? undefined
          : canonicalText(form.get("currency")).toUpperCase(),
      currentDetailsText: canonicalText(form.get("currentDetailsText")),
      inclusions: lineItems(form.get("inclusions")),
      cadence: canonicalText(form.get("cadence")),
      practiceExpectation: canonicalText(form.get("practiceExpectation")),
      evaluationDescription: canonicalText(form.get("evaluationDescription")),
      termsSummary: canonicalText(form.get("termsSummary")),
      externalActionType: packageActionType(form.get("externalActionType")),
      externalActionLabel: canonicalText(form.get("externalActionLabel")),
      externalActionUrl: canonicalUrl(form.get("externalActionUrl")),
      isDefault: form.get("isDefault") === "yes",
      expectedUpdatedAt: item.updatedAt,
    };

    let result: PackageLifecycleMutationResponse;
    try {
      result = await lifecycleRequest(
        item.id,
        "PUT",
        payload,
        expectedPackageAfterUpdate(item, payload),
      );
    } catch (error) {
      handleFailure(
        error,
        "The package could not be updated.",
        "the package changes were saved",
      );
      return;
    }

    setState("success");
    setMessage(successMessage("updated", result));
    try {
      router.refresh();
    } catch {
      // The confirmed package update remains successful if refresh fails.
    }
  }

  async function archivePackage() {
    if (mutationInFlightRef.current) return;
    if (
      !window.confirm(
        `Archive ${item.name}? Its external action will become unavailable. Linked non-archived plans will receive a new withdrawn revision and active private links will be revoked. This does not mark a booking, purchase, phase, or plan complete.`,
      )
    ) {
      return;
    }
    if (!startMutation()) return;

    setErrorFocus("summary");
    setState("archiving");
    setMessage("");
    let result: PackageLifecycleMutationResponse;
    try {
      result = await lifecycleRequest(
        item.id,
        "DELETE",
        {
          confirmation: "archive_package",
          expectedUpdatedAt: item.updatedAt,
        },
        expectedPackageAfterArchive(item),
      );
    } catch (error) {
      handleFailure(
        error,
        "The package could not be archived.",
        "the package was archived",
      );
      return;
    }

    setState("success");
    setMessage(successMessage("archived", result));
    try {
      router.refresh();
    } catch {
      // The confirmed package archive remains successful if refresh fails.
    }
  }

  const isBusy = state === "saving" || state === "archiving";
  const isLocked =
    isBusy || state === "reload_required" || state === "success";

  return (
    <div style={{ gridColumn: "1 / -1" }}>
      <details>
        <summary className={styles.textLink}>Edit or archive this package</summary>
        <form
          method="post"
          ref={formRef}
          className={styles.form}
          aria-describedby={errorSummaryId}
          onSubmit={updatePackage}
          style={{ marginTop: "1rem" }}
        >
          <fieldset className={styles.formSection} disabled={isLocked}>
            <legend>Edit package facts</legend>
            <div className={styles.notice} role="note">
              <strong>Linked plans must be reviewed again.</strong>
              <span>
                Saving package facts increments each linked non-archived plan revision,
                clears publication approval, and revokes active private links. It does not
                send a message or record an external booking or payment.
              </span>
            </div>
            <div className={styles.fieldGrid}>
              <label className={styles.fullField}>
                Package name
                <input name="name" defaultValue={item.name} required maxLength={120} />
              </label>
              <label className={styles.fullField}>
                Package purpose
                <textarea
                  name="purpose"
                  defaultValue={item.purpose}
                  required
                  maxLength={1_500}
                />
              </label>
              <label className={styles.fullField}>
                Who it fits and why
                <textarea
                  name="fitDescription"
                  defaultValue={item.fitDescription}
                  required
                  maxLength={1_500}
                />
              </label>
              <label className={styles.field}>
                Package status
                <select name="status" defaultValue={item.status}>
                  <option value="active">Active</option>
                  <option value="draft">Draft</option>
                </select>
                <small>Use the separate archive action when this offer should retire.</small>
              </label>
              <label className={styles.field}>
                Exact price
                <input
                  name="price"
                  type="number"
                  min="0"
                  max="100000"
                  step="0.01"
                  defaultValue={
                    item.priceAmountMinor == null
                      ? ""
                      : (item.priceAmountMinor / 100).toFixed(2)
                  }
                />
                <small>Leave blank only when an honest current-details message is provided.</small>
              </label>
              <label className={styles.field}>
                Currency
                <input
                  name="currency"
                  defaultValue={item.currency ?? "CAD"}
                  minLength={3}
                  maxLength={3}
                  pattern="[A-Za-z]{3}"
                />
                <small>Defaults to CAD when an exact price is shown.</small>
              </label>
              <label className={styles.field}>
                Current details when no exact price is shown
                <input
                  name="currentDetailsText"
                  defaultValue={item.currentDetailsText ?? ""}
                  maxLength={500}
                  placeholder="Confirm current price with me"
                />
              </label>
              <label className={styles.fullField}>
                Material inclusions — one per line
                <textarea
                  name="inclusions"
                  defaultValue={item.inclusions.join("\n")}
                  required
                  maxLength={2_000}
                />
                <small>Active packages need at least one truthful material inclusion before they can be published in a golfer view.</small>
              </label>
              <label className={styles.field}>
                Cadence (optional)
                <input
                  name="cadence"
                  defaultValue={item.cadence ?? ""}
                  maxLength={300}
                />
              </label>
              <label className={styles.fullField}>
                Practice expectation (optional)
                <textarea
                  name="practiceExpectation"
                  defaultValue={item.practiceExpectation ?? ""}
                  maxLength={1_000}
                />
              </label>
              <label className={styles.fullField}>
                Evaluation approach (optional)
                <textarea
                  name="evaluationDescription"
                  defaultValue={item.evaluationDescription ?? ""}
                  maxLength={1_000}
                />
              </label>
              <label className={styles.fullField}>
                Terms
                <textarea
                  name="termsSummary"
                  defaultValue={item.termsSummary ?? item.terms}
                  required
                  maxLength={1_500}
                />
              </label>
              <label className={styles.field}>
                External action type
                <select name="externalActionType" defaultValue={item.externalActionType}>
                  <option value="booking">Booking</option>
                  <option value="purchase">Purchase</option>
                  <option value="contact">Contact</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label className={styles.field}>
                External action label
                <input
                  name="externalActionLabel"
                  defaultValue={item.externalActionLabel}
                  required
                  maxLength={120}
                />
              </label>
              <label className={styles.fullField}>
                Existing HTTPS booking, purchase, or contact link
                <input
                  name="externalActionUrl"
                  type="url"
                  defaultValue={item.externalActionUrl}
                  required
                  maxLength={2_048}
                />
                <small>
                  Roadmap only provides a handoff. Completion exists only when the external
                  service confirms it.
                </small>
              </label>
              <label className={`${styles.fullField} ${styles.confirmRow}`}>
                <input
                  name="isDefault"
                  type="checkbox"
                  value="yes"
                  defaultChecked={item.isDefault}
                />
                <span>Use as the default option for new package selections.</span>
              </label>
            </div>
          </fieldset>

          <div className={styles.actions}>
            <button className={styles.primaryButton} type="submit" disabled={isLocked}>
              {state === "saving" ? "Saving…" : "Save package changes"}
            </button>
            <button
              className={styles.dangerButton}
              type="button"
              disabled={isLocked}
              onClick={archivePackage}
            >
              {state === "archiving" ? "Archiving…" : "Archive package"}
            </button>
          </div>
        </form>
      </details>
      <FormErrorSummary
        id={errorSummaryId}
        message={
          state === "error" || state === "reload_required" ? message : ""
        }
        formRef={errorFocus === "form" ? formRef : summaryOnlyRef}
        className={styles.errorStatus}
      />
      {state !== "error" && state !== "reload_required" && message ? (
        <div className={styles.formStatus} role="status" style={{ marginTop: "0.8rem" }}>
          {message}
          {state === "success" ? (
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={() => window.location.reload()}
            >
              Reload package state
            </button>
          ) : null}
        </div>
      ) : null}
      {state === "reload_required" ? (
        <div className={styles.notice} role="alert" style={{ marginTop: "0.8rem" }}>
          <strong>Reload before changing or archiving this package.</strong>
          <span>
            The exact package controls are locked until linked plans and private links are
            loaded from authoritative state.
          </span>
          <button
            className={styles.secondaryButton}
            type="button"
            onClick={() => window.location.reload()}
          >
            Reload and check package state
          </button>
        </div>
      ) : null}
    </div>
  );
}

function lineItems(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

async function lifecycleRequest(
  packageId: string,
  method: "PUT" | "DELETE",
  payload: unknown,
  expectedPackage: PackageLifecycleExpectedPackage,
): Promise<PackageLifecycleMutationResponse> {
  const response = await requestClientMutation(`/api/packages/${encodeURIComponent(packageId)}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return requireExactClientMutationJson(
    response,
    200,
    (value): value is PackageLifecycleMutationResponse =>
      isPackageLifecycleMutationResponse(value, {
        package: expectedPackage,
      }),
    "The package change could not be saved.",
  );
}

type PackageUpdatePayload = Readonly<{
  name: string;
  purpose: string;
  fitDescription: string;
  status: "draft" | "active";
  priceCents: number | null;
  currency?: string;
  currentDetailsText: string;
  inclusions: string[];
  cadence: string;
  practiceExpectation: string;
  evaluationDescription: string;
  termsSummary: string;
  externalActionType: PackageView["externalActionType"];
  externalActionLabel: string;
  externalActionUrl: string;
  isDefault: boolean;
  expectedUpdatedAt: number;
}>;

function expectedPackageAfterUpdate(
  item: PackageView,
  payload: PackageUpdatePayload,
): PackageLifecycleExpectedPackage {
  return {
    id: item.id,
    title: payload.name,
    name: payload.name,
    description: payload.fitDescription,
    purpose: payload.purpose,
    fitDescription: payload.fitDescription,
    status: payload.status,
    priceCents: payload.priceCents,
    priceAmountMinor: payload.priceCents,
    currency: payload.priceCents === null ? null : payload.currency ?? "CAD",
    currentDetailsText: optionalCanonicalText(payload.currentDetailsText),
    inclusions: [...payload.inclusions],
    cadence: optionalCanonicalText(payload.cadence),
    practiceExpectation: optionalCanonicalText(payload.practiceExpectation),
    evaluationDescription: optionalCanonicalText(
      payload.evaluationDescription,
    ),
    terms: payload.termsSummary,
    termsSummary: payload.termsSummary,
    externalActionType: payload.externalActionType,
    externalActionLabel: payload.externalActionLabel,
    externalActionUrl: payload.externalActionUrl,
    isDefault: payload.isDefault,
    createdAt: item.createdAt,
    previousUpdatedAt: item.updatedAt,
  };
}

function expectedPackageAfterArchive(
  item: PackageView,
): PackageLifecycleExpectedPackage {
  const { updatedAt, ...expected } = item;
  return {
    ...expected,
    status: "archived",
    isDefault: false,
    previousUpdatedAt: updatedAt,
  };
}

function canonicalText(value: FormDataEntryValue | null): string {
  return String(value ?? "").replace(/\r\n?/g, "\n").trim();
}

function optionalCanonicalText(value: string): string | null {
  return value || null;
}

function canonicalUrl(value: FormDataEntryValue | null): string {
  const text = canonicalText(value);
  try {
    return new URL(text).toString();
  } catch {
    return text;
  }
}

function packageActionType(
  value: FormDataEntryValue | null,
): PackageView["externalActionType"] {
  return value === "purchase" || value === "contact" || value === "other"
    ? value
    : "booking";
}

function successMessage(
  action: "updated" | "archived",
  result: PackageLifecycleMutationResponse,
): string {
  const plans = result.affectedPlans;
  const links = result.revokedShareLinks;
  const impact = plans
    ? `${plans} linked plan revision${plans === 1 ? " was" : "s were"} incremented and ${links} active private link${links === 1 ? " was" : "s were"} revoked.`
    : "No linked plan needed a new revision.";
  return `Package ${action}. ${impact} No external completion was recorded.`;
}
