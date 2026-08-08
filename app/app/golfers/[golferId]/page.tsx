import Link from "next/link";
import { notFound } from "next/navigation";
import { PlanView } from "@/components/plan/PlanView";
import { requirePageIdentity } from "@/lib/identity";
import {
  getCoachPlanForGolfer,
  listPlanResponses,
  listPlanShares,
  type GolferResponseType,
} from "@/lib/plans";
import { getOrCreateAccountForIdentity } from "@/lib/repository";
import styles from "../../workspace.module.css";
import { PublishControls } from "./PublishControls";
import { LivingPlanForms } from "./LivingPlanForms";

export const dynamic = "force-dynamic";

export default async function GolferPlanPage({
  params,
}: {
  params: Promise<{ golferId: string }>;
}) {
  const { golferId } = await params;
  const identity = await requirePageIdentity(`/app/golfers/${encodeURIComponent(golferId)}`);
  const account = await getOrCreateAccountForIdentity(identity);
  const model = await getCoachPlanForGolfer(account.id, golferId);
  if (!model) notFound();
  const [shares, responses] = await Promise.all([
    listPlanShares(account.id, model.plan.id),
    listPlanResponses(account.id, model.plan.id),
  ]);
  const editable = !["completed", "archived"].includes(model.plan.status);
  const publishable = model.plan.status !== "archived";

  return (
    <div>
      <div className={styles.page}>
        <header className={styles.pageHeader}>
          <div>
            <span className={styles.eyebrow}>Golfer plan</span>
            <h1>{model.golfer.displayName}</h1>
            <p>
              Review the exact private experience. Publishing creates a new revocable link for
              the current plan revision; it does not send a message automatically.
            </p>
          </div>
          <div className={styles.actions}>
            <Link className={styles.secondaryButton} href={`/app/golfers/${golferId}/settings`}>
              Golfer settings
            </Link>
            {editable ? (
              <Link className={styles.secondaryButton} href={`/app/golfers/${golferId}/edit`}>
                Edit core roadmap
              </Link>
            ) : null}
            <Link className={styles.secondaryButton} href="/app/golfers">
              Back to golfers
            </Link>
          </div>
        </header>
        {editable ? (
          <>
            <LivingPlanForms
              planId={model.plan.id}
              planRevision={model.plan.revision}
              phases={model.phases}
            />
          </>
        ) : (
          <div className={styles.notice} role="note">
            <strong>This plan is {model.plan.status}.</strong>
            <span>
              Its retained coach preview is read-only.
              {model.plan.status === "completed"
                ? " You may still publish this exact final revision for the golfer."
                : " Archived plans cannot create new private access."}
            </span>
          </div>
        )}
        {publishable ? (
          <>
            <div style={{ height: "1rem" }} />
            <PublishControls
              planId={model.plan.id}
              planRevision={model.plan.revision}
              initialShares={shares}
            />
          </>
        ) : null}
        {responses.length ? (
          <section className={styles.formCard} aria-labelledby="golfer-responses-heading">
            <div className={styles.cardHeader}>
              <div>
                <span className={styles.eyebrow}>Golfer choices</span>
                <h2 id="golfer-responses-heading">Recorded response history</h2>
              </div>
            </div>
            <p className={styles.muted}>
              These records show only a choice made through an active private link. An
              external-page open is not evidence of a booking, payment, sale, or coaching
              outcome, and Roadmap does not send a message for question or reassessment choices.
            </p>
            <ul className={styles.list}>
              {responses.map((response) => (
                <li key={response.id}>
                  <div>
                    <strong>{responseLabel(response.responseType)}</strong>
                    <span>{new Date(response.occurredAt).toLocaleString("en-CA")}</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
      <div style={{ marginTop: "2rem" }}>
        <PlanView model={model} preview />
      </div>
    </div>
  );
}

function responseLabel(responseType: GolferResponseType): string {
  const labels: Record<GolferResponseType, string> = {
    ask_question: "Question path opened",
    wait: "Review later",
    decline: "Not pursuing this option",
    request_reassessment: "Reassessment requested",
    independent_practice: "Independent practice chosen",
    external_action_opened: "External coach action opened",
  };
  return labels[responseType];
}
