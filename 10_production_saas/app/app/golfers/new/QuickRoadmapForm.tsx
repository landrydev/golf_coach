"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import {
  clientMutationErrorMessage,
  requestClientMutation,
  requireClientMutationJson,
} from "@/lib/client-mutation-recovery";
import styles from "../../beta2.module.css";

type PackageOption = { id: string; name: string; fitDescription: string };
type Created = { golfer: { id: string }; plan: { id: string; revision: number } };

const DEFAULT_PHASES = [
  {
    title: "Build the foundation",
    purpose: "Create one simple pattern the player can recognize and repeat at a comfortable pace.",
    signal: "The player can recognize the intended pattern without a new explanation.",
  },
  {
    title: "Make it reliable",
    purpose: "Keep the pattern available as the task, club, target, or pressure changes.",
    signal: "The pattern appears often enough to guide the next coaching decision.",
  },
  {
    title: "Transfer it to play",
    purpose: "Connect the change to representative decisions, targets, and real rounds.",
    signal: "The player can use the pattern in a representative playing situation.",
  },
] as const;

export function QuickRoadmapForm({ packages }: { packages: PackageOption[] }) {
  const router = useRouter();
  const attemptKey = useRef(`roadmap-${crypto.randomUUID()}`);
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "saving") return;
    setState("saving");
    setMessage("");
    const form = new FormData(event.currentTarget);
    const player = text(form, "displayName");
    const goal = text(form, "goal");
    const pattern = text(form, "pattern");
    const firstPriority = text(form, "priority");
    const whyFirst = text(form, "whyFirst");
    const phases = DEFAULT_PHASES.map((defaults, index) => ({
      number: index + 1,
      status: index === 0 ? "active" : "planned",
      title: text(form, `phase${index + 1}Title`) || defaults.title,
      purpose: text(form, `phase${index + 1}Purpose`) || defaults.purpose,
      rationale: index === 0 ? whyFirst : null,
      progressSignals: [text(form, `phase${index + 1}Signal`) || defaults.signal],
      expectations: null,
      estimatedDuration: null,
    }));
    const payload = {
      adultEligibilityConfirmed: form.get("adultEligibilityConfirmed") === "yes",
      displayName: player,
      preferredName: null,
      email: text(form, "email") || null,
      externalReference: null,
      planTitle: `Roadmap to ${goal}`.slice(0, 120),
      goal: {
        statement: goal,
        desiredOutcome: null,
        why: text(form, "why") || null,
        whyItMatters: null,
        context: null,
        constraints: null,
        scoreOrHandicapContext: null,
      },
      assessment: {
        title: "Starting point",
        context: null,
        summary: `The coach is protecting ${text(form, "strengths")} while addressing ${pattern}.`,
        startingPoint: null,
        strengths: text(form, "strengths"),
        strengthSummary: null,
        primaryPattern: pattern,
        limitations: "This roadmap reflects the assessment and information available today. It can change as the coach and player gather more representative evidence.",
      },
      priority: { title: firstPriority, description: null, rationale: whyFirst },
      phases,
      coachingPackageId: text(form, "packageId") || null,
      firstPhasePackageId: null,
    };

    try {
      const response = await requestClientMutation("/api/golfers", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": attemptKey.current },
        body: JSON.stringify(payload),
      });
      const result = await requireClientMutationJson<Created>(
        response,
        (value): value is Created => Boolean(
          value && typeof value === "object" && "golfer" in value && value.golfer &&
          typeof value.golfer === "object" && "id" in value.golfer && typeof value.golfer.id === "string" &&
          "plan" in value && value.plan && typeof value.plan === "object" && "id" in value.plan && typeof value.plan.id === "string",
        ),
        "The roadmap could not be created.",
      );
      router.push(`/app/golfers/${encodeURIComponent(result.golfer.id)}`);
      router.refresh();
    } catch (error) {
      setState("error");
      setMessage(clientMutationErrorMessage(error, "the roadmap was created", "reload_before_retry", "The roadmap could not be created. Check the player list before trying again."));
    }
  }

  return (
    <form className={styles.roadmapForm} onSubmit={submit}>
      <div className={styles.formIntro}>
        <strong>A roadmap is a conversation, not a report.</strong>
        <p>Four short sections create the player record, the three-phase story, and the exact private experience.</p>
      </div>

      <section className={styles.conversationStep}>
        <span className={styles.stepNumber}>1</span>
        <div className={styles.stepBody}>
          <h2>The outcome</h2><p>Start with the player and the change they care about.</p>
          <div className={styles.formFields}>
            <label>Player name<input name="displayName" required maxLength={120} autoComplete="off" placeholder="Jordan Lee" /></label>
            <label>Email <small>Optional for your records</small><input name="email" type="email" maxLength={254} autoComplete="off" /></label>
            <label className={styles.full}>What do they want to achieve?<textarea name="goal" required maxLength={600} placeholder="Keep the driver in play often enough to break 90 consistently." /></label>
            <label className={styles.full}>Why does it matter now?<textarea name="why" maxLength={1000} placeholder="They want to enjoy competitive rounds without one miss defining the day." /></label>
          </div>
        </div>
      </section>

      <section className={styles.conversationStep}>
        <span className={styles.stepNumber}>2</span>
        <div className={styles.stepBody}>
          <h2>Your read</h2><p>Three coaching judgments are enough to explain why the plan begins here.</p>
          <div className={styles.formFields}>
            <label className={styles.full}>What are they already doing well?<textarea name="strengths" required maxLength={1500} placeholder="Athletic motion, good speed potential, and strong commitment to practice." /></label>
            <label className={styles.full}>What pattern is holding the goal back?<textarea name="pattern" required maxLength={2000} placeholder="Start direction and strike move together, so the severe right miss remains unpredictable." /></label>
            <label>What should change first?<input name="priority" required maxLength={120} placeholder="Own the start direction" /></label>
            <label>Why first?<textarea name="whyFirst" required maxLength={1500} placeholder="A predictable start line gives every later speed and transfer decision a stable base." /></label>
          </div>
        </div>
      </section>

      <section className={styles.conversationStep}>
        <span className={styles.stepNumber}>3</span>
        <div className={styles.stepBody}>
          <h2>The path</h2><p>Roadmap starts with a three-phase coaching sequence. Edit only what makes this player’s path more personal.</p>
          <div className={styles.phaseFormGrid}>
            {DEFAULT_PHASES.map((phase, index) => (
              <article className={styles.phaseFormCard} key={phase.title}>
                <span>Phase {index + 1}</span>
                <label>Title<input name={`phase${index + 1}Title`} defaultValue={phase.title} required maxLength={120} /></label>
                <label>Outcome<textarea name={`phase${index + 1}Purpose`} defaultValue={phase.purpose} required maxLength={700} /></label>
                <label>What will show progress?<textarea name={`phase${index + 1}Signal`} defaultValue={phase.signal} required maxLength={240} /></label>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.conversationStep}>
        <span className={styles.stepNumber}>4</span>
        <div className={styles.stepBody}>
          <h2>The first commitment</h2><p>Connect an existing coaching package only when it genuinely supports the first phase.</p>
          <div className={styles.formFields}>
            <label className={styles.full}>Coaching package<select name="packageId" defaultValue=""><option value="">No package recommendation yet</option>{packages.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
            <label className={styles.checkboxRow}><input name="adultEligibilityConfirmed" type="checkbox" value="yes" required /><span>I confirm this player is an adult and I have a suitable basis to create this coaching record.</span></label>
          </div>
        </div>
      </section>

      <div className={styles.formFooter}>
        <p className={state === "error" ? styles.formError : undefined} role={state === "error" ? "alert" : "status"}>{message || "You will land on the complete player workspace and exact private preview."}</p>
        <button className={styles.primaryButton} type="submit" disabled={state === "saving"}>{state === "saving" ? "Creating the roadmap…" : "Create roadmap"}</button>
      </div>
    </form>
  );
}

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}
