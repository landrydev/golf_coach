"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  clientMutationErrorMessage,
  requestClientMutation,
  requestClientRead,
} from "@/lib/client-mutation-recovery";
import styles from "../coaching.module.css";

type PhaseDraft = {
  title: string;
  purpose: string;
  rationale: string | null;
  progressSignals: string[];
};
type Content = {
  goalPrompt: string | null;
  assessmentPrompt: string | null;
  priorityPrompt: string | null;
  phases: PhaseDraft[];
};
export type RoadmapTemplate = {
  id: string;
  title: string;
  description: string;
  content: Content;
  origin: string;
  status: "active" | "archived";
  isFavourite: boolean;
  version: number;
};
type Draft = Pick<RoadmapTemplate, "title" | "description" | "content">;
type JsonRecord = Record<string, unknown>;
const emptyDraft = (): Draft => ({
  title: "",
  description: "",
  content: {
    goalPrompt: null,
    assessmentPrompt: null,
    priorityPrompt: null,
    phases: [{ title: "", purpose: "", rationale: null, progressSignals: [] }],
  },
});

export function RoadmapTemplateLibrary({
  initialTemplates,
}: {
  initialTemplates: RoadmapTemplate[];
}) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialTemplates[0]?.id ?? null,
  );
  const [draft, setDraft] = useState<Draft>(() =>
    initialTemplates[0] ? asDraft(initialTemplates[0]) : emptyDraft(),
  );
  const [query, setQuery] = useState("");
  const [favourites, setFavourites] = useState(false);
  const [archived, setArchived] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const selected = templates.find((item) => item.id === selectedId) ?? null;
  const visible = useMemo(
    () =>
      templates.filter(
        (item) =>
          (!query.trim() ||
            `${item.title} ${item.description}`
              .toLowerCase()
              .includes(query.trim().toLowerCase())) &&
          (!favourites || item.isFavourite) &&
          (archived || item.status === "active"),
      ),
    [archived, favourites, query, templates],
  );
  async function refresh(preferredId: string | null, replaceDraft = true) {
    const response = await requestClientRead(
      "/api/coaching/roadmaps?includeArchived=true&limit=250",
      { cache: "no-store" },
    );
    const body = await jsonBody(response);
    if (!response.ok) throw new Error(errorMessage(body));
    const next = Array.isArray(body.templates)
      ? (body.templates as RoadmapTemplate[])
      : [];
    setTemplates(next);
    const picked = next.find((item) => item.id === preferredId);
    if (picked) {
      setSelectedId(picked.id);
      if (replaceDraft) setDraft(asDraft(picked));
    }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    announce("Saving reusable roadmap template…");
    try {
      const response = selected
        ? await requestClientMutation(
            `/api/coaching/roadmaps/${encodeURIComponent(selected.id)}`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ expectedVersion: selected.version, ...draft }),
            },
          )
        : await requestClientMutation("/api/coaching/roadmaps", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...draft, origin: "coach" }),
          });
      const body = await jsonBody(response);
      if (!response.ok) throw new Error(errorMessage(body));
      await refresh(templateId(body) ?? selected?.id ?? null);
      announce(
        selected
          ? "Template saved as a new version."
          : "Reusable roadmap template created.",
      );
    } catch (caught) {
      failed(caught);
    } finally {
      setBusy(false);
    }
  }
  async function changeFavourite(item: RoadmapTemplate) {
    setBusy(true);
    try {
      const response = await requestClientMutation(
        `/api/coaching/roadmaps/${encodeURIComponent(item.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedVersion: item.version,
            favourite: !item.isFavourite,
          }),
        },
      );
      const body = await jsonBody(response);
      if (!response.ok) throw new Error(errorMessage(body));
      await refresh(item.id);
      announce(
        item.isFavourite ? "Removed from favourites." : "Added to favourites.",
      );
    } catch (caught) {
      failed(caught);
    } finally {
      setBusy(false);
    }
  }
  async function duplicate(item: RoadmapTemplate) {
    setBusy(true);
    try {
      const response = await requestClientMutation(
        `/api/coaching/roadmaps/${encodeURIComponent(item.id)}/duplicate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedSourceVersion: item.version,
            title: `${item.title} — copy`,
          }),
        },
      );
      const body = await jsonBody(response);
      if (!response.ok) throw new Error(errorMessage(body));
      await refresh(templateId(body));
      announce("Independent editable copy created.");
    } catch (caught) {
      failed(caught);
    } finally {
      setBusy(false);
    }
  }
  async function archive(item: RoadmapTemplate) {
    if (
      !window.confirm(
        `Archive “${item.title}”? Existing golfer plans are unchanged.`,
      )
    )
      return;
    setBusy(true);
    try {
      const response = await requestClientMutation(
        `/api/coaching/roadmaps/${encodeURIComponent(item.id)}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedVersion: item.version,
            confirmation: "archive_roadmap_template",
          }),
        },
      );
      const body = await jsonBody(response);
      if (!response.ok) throw new Error(errorMessage(body));
      await refresh(item.id);
      announce("Template archived. Existing golfer records were not changed.");
    } catch (caught) {
      failed(caught);
    } finally {
      setBusy(false);
    }
  }
  function failed(caught: unknown) {
    setError(true);
    setMessage(
      clientMutationErrorMessage(
        caught,
        "the coaching change was saved",
        "reload_before_retry",
        "The template change could not be saved.",
      ),
    );
    if (
      caught instanceof Error &&
      /version|changed|conflict/i.test(caught.message)
    )
      void refresh(selectedId).catch(() => undefined);
  }
  function announce(value: string) {
    setError(false);
    setMessage(value);
  }
  function select(item: RoadmapTemplate) {
    setSelectedId(item.id);
    setDraft(asDraft(item));
    announce("");
  }
  function phase(
    index: number,
    key: keyof PhaseDraft,
    value: string | string[],
  ) {
    setDraft((current) => ({
      ...current,
      content: {
        ...current.content,
        phases: current.content.phases.map((item, itemIndex) =>
          itemIndex === index ? { ...item, [key]: value } : item,
        ),
      },
    }));
  }
  function movePhase(index: number, direction: -1 | 1) {
    const target = index + direction;
    setDraft((current) => {
      if (target < 0 || target >= current.content.phases.length) return current;
      const phases = [...current.content.phases];
      [phases[index], phases[target]] = [phases[target], phases[index]];
      return { ...current, content: { ...current.content, phases } };
    });
    announce(`Phase ${index + 1} moved ${direction < 0 ? "up" : "down"}.`);
  }
  function duplicatePhase(index: number) {
    setDraft((current) => {
      if (current.content.phases.length >= 12) return current;
      const source = current.content.phases[index];
      const phases = [...current.content.phases];
      phases.splice(index + 1, 0, {
        ...source,
        title: source.title ? `${source.title} — copy` : "",
        progressSignals: [...source.progressSignals],
      });
      return { ...current, content: { ...current.content, phases } };
    });
    announce(`Phase ${index + 1} duplicated as an editable phase.`);
  }
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Reusable structure</span>
          <h1>Roadmap templates</h1>
          <p>
            Save a coach-authored starting structure. A template never diagnoses
            a golfer or updates an existing plan automatically.
          </p>
        </div>
        <button
          className={styles.button}
          type="button"
          onClick={() => {
            setSelectedId(null);
            setDraft(emptyDraft());
          }}
        >
          Create template
        </button>
      </header>
      <section className={styles.toolbar}>
        <label className={styles.compactField}>
          <span>Search templates</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={favourites}
            onChange={(event) => setFavourites(event.target.checked)}
          />
          Favourites only
        </label>
        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={archived}
            onChange={(event) => setArchived(event.target.checked)}
          />
          Show archived
        </label>
      </section>
      {message ? (
        <div
          className={styles.status}
          data-error={error}
          role={error ? "alert" : "status"}
        >
          {message}
        </div>
      ) : null}
      <div className={styles.library}>
        <section>
          <h2>
            {visible.length} template{visible.length === 1 ? "" : "s"}
          </h2>
          <ul className={styles.list}>
            {visible.map((item) => (
              <li
                className={styles.card}
                data-selected={item.id === selectedId}
                key={item.id}
              >
                <div className={styles.cardHeader}>
                  <div>
                    <h2>{item.title}</h2>
                    <span className={styles.badge}>
                      {item.status === "archived"
                        ? "Archived"
                        : `Version ${item.version}`}
                    </span>
                  </div>
                  <button
                    className={styles.buttonQuiet}
                    disabled={busy || item.status === "archived"}
                    type="button"
                    onClick={() => changeFavourite(item)}
                  >
                    {item.isFavourite ? "★ Favourite" : "☆ Favourite"}
                  </button>
                </div>
                <p>{item.description}</p>
                <div className={styles.actions}>
                  <button
                    className={styles.buttonSecondary}
                    type="button"
                    onClick={() => select(item)}
                  >
                    Open
                  </button>
                  <button
                    className={styles.buttonSecondary}
                    disabled={busy}
                    type="button"
                    onClick={() => duplicate(item)}
                  >
                    Duplicate
                  </button>
                  {item.status === "active" ? (
                    <button
                      className={styles.buttonDanger}
                      disabled={busy}
                      type="button"
                      onClick={() => archive(item)}
                    >
                      Archive
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
        <section className={styles.panel}>
          <div className={styles.sectionHeader}>
            <div>
              <span className={styles.eyebrow}>
                {selected ? `Version ${selected.version}` : "New template"}
              </span>
              <h2>
                {selected
                  ? `Edit ${selected.title}`
                  : "Create a reusable structure"}
              </h2>
            </div>
          </div>
          {selected?.status === "archived" ? (
            <div className={styles.notice}>
              Archived templates are read-only. Duplicate this template to
              continue editing.
            </div>
          ) : (
            <form method="post" className={styles.editor} onSubmit={save}>
              <Input
                label="Template title"
                value={draft.title}
                onChange={(value) =>
                  setDraft((current) => ({ ...current, title: value }))
                }
              />
              <Area
                label="Description"
                value={draft.description}
                onChange={(value) =>
                  setDraft((current) => ({ ...current, description: value }))
                }
              />
              <Area
                optional
                label="Goal prompt"
                value={draft.content.goalPrompt ?? ""}
                onChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    content: { ...current.content, goalPrompt: value || null },
                  }))
                }
              />
              <Area
                optional
                label="Assessment prompt"
                value={draft.content.assessmentPrompt ?? ""}
                onChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    content: {
                      ...current.content,
                      assessmentPrompt: value || null,
                    },
                  }))
                }
              />
              <Area
                optional
                label="Priority prompt"
                value={draft.content.priorityPrompt ?? ""}
                onChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    content: {
                      ...current.content,
                      priorityPrompt: value || null,
                    },
                  }))
                }
              />
              <fieldset>
                <legend>Phases</legend>
                <div className={styles.editor}>
                  {draft.content.phases.map((item, index) => (
                    <section className={styles.card} key={index}>
                      <div className={styles.cardHeader}>
                        <h3>Phase {index + 1}</h3>
                        <div className={styles.actions} aria-label={`Phase ${index + 1} structure controls`}>
                          <button
                            className={styles.buttonSecondary}
                            disabled={index === 0}
                            type="button"
                            onClick={() => movePhase(index, -1)}
                          >
                            Move up
                          </button>
                          <button
                            className={styles.buttonSecondary}
                            disabled={index === draft.content.phases.length - 1}
                            type="button"
                            onClick={() => movePhase(index, 1)}
                          >
                            Move down
                          </button>
                          <button
                            className={styles.buttonSecondary}
                            disabled={draft.content.phases.length >= 12}
                            type="button"
                            onClick={() => duplicatePhase(index)}
                          >
                            Duplicate
                          </button>
                          {draft.content.phases.length > 1 ? (
                          <button
                            className={styles.buttonDanger}
                            type="button"
                            onClick={() =>
                              setDraft((current) => ({
                                ...current,
                                content: {
                                  ...current.content,
                                  phases: current.content.phases.filter(
                                    (_, phaseIndex) => phaseIndex !== index,
                                  ),
                                },
                              }))
                            }
                          >
                            Remove
                          </button>
                          ) : null}
                        </div>
                      </div>
                      <div className={styles.grid}>
                        <Input
                          label="Title"
                          value={item.title}
                          onChange={(value) => phase(index, "title", value)}
                        />
                        <Area
                          label="Purpose"
                          value={item.purpose}
                          onChange={(value) => phase(index, "purpose", value)}
                        />
                        <Area
                          optional
                          label="Rationale"
                          value={item.rationale ?? ""}
                          onChange={(value) =>
                            phase(index, "rationale", value || "")
                          }
                        />
                        <Area
                          label="Progress signals — one per line"
                          value={item.progressSignals.join("\n")}
                          onChange={(value) =>
                            phase(
                              index,
                              "progressSignals",
                              value
                                .split(/\r?\n/)
                                .map((signal) => signal.trim())
                                .filter(Boolean),
                            )
                          }
                        />
                      </div>
                    </section>
                  ))}
                </div>
                <button
                  className={styles.buttonSecondary}
                  type="button"
                  disabled={draft.content.phases.length >= 12}
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      content: {
                        ...current.content,
                        phases: [
                          ...current.content.phases,
                          {
                            title: "",
                            purpose: "",
                            rationale: null,
                            progressSignals: [],
                          },
                        ],
                      },
                    }))
                  }
                >
                  Add phase
                </button>
              </fieldset>
              <button className={styles.button} disabled={busy} type="submit">
                {selected ? "Save new version" : "Create template"}
              </button>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange(value: string): void;
}) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <input
        required
        value={value}
        maxLength={160}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
function Area({
  label,
  value,
  onChange,
  optional = false,
}: {
  label: string;
  value: string;
  onChange(value: string): void;
  optional?: boolean;
}) {
  return (
    <label className={styles.field}>
      <span>
        {label}
        {optional ? " (optional)" : ""}
      </span>
      <textarea
        required={!optional}
        value={value}
        maxLength={2000}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
function asDraft(item: RoadmapTemplate): Draft {
  return {
    title: item.title,
    description: item.description,
    content: structuredClone(item.content),
  };
}
async function jsonBody(response: Response): Promise<JsonRecord> {
  try {
    return (await response.json()) as JsonRecord;
  } catch {
    return {};
  }
}
function templateId(body: JsonRecord): string | null {
  return body.template &&
    typeof body.template === "object" &&
    "id" in body.template &&
    typeof body.template.id === "string"
    ? body.template.id
    : null;
}
function errorMessage(body: JsonRecord) {
  return body.error &&
    typeof body.error === "object" &&
    "message" in body.error &&
    typeof body.error.message === "string"
    ? body.error.message
    : "The roadmap template change could not be saved.";
}
