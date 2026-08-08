"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { FormErrorSummary } from "@/components/forms/FormErrorSummary";
import type { PackageView } from "@/lib/repository";
import styles from "../workspace.module.css";

type LifecycleResponse = {
  package?: { id?: string; status?: string };
  affectedPlans?: number;
  revokedShareLinks?: number;
  error?: { message?: string };
};

export function PackageLifecycleControls({ item }: { item: PackageView }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const summaryOnlyRef = useRef<HTMLFormElement>(null);
  const [state, setState] = useState<
    "idle" | "saving" | "archiving" | "success" | "error"
  >("idle");
  const [errorFocus, setErrorFocus] = useState<"form" | "summary">("form");
  const [message, setMessage] = useState("");
  const errorSummaryId = `package-${item.id}-lifecycle-error-summary`;

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
    setErrorFocus("form");
    setState("saving");
    setMessage("");
    const form = new FormData(event.currentTarget);
    const priceText = String(form.get("price") ?? "").trim();
    const price = priceText ? Number(priceText) : null;
    const priceCents =
      price !== null && Number.isFinite(price) ? Math.round(price * 100) : null;
    const payload = {
      name: form.get("name"),
      purpose: form.get("purpose"),
      fitDescription: form.get("fitDescription"),
      status: form.get("status"),
      priceCents,
      currency: priceCents === null ? undefined : form.get("currency"),
      currentDetailsText: form.get("currentDetailsText"),
      inclusions: lineItems(form.get("inclusions")),
      cadence: form.get("cadence"),
      practiceExpectation: form.get("practiceExpectation"),
      evaluationDescription: form.get("evaluationDescription"),
      termsSummary: form.get("termsSummary"),
      externalActionType: form.get("externalActionType"),
      externalActionLabel: form.get("externalActionLabel"),
      externalActionUrl: form.get("externalActionUrl"),
      isDefault: form.get("isDefault") === "yes",
    };

    try {
      const result = await lifecycleRequest(item.id, "PUT", payload);
      setState("success");
      setMessage(successMessage("updated", result));
      router.refresh();
    } catch (error) {
      setState("error");
      setMessage(
        error instanceof Error ? error.message : "The package could not be updated.",
      );
    }
  }

  async function archivePackage() {
    if (
      !window.confirm(
        `Archive ${item.name}? Its external action will become unavailable. Linked non-archived plans will receive a new withdrawn revision and active private links will be revoked. This does not mark a booking, purchase, phase, or plan complete.`,
      )
    ) {
      return;
    }

    setErrorFocus("summary");
    setState("archiving");
    setMessage("");
    try {
      const result = await lifecycleRequest(item.id, "DELETE", {
        confirmation: "archive_package",
      });
      setState("success");
      setMessage(successMessage("archived", result));
      router.refresh();
    } catch (error) {
      setState("error");
      setMessage(
        error instanceof Error ? error.message : "The package could not be archived.",
      );
    }
  }

  const isBusy = state === "saving" || state === "archiving";

  return (
    <div style={{ gridColumn: "1 / -1" }}>
      <details>
        <summary className={styles.textLink}>Edit or archive this package</summary>
        <form
          ref={formRef}
          className={styles.form}
          aria-describedby={errorSummaryId}
          onSubmit={updatePackage}
          style={{ marginTop: "1rem" }}
        >
          <fieldset className={styles.formSection} disabled={isBusy}>
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
            <button className={styles.primaryButton} type="submit" disabled={isBusy}>
              {state === "saving" ? "Saving…" : "Save package changes"}
            </button>
            <button
              className={styles.dangerButton}
              type="button"
              disabled={isBusy}
              onClick={archivePackage}
            >
              {state === "archiving" ? "Archiving…" : "Archive package"}
            </button>
          </div>
        </form>
      </details>
      <FormErrorSummary
        id={errorSummaryId}
        message={state === "error" ? message : ""}
        formRef={errorFocus === "form" ? formRef : summaryOnlyRef}
        className={styles.errorStatus}
      />
      {state !== "error" && message ? (
        <div className={styles.formStatus} role="status" style={{ marginTop: "0.8rem" }}>
          {message}
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
): Promise<LifecycleResponse> {
  const response = await fetch(`/api/packages/${encodeURIComponent(packageId)}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = (await response.json()) as LifecycleResponse;
  if (!response.ok || !result.package?.id) {
    throw new Error(result.error?.message || "The package change could not be saved.");
  }
  return result;
}

function successMessage(
  action: "updated" | "archived",
  result: LifecycleResponse,
): string {
  const plans = result.affectedPlans ?? 0;
  const links = result.revokedShareLinks ?? 0;
  const impact = plans
    ? `${plans} linked plan revision${plans === 1 ? " was" : "s were"} incremented and ${links} active private link${links === 1 ? " was" : "s were"} revoked.`
    : "No linked plan needed a new revision.";
  return `Package ${action}. ${impact} No external completion was recorded.`;
}
