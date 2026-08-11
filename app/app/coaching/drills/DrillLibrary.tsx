"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  clientMutationErrorMessage,
  requestClientMutation,
  requestClientRead,
} from "@/lib/client-mutation-recovery";
import styles from "../coaching.module.css";
import {
  STARTER_DRILL_EXAMPLES,
  type StarterDrillDraft,
  type StarterDrillExample,
} from "./starter-drills";

export type DrillTemplate = Readonly<{
  id: string;
  title: string;
  purpose: string;
  whenItFits: string;
  equipment: string[];
  setup: string;
  steps: string[];
  dosageOrCadence: string;
  feelOrCue: string | null;
  successCheck: string;
  commonMiss: string | null;
  stopOrAskRule: string;
  constraintOrAdaptation: string | null;
  progression: string | null;
  regression: string | null;
  status: "active" | "archived";
  isFavourite: boolean;
  version: number;
  updatedAt: number;
}>;

type Draft = Omit<
  DrillTemplate,
  "id" | "status" | "isFavourite" | "version" | "updatedAt"
>;
type MediaChoice = {
  id: string;
  status: string;
  mediaKind: string;
  title: string;
};
type DrillMedia = {
  attachment: {
    id: string;
    role: string;
    label: string | null;
    status: string;
  };
  asset: {
    id: string;
    mediaKind: string;
    altText: string | null;
    caption: string | null;
  };
};

const EMPTY: Draft = {
  title: "",
  purpose: "",
  whenItFits: "",
  equipment: [],
  setup: "",
  steps: [],
  dosageOrCadence: "",
  feelOrCue: null,
  successCheck: "",
  commonMiss: null,
  stopOrAskRule: "",
  constraintOrAdaptation: null,
  progression: null,
  regression: null,
};

export function DrillLibrary({
  initialTemplates,
  initialMediaAssets,
}: {
  initialTemplates: DrillTemplate[];
  initialMediaAssets: MediaChoice[];
}) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [search, setSearch] = useState("");
  const [favouritesOnly, setFavouritesOnly] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [drillMedia, setDrillMedia] = useState<DrillMedia[]>([]);
  const [starterExampleId, setStarterExampleId] = useState<string | null>(null);

  const selected =
    templates.find((template) => template.id === selectedId) ?? null;
  const visible = useMemo(
    () =>
      templates.filter((template) => {
        const query = search.trim().toLowerCase();
        return (
          (!query ||
            `${template.title} ${template.purpose} ${template.whenItFits}`
              .toLowerCase()
              .includes(query)) &&
          (!favouritesOnly || template.isFavourite) &&
          (includeArchived || template.status === "active")
        );
      }),
    [favouritesOnly, includeArchived, search, templates],
  );

  function select(template: DrillTemplate) {
    setSelectedId(template.id);
    setDraft(templateDraft(template)!);
    setStarterExampleId(null);
    setPreviewOpen(false);
    announce("");
    void fetchDrillMedia(template.id)
      .then(setDrillMedia)
      .catch(handleMutationError);
  }

  function startNew() {
    setSelectedId(null);
    setDraft(EMPTY);
    setStarterExampleId(null);
    setPreviewOpen(false);
    setDrillMedia([]);
    announce("New drill form ready.");
  }

  function loadStarterExample(example: StarterDrillExample) {
    setSelectedId(null);
    setDraft(starterDraft(example.draft));
    setStarterExampleId(example.id);
    setPreviewOpen(true);
    setDrillMedia([]);
    announce(
      "Synthetic example copied into an unsaved draft. Review every field; nothing is saved until you create the drill.",
    );
  }

  async function attachDemoMedia(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(`media:${selected.id}`);
    try {
      const response = await requestClientMutation(
        `/api/coaching/drills/${encodeURIComponent(selected.id)}/media`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mediaAssetId: String(form.get("mediaAssetId") ?? ""),
            role: String(form.get("role") ?? "demo"),
            label: String(form.get("label") ?? "").trim() || null,
            coachContext: String(form.get("coachContext") ?? "").trim() || null,
            sortOrder: 0,
          }),
        },
      );
      const body = await responseJson(response);
      if (!response.ok) throw new Error(apiMessage(body, response.status));
      setDrillMedia(await fetchDrillMedia(selected.id));
      formElement.reset();
      announce("Demo media attached to this reusable drill.");
    } catch (caught) {
      handleMutationError(caught);
    } finally {
      setBusy(null);
    }
  }

  async function withdrawDemoMedia(attachmentId: string) {
    if (
      !selected ||
      !window.confirm("Withdraw this media from the reusable drill?")
    )
      return;
    setBusy(`media:${selected.id}`);
    try {
      const response = await requestClientMutation(
        `/api/coaching/drills/${encodeURIComponent(selected.id)}/media`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            attachmentId,
            confirmation: "withdraw_drill_media",
          }),
        },
      );
      const body = await responseJson(response);
      if (!response.ok) throw new Error(apiMessage(body, response.status));
      setDrillMedia(await fetchDrillMedia(selected.id));
      announce("Drill media withdrawn.");
    } catch (caught) {
      handleMutationError(caught);
    } finally {
      setBusy(null);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = draftFromForm(form);
    setBusy("save");
    announce(selected ? "Saving this drill…" : "Creating this drill…");
    try {
      const response = selected
        ? await requestClientMutation(
            `/api/coaching/drills/${encodeURIComponent(selected.id)}`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                expectedVersion: selected.version,
                ...payload,
              }),
            },
          )
        : await requestClientMutation("/api/coaching/drills", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      const body = await responseJson(response);
      if (!response.ok) throw new Error(apiMessage(body, response.status));
      await refreshTemplates(
        responseTemplateId(body) ?? selected?.id ?? null,
        false,
      );
      setStarterExampleId(null);
      announce(selected ? "Drill saved." : "Drill created and selected.");
    } catch (caught) {
      handleMutationError(caught);
    } finally {
      setBusy(null);
    }
  }

  async function refreshTemplates(
    preferredId = selectedId,
    preserveDraft = true,
  ) {
    const response = await requestClientRead(
      "/api/coaching/drills?includeArchived=true&limit=250",
      {
        cache: "no-store",
      },
    );
    const body = await responseJson(response);
    if (!response.ok) throw new Error(apiMessage(body, response.status));
    const next = body.templates as DrillTemplate[];
    setTemplates(next);
    const refreshed =
      next.find((template) => template.id === preferredId) ?? null;
    if (refreshed) {
      setSelectedId(refreshed.id);
      if (!preserveDraft) setDraft(templateDraft(refreshed)!);
    }
  }

  async function favourite(template: DrillTemplate) {
    setBusy(`favourite:${template.id}`);
    announce("Updating favourite…");
    try {
      const response = await requestClientMutation(
        `/api/coaching/drills/${encodeURIComponent(template.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedVersion: template.version,
            favourite: !template.isFavourite,
          }),
        },
      );
      const body = await responseJson(response);
      if (!response.ok) throw new Error(apiMessage(body, response.status));
      await refreshTemplates(template.id, false);
      announce(
        template.isFavourite
          ? "Removed from favourites."
          : "Added to favourites.",
      );
    } catch (caught) {
      handleMutationError(caught);
    } finally {
      setBusy(null);
    }
  }

  async function duplicate(template: DrillTemplate) {
    setBusy(`duplicate:${template.id}`);
    announce("Duplicating drill…");
    try {
      const response = await requestClientMutation(
        `/api/coaching/drills/${encodeURIComponent(template.id)}/duplicate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: `${template.title} — copy` }),
        },
      );
      const body = await responseJson(response);
      if (!response.ok) throw new Error(apiMessage(body, response.status));
      await refreshTemplates(responseTemplateId(body), false);
      announce("Independent drill copy created.");
    } catch (caught) {
      handleMutationError(caught);
    } finally {
      setBusy(null);
    }
  }

  async function archive(template: DrillTemplate) {
    if (
      !window.confirm(
        `Archive “${template.title}”? Existing plan assignments keep their saved snapshot.`,
      )
    )
      return;
    setBusy(`archive:${template.id}`);
    announce("Archiving drill…");
    try {
      const response = await requestClientMutation(
        `/api/coaching/drills/${encodeURIComponent(template.id)}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedVersion: template.version,
            confirmation: "archive_drill_template",
          }),
        },
      );
      const body = await responseJson(response);
      if (!response.ok) throw new Error(apiMessage(body, response.status));
      await refreshTemplates(template.id, false);
      announce("Drill archived. Existing assignments were not changed.");
    } catch (caught) {
      handleMutationError(caught);
    } finally {
      setBusy(null);
    }
  }

  function handleMutationError(caught: unknown) {
    const text = clientMutationErrorMessage(
      caught,
      "the coaching change was saved",
      "reload_before_retry",
      "The change could not be saved.",
    );
    announce(text, true);
    if (/revision|version|conflict|changed/i.test(text)) {
      void refreshTemplates(selectedId, false).catch(() => undefined);
    }
  }

  function announce(text: string, isError = false) {
    setMessage(text);
    setError(isError);
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Reusable coaching content</span>
          <h1>Drill library</h1>
          <p>
            Create a complete coaching drill once, then assign a saved snapshot
            to a golfer.
          </p>
        </div>
        <div className={styles.actions}>
          <a className={styles.buttonSecondary} href="/app/coaching/roadmaps">
            Roadmap templates
          </a>
          <button className={styles.button} type="button" onClick={startNew}>
            Create drill
          </button>
        </div>
      </header>

      <section className={styles.toolbar} aria-label="Filter drill library">
        <label className={styles.compactField}>
          <span>Search drills</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            type="search"
            placeholder="Title, purpose, or when it fits"
          />
        </label>
        <label className={styles.checkbox}>
          <input
            checked={favouritesOnly}
            onChange={(event) => setFavouritesOnly(event.target.checked)}
            type="checkbox"
          />
          Favourites only
        </label>
        <label className={styles.checkbox}>
          <input
            checked={includeArchived}
            onChange={(event) => setIncludeArchived(event.target.checked)}
            type="checkbox"
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

      <section className={styles.panel} aria-labelledby="starter-drills-heading">
        <div className={styles.sectionHeader}>
          <div>
            <span className={styles.eyebrow}>Unsaved synthetic starters</span>
            <h2 id="starter-drills-heading">See the full content shape before starting.</h2>
            <p>
              These examples are editable structure only. They are not a diagnosis,
              universal instruction, or validated coaching guidance. Opening one copies it
              into the browser editor; Roadmap saves nothing until you choose Create drill.
            </p>
          </div>
        </div>
        <ul className={styles.list}>
          {STARTER_DRILL_EXAMPLES.map((example) => (
            <li className={styles.card} key={example.id}>
              <div className={styles.cardHeader}>
                <div>
                  <h3>{example.draft.title}</h3>
                  <span className={styles.badge}>Synthetic · not saved</span>
                </div>
              </div>
              <p>{example.summary}</p>
              <button
                className={styles.buttonSecondary}
                disabled={Boolean(busy)}
                type="button"
                onClick={() => loadStarterExample(example)}
              >
                Use as unsaved draft
              </button>
            </li>
          ))}
        </ul>
      </section>

      <div className={styles.library}>
        <section aria-labelledby="drill-list-heading">
          <div className={styles.sectionHeader}>
            <div>
              <h2 id="drill-list-heading">
                {visible.length} drill{visible.length === 1 ? "" : "s"}
              </h2>
            </div>
          </div>
          {visible.length ? (
            <ul className={styles.list}>
              {visible.map((template) => (
                <li
                  className={styles.card}
                  data-selected={selectedId === template.id}
                  key={template.id}
                >
                  <div className={styles.cardHeader}>
                    <div>
                      <h2>{template.title}</h2>
                      <span className={styles.badge}>
                        {template.status === "archived"
                          ? "Archived"
                          : `Version ${template.version}`}
                      </span>
                    </div>
                    <button
                      className={styles.buttonQuiet}
                      disabled={Boolean(busy) || template.status === "archived"}
                      type="button"
                      onClick={() => favourite(template)}
                      aria-label={`${template.isFavourite ? "Remove" : "Add"} ${template.title} ${template.isFavourite ? "from" : "to"} favourites`}
                    >
                      {template.isFavourite ? "★ Favourite" : "☆ Favourite"}
                    </button>
                  </div>
                  <p>{template.purpose}</p>
                  <div className={styles.actions}>
                    <button
                      className={styles.buttonSecondary}
                      type="button"
                      onClick={() => select(template)}
                    >
                      Open
                    </button>
                    <button
                      className={styles.buttonSecondary}
                      disabled={Boolean(busy)}
                      type="button"
                      onClick={() => duplicate(template)}
                    >
                      Duplicate
                    </button>
                    {template.status === "active" ? (
                      <button
                        className={styles.buttonDanger}
                        disabled={Boolean(busy)}
                        type="button"
                        onClick={() => archive(template)}
                      >
                        Archive
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className={styles.empty}>No drills match these filters.</div>
          )}
        </section>

        <section
          className={styles.panel}
          aria-labelledby="drill-editor-heading"
        >
          <div className={styles.sectionHeader}>
            <div>
              <span className={styles.eyebrow}>
                {selected ? `Version ${selected.version}` : "New drill"}
              </span>
              <h2 id="drill-editor-heading">
                {selected ? `Edit ${selected.title}` : "Build a reusable drill"}
              </h2>
              <p className={styles.muted}>
                All core instructions are required. The optional fields can stay
                blank.
              </p>
              {starterExampleId ? (
                <div className={styles.notice} role="note">
                  This is an unsaved synthetic starter. Rewrite it for the golfer and
                  your coaching judgment, then choose Create drill to make a coach-owned
                  template.
                </div>
              ) : null}
            </div>
          </div>
          {selected?.status === "archived" ? (
            <div className={styles.notice} role="note">
              This drill is archived and retained read-only. Duplicate it to
              create a new active drill.
            </div>
          ) : (
            <form method="post" className={styles.editor} onSubmit={save}>
              <div className={styles.grid}>
                <Text
                  name="title"
                  label="Drill title"
                  value={draft.title}
                  maxLength={160}
                  onChange={setDraftField(setDraft, "title")}
                />
                <Text
                  name="dosageOrCadence"
                  label="Dosage or cadence"
                  value={draft.dosageOrCadence}
                  maxLength={1000}
                  onChange={setDraftField(setDraft, "dosageOrCadence")}
                />
                <Area
                  name="purpose"
                  label="Purpose"
                  value={draft.purpose}
                  maxLength={2000}
                  onChange={setDraftField(setDraft, "purpose")}
                />
                <Area
                  name="whenItFits"
                  label="When it fits"
                  value={draft.whenItFits}
                  maxLength={2000}
                  onChange={setDraftField(setDraft, "whenItFits")}
                />
                <Area
                  name="setup"
                  label="Setup"
                  value={draft.setup}
                  maxLength={3000}
                  onChange={setDraftField(setDraft, "setup")}
                />
                <Lines
                  name="steps"
                  label="Steps — one per line"
                  values={draft.steps}
                  onChange={(values) =>
                    setDraft((current) => ({ ...current, steps: values }))
                  }
                />
                <Lines
                  name="equipment"
                  label="Equipment — one item per line"
                  values={draft.equipment}
                  onChange={(values) =>
                    setDraft((current) => ({ ...current, equipment: values }))
                  }
                />
                <Area
                  name="successCheck"
                  label="Success check"
                  value={draft.successCheck}
                  maxLength={2000}
                  onChange={setDraftField(setDraft, "successCheck")}
                />
                <Area
                  name="stopOrAskRule"
                  label="Stop or ask rule"
                  value={draft.stopOrAskRule}
                  maxLength={2000}
                  onChange={setDraftField(setDraft, "stopOrAskRule")}
                />
              </div>
              <details>
                <summary>Optional coaching detail</summary>
                <div className={styles.grid}>
                  <OptionalArea
                    name="feelOrCue"
                    label="Feel or cue"
                    value={draft.feelOrCue}
                    onChange={setOptionalDraftField(setDraft, "feelOrCue")}
                  />
                  <OptionalArea
                    name="commonMiss"
                    label="Common miss"
                    value={draft.commonMiss}
                    onChange={setOptionalDraftField(setDraft, "commonMiss")}
                  />
                  <OptionalArea
                    name="constraintOrAdaptation"
                    label="Constraint or adaptation"
                    value={draft.constraintOrAdaptation}
                    onChange={setOptionalDraftField(
                      setDraft,
                      "constraintOrAdaptation",
                    )}
                  />
                  <OptionalArea
                    name="progression"
                    label="Progression"
                    value={draft.progression}
                    onChange={setOptionalDraftField(setDraft, "progression")}
                  />
                  <OptionalArea
                    name="regression"
                    label="Regression"
                    value={draft.regression}
                    onChange={setOptionalDraftField(setDraft, "regression")}
                  />
                </div>
              </details>
              <div className={styles.actions}>
                <button
                  className={styles.button}
                  disabled={Boolean(busy)}
                  type="submit"
                >
                  {busy === "save"
                    ? "Saving…"
                    : selected
                      ? "Save new version"
                      : "Create drill"}
                </button>
                <button
                  className={styles.buttonSecondary}
                  type="button"
                  onClick={() => setPreviewOpen((open) => !open)}
                >
                  {previewOpen ? "Close preview" : "Preview drill"}
                </button>
              </div>
            </form>
          )}
          {selected ? (
            <section
              className={styles.preview}
              aria-labelledby="drill-media-heading"
            >
              <div className={styles.sectionHeader}>
                <div>
                  <h3 id="drill-media-heading">Demo media</h3>
                  <p>
                    Optional. Choose an existing private upload; the drill
                    remains complete without it.
                  </p>
                </div>
                <a className={styles.buttonSecondary} href="/app/media">
                  Open media library
                </a>
              </div>
              {selected.status === "active" ? (
                <form
                  method="post"
                  className={styles.editor}
                  onSubmit={attachDemoMedia}
                >
                  <div className={styles.grid}>
                    <label className={styles.field}>
                      <span>Private media</span>
                      <select required name="mediaAssetId" defaultValue="">
                        <option value="">Choose one</option>
                        {initialMediaAssets
                          .filter((asset) => asset.status === "ready")
                          .map((asset) => (
                            <option value={asset.id} key={asset.id}>
                              {asset.title} · {asset.mediaKind}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label className={styles.field}>
                      <span>Role</span>
                      <select name="role" defaultValue="demo">
                        <option value="demo">Demonstration</option>
                        <option value="primary">Primary</option>
                        <option value="supporting">Supporting</option>
                        <option value="poster">Poster image</option>
                        <option value="source">Source</option>
                      </select>
                    </label>
                    <label className={styles.field}>
                      <span>Golfer-facing label (optional)</span>
                      <input name="label" maxLength={300} />
                    </label>
                    <label className={styles.field}>
                      <span>Coach context (optional)</span>
                      <textarea name="coachContext" maxLength={1500} />
                    </label>
                  </div>
                  <button
                    className={styles.button}
                    disabled={
                      Boolean(busy) ||
                      !initialMediaAssets.some(
                        (asset) => asset.status === "ready",
                      )
                    }
                    type="submit"
                  >
                    Attach media
                  </button>
                </form>
              ) : null}
              {drillMedia.length ? (
                <ul className={styles.list}>
                  {drillMedia.map((item) => (
                    <li className={styles.card} key={item.attachment.id}>
                      <div className={styles.cardHeader}>
                        <div>
                          <h3>
                            {item.attachment.label ||
                              item.asset.caption ||
                              item.asset.altText ||
                              "Untitled media"}
                          </h3>
                          <span className={styles.badge}>
                            {item.attachment.role}
                          </span>
                        </div>
                        <span>{item.asset.mediaKind}</span>
                      </div>
                      {selected.status === "active" ? (
                        <button
                          className={styles.buttonDanger}
                          disabled={Boolean(busy)}
                          type="button"
                          onClick={() => withdrawDemoMedia(item.attachment.id)}
                        >
                          Withdraw
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.muted}>
                  No media attached. Text instructions remain fully usable.
                </p>
              )}
            </section>
          ) : null}
        </section>
      </div>

      {previewOpen ? <DrillPreview draft={draft} /> : null}
    </div>
  );
}

function Text(props: {
  name: string;
  label: string;
  value: string;
  maxLength: number;
  onChange(value: string): void;
}) {
  return (
    <label className={styles.field}>
      <span>{props.label}</span>
      <input
        required
        name={props.name}
        value={props.value}
        maxLength={props.maxLength}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </label>
  );
}

function Area(props: {
  name: string;
  label: string;
  value: string;
  maxLength: number;
  onChange(value: string): void;
}) {
  return (
    <label className={styles.field}>
      <span>{props.label}</span>
      <textarea
        required
        name={props.name}
        value={props.value}
        maxLength={props.maxLength}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </label>
  );
}

function OptionalArea(props: {
  name: string;
  label: string;
  value: string | null;
  onChange(value: string): void;
}) {
  return (
    <label className={styles.field}>
      <span>{props.label}</span>
      <textarea
        name={props.name}
        value={props.value ?? ""}
        maxLength={2000}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </label>
  );
}

function Lines(props: {
  name: string;
  label: string;
  values: string[];
  onChange(values: string[]): void;
}) {
  return (
    <label className={styles.field}>
      <span>{props.label}</span>
      <textarea
        required
        name={props.name}
        value={props.values.join("\n")}
        maxLength={4000}
        onChange={(event) => props.onChange(splitLines(event.target.value))}
      />
    </label>
  );
}

function DrillPreview({ draft }: { draft: Draft }) {
  return (
    <section className={styles.preview} aria-labelledby="drill-preview-heading">
      <span className={styles.eyebrow}>Coach preview</span>
      <h2 id="drill-preview-heading">{draft.title || "Untitled drill"}</h2>
      <p>{draft.purpose || "Add the purpose before assigning this drill."}</p>
      <dl>
        <dt>When it fits</dt>
        <dd>{draft.whenItFits || "Not set"}</dd>
        <dt>Equipment</dt>
        <dd>{draft.equipment.length ? draft.equipment.join(", ") : "None"}</dd>
        <dt>Setup</dt>
        <dd>{draft.setup || "Not set"}</dd>
        <dt>Dosage</dt>
        <dd>{draft.dosageOrCadence || "Not set"}</dd>
        <dt>Success check</dt>
        <dd>{draft.successCheck || "Not set"}</dd>
        <dt>Stop or ask</dt>
        <dd>{draft.stopOrAskRule || "Not set"}</dd>
      </dl>
      <h3>Steps</h3>
      {draft.steps.length ? (
        <ol>
          {draft.steps.map((step, index) => (
            <li key={`${index}:${step}`}>{step}</li>
          ))}
        </ol>
      ) : (
        <p>No steps yet.</p>
      )}
    </section>
  );
}

function starterDraft(draft: StarterDrillDraft): Draft {
  return {
    ...draft,
    equipment: [...draft.equipment],
    steps: [...draft.steps],
  };
}

function templateDraft(template: DrillTemplate | undefined): Draft | null {
  if (!template) return null;
  return {
    title: template.title,
    purpose: template.purpose,
    whenItFits: template.whenItFits,
    equipment: template.equipment,
    setup: template.setup,
    steps: template.steps,
    dosageOrCadence: template.dosageOrCadence,
    feelOrCue: template.feelOrCue,
    successCheck: template.successCheck,
    commonMiss: template.commonMiss,
    stopOrAskRule: template.stopOrAskRule,
    constraintOrAdaptation: template.constraintOrAdaptation,
    progression: template.progression,
    regression: template.regression,
  };
}

function draftFromForm(form: FormData): Draft {
  const optional = (name: string) =>
    String(form.get(name) ?? "").trim() || null;
  return {
    title: String(form.get("title") ?? "").trim(),
    purpose: String(form.get("purpose") ?? "").trim(),
    whenItFits: String(form.get("whenItFits") ?? "").trim(),
    equipment: splitLines(String(form.get("equipment") ?? "")),
    setup: String(form.get("setup") ?? "").trim(),
    steps: splitLines(String(form.get("steps") ?? "")),
    dosageOrCadence: String(form.get("dosageOrCadence") ?? "").trim(),
    feelOrCue: optional("feelOrCue"),
    successCheck: String(form.get("successCheck") ?? "").trim(),
    commonMiss: optional("commonMiss"),
    stopOrAskRule: String(form.get("stopOrAskRule") ?? "").trim(),
    constraintOrAdaptation: optional("constraintOrAdaptation"),
    progression: optional("progression"),
    regression: optional("regression"),
  };
}

function splitLines(value: string) {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 24);
}

function setDraftField<K extends keyof Draft>(
  setDraft: React.Dispatch<React.SetStateAction<Draft>>,
  key: K,
) {
  return (value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));
}

function setOptionalDraftField<K extends keyof Draft>(
  setDraft: React.Dispatch<React.SetStateAction<Draft>>,
  key: K,
) {
  return (value: string) =>
    setDraft((current) => ({ ...current, [key]: value || null }));
}

type JsonRecord = Record<string, unknown>;

async function responseJson(response: Response): Promise<JsonRecord> {
  try {
    return (await response.json()) as JsonRecord;
  } catch {
    return {};
  }
}

function apiMessage(body: JsonRecord, status: number) {
  const nestedError =
    body.error &&
    typeof body.error === "object" &&
    "message" in body.error &&
    typeof body.error.message === "string"
      ? body.error.message
      : null;
  const message =
    nestedError ??
    (typeof body.error === "string"
      ? body.error
      : typeof body.message === "string"
        ? body.message
        : null);
  return (
    message ??
    (status === 409
      ? "This drill changed in another session. The latest version is loading."
      : "The drill change could not be saved.")
  );
}

function responseTemplateId(body: JsonRecord): string | null {
  if (
    !body.template ||
    typeof body.template !== "object" ||
    !("id" in body.template)
  )
    return null;
  return typeof body.template.id === "string" ? body.template.id : null;
}

async function fetchDrillMedia(drillId: string): Promise<DrillMedia[]> {
  const response = await requestClientRead(
    `/api/coaching/drills/${encodeURIComponent(drillId)}/media`,
    { cache: "no-store" },
  );
  const body = await responseJson(response);
  if (!response.ok) throw new Error(apiMessage(body, response.status));
  return Array.isArray(body.attachments)
    ? (body.attachments as DrillMedia[])
    : [];
}
