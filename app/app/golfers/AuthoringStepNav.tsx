import styles from "../workspace.module.css";

export const authoringSteps = [
  ["goal", "Goal"],
  ["assessment", "Assessment"],
  ["priority", "Priority"],
  ["phases", "Phases"],
  ["evidence", "Evidence"],
  ["package", "Package"],
  ["preview", "Preview"],
] as const;

export type AuthoringStepId = (typeof authoringSteps)[number][0];

export function AuthoringStepNav({
  current,
  completed = [],
  optional = ["evidence", "package"],
  links,
}: {
  current: AuthoringStepId;
  completed?: AuthoringStepId[];
  optional?: AuthoringStepId[];
  links: Partial<Record<AuthoringStepId, string>>;
}) {
  return (
    <nav className={styles.authoringSteps} aria-label="Roadmap authoring steps">
      <ol>
        {authoringSteps.map(([id, label], index) => {
          const state = completed.includes(id)
            ? "complete"
            : id === current
              ? "current"
              : optional.includes(id)
                ? "optional"
                : links[id]
                  ? "available"
                  : "upcoming";
          const content = (
            <>
              <b aria-hidden="true">{completed.includes(id) ? "Done" : index + 1}</b>
              <span>
                <strong>{label}</strong>
                <small>
                  {state === "complete"
                    ? "Saved"
                    : state === "current"
                      ? "Current"
                      : state === "optional"
                        ? "Optional"
                        : state === "upcoming"
                          ? "After save"
                          : "Available"}
                </small>
              </span>
            </>
          );
          return (
            <li data-state={state} key={id}>
              {links[id] ? (
                <a href={links[id]} aria-current={id === current ? "step" : undefined}>
                  {content}
                </a>
              ) : (
                <span aria-current={id === current ? "step" : undefined}>{content}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
