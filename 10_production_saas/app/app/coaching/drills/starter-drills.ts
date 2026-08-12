export type StarterDrillDraft = Readonly<{
  title: string;
  purpose: string;
  whenItFits: string;
  equipment: readonly string[];
  setup: string;
  steps: readonly string[];
  dosageOrCadence: string;
  feelOrCue: string | null;
  successCheck: string;
  commonMiss: string | null;
  stopOrAskRule: string;
  constraintOrAdaptation: string | null;
  progression: string | null;
  regression: string | null;
}>;

export type StarterDrillExample = Readonly<{
  id: string;
  summary: string;
  draft: StarterDrillDraft;
}>;

/**
 * Unsaved, synthetic examples that teach the drill content shape. They are
 * deliberately plain source constants: opening one only copies its fields into
 * the browser editor, and persistence still requires an explicit coach submit.
 */
export const STARTER_DRILL_EXAMPLES: readonly StarterDrillExample[] = Object.freeze([
  Object.freeze({
    id: "synthetic-three-target-observation",
    summary:
      "A complete example of a bounded target-change routine with an explicit stop-or-ask rule.",
    draft: Object.freeze({
      title: "Three-target observation routine — editable example",
      purpose:
        "Give the coach and golfer a short structure for recording start-direction feedback across changed targets.",
      whenItFits:
        "Use only when the coach has selected target change as relevant to the golfer's current plan.",
      equipment: Object.freeze(["One comfortable club", "Three safe range targets", "Nine balls"]),
      setup:
        "Choose three safe targets and confirm one simple preparation reference before starting.",
      steps: Object.freeze([
        "Hit three shots to the first target and record only the clearest feedback.",
        "Repeat for the second target without adding a new cue.",
        "Repeat for the third target, then compare the recorded observations with the coach.",
      ]),
      dosageOrCadence: "One set of nine shots; repeat only if the coach asks.",
      feelOrCue: "Keep the selected preparation reference brief.",
      successCheck:
        "The golfer can describe the observed start-direction feedback for each target.",
      commonMiss:
        "Adding a different technical cue after each shot instead of recording the selected feedback.",
      stopOrAskRule:
        "Stop and ask the coach if discomfort appears or the selected reference becomes unclear.",
      constraintOrAdaptation:
        "Use one target and three balls when time, energy, or range space is limited.",
      progression:
        "If the coach decides it fits, vary the target order while keeping the same observation boundary.",
      regression:
        "Return to one target and one clearly understood feedback signal.",
    }),
  }),
  Object.freeze({
    id: "synthetic-contact-feedback-window",
    summary:
      "A second complete example showing equipment, adaptation, success-check, and review fields.",
    draft: Object.freeze({
      title: "Contact-feedback window — editable example",
      purpose:
        "Collect a small coach-selected sample of contact feedback without treating the sample as a diagnosis.",
      whenItFits:
        "Use only when contact feedback is already an explicit priority in the coach-authored roadmap.",
      equipment: Object.freeze(["One comfortable club", "Safe target", "Optional strike-location feedback"]),
      setup:
        "Confirm a comfortable starting setup and how the golfer will record the selected feedback.",
      steps: Object.freeze([
        "Make one rehearsal and confirm the feedback signal is understandable.",
        "Hit four shots at a comfortable effort and record the feedback without changing the task.",
        "Pause, review the notes with the coach, and decide whether another set is useful.",
      ]),
      dosageOrCadence: "One or two sets of four shots with a pause between sets.",
      feelOrCue: null,
      successCheck:
        "A bounded set is completed and the recorded feedback is clear enough for the next coach review.",
      commonMiss:
        "Treating one result as proof of a permanent pattern or promised outcome.",
      stopOrAskRule:
        "Stop for discomfort, uncertainty about the task, or feedback that cannot be interpreted safely.",
      constraintOrAdaptation:
        "Remove optional feedback equipment and use the golfer's plain-language contact report.",
      progression:
        "Only after coach review, repeat the same observation window with a different safe target.",
      regression:
        "Use two shots and review the feedback signal before continuing.",
    }),
  }),
]);
