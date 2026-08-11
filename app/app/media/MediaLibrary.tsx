"use client";

import { useRef, useState, type FormEvent } from "react";
import {
  clientMutationErrorMessage,
  isClientMutationOutcomeUnknown,
  requestClientMutation,
  requireClientMutationJson,
  requireClientMutationSuccess,
} from "@/lib/client-mutation-recovery";
import {
  clientMediaUploadTimeoutMs,
  requestClientUpload,
} from "@/lib/client-upload-recovery";
import type { MediaAssetView } from "@/lib/media";
import {
  createMediaUploadBody,
  type MediaUploadFields,
  type MediaUploadMetadata,
} from "@/lib/media-upload-protocol";
import styles from "./media.module.css";

type MediaConfiguration =
  | Readonly<{ ready: false }>
  | Readonly<{
      ready: true;
      maxBytes: number;
      maxVideoDurationMs: number;
      allowedMimeTypes: readonly string[];
    }>;

type ClientMediaAsset = MediaAssetView & {
  url?: string | null;
  posterUrl?: string | null;
};

export function MediaLibrary({
  initialAssets,
  configuration,
}: {
  initialAssets: MediaAssetView[];
  configuration: MediaConfiguration;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [assets, setAssets] = useState<ClientMediaAsset[]>(
    initialAssets.map(withPrivateUrl),
  );
  const [replacement, setReplacement] = useState<MediaAssetView | null>(null);
  const [state, setState] = useState<
    | "idle"
    | "measuring"
    | "uploading"
    | "success"
    | "error"
    | "reload_required"
  >("idle");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [removingId, setRemovingId] = useState<string | null>(null);
  const uploadControlsLocked =
    state === "measuring" ||
    state === "uploading" ||
    state === "reload_required" ||
    removingId !== null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!configuration.ready || uploadControlsLocked) return;
    const formElement = event.currentTarget;
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setState("error");
      setMessage("Choose one supported image, video, CSV, or document to upload.");
      return;
    }
    if (!configuration.allowedMimeTypes.includes(file.type)) {
      setState("error");
      setMessage("That file format is not enabled for this workspace.");
      return;
    }
    if (file.size > configuration.maxBytes) {
      setState("error");
      setMessage(`Choose a file smaller than ${formatBytes(configuration.maxBytes)}.`);
      return;
    }

    try {
      // React disables the named controls while measurement and upload are in
      // flight. Snapshot their successful-control values before that state
      // transition (and before the first await), otherwise FormData omits them.
      const capturedFields = captureMediaUploadFields(
        formElement,
        file,
        replacement,
      );
      setState("measuring");
      setMessage("Checking media details before the private upload…");
      setProgress(0);
      const measured = await measureMedia(file);
      if (
        measured.durationMs &&
        measured.durationMs > configuration.maxVideoDurationMs
      ) {
        throw new Error(
          `Choose a video shorter than ${formatDuration(configuration.maxVideoDurationMs)}.`,
        );
      }
      const body = await createMediaUploadBody(file, {
        ...capturedFields,
        durationMs: measured.durationMs,
        heightPixels: measured.heightPixels,
        widthPixels: measured.widthPixels,
      });
      setState("uploading");
      setMessage("Uploading privately. Keep this page open until it finishes.");
      const uploaded = await uploadWithProgress(body, setProgress);
      setAssets((current) => [uploaded, ...current]);
      setReplacement(null);
      setState("success");
      setProgress(100);
      setMessage(
        replacement
          ? "Replacement uploaded. Published roadmaps will change only after the new asset is explicitly attached and republished."
          : "Upload complete. It remains coach-only until you attach it to coaching content and publish that revision.",
      );
      formElement.reset();
    } catch (error) {
      setState(
        isClientMutationOutcomeUnknown(error) ? "reload_required" : "error",
      );
      setMessage(
        clientMutationErrorMessage(
          error,
          "the media upload finished",
          "reload_before_retry",
          "The upload did not finish. Try again.",
        ),
      );
    }
  }

  function beginReplacement(asset: MediaAssetView) {
    if (uploadControlsLocked) return;
    setReplacement(asset);
    setState("idle");
    setMessage(
      asset.status === "failed"
        ? "Choose the source file again to retry this failed item."
        : `Choose a new file to replace “${asset.caption || asset.originalFilename || "untitled media"}”.`,
    );
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => fileRef.current?.focus(), 250);
  }

  async function remove(asset: MediaAssetView) {
    if (uploadControlsLocked) return;
    if (
      !window.confirm(
        "Remove this unattached media file? Attached media must first be withdrawn from its coaching context.",
      )
    ) {
      return;
    }
    setRemovingId(asset.id);
    setMessage("");
    try {
      const response = await requestClientMutation(`/api/media/${encodeURIComponent(asset.id)}`, {
        method: "DELETE",
      });
      await requireClientMutationSuccess(
        response,
        "The media could not be removed.",
        [204],
      );
      setAssets((current) => current.filter((item) => item.id !== asset.id));
      setState("success");
      setMessage("The unattached file was removed from private storage.");
    } catch (error) {
      setState(
        isClientMutationOutcomeUnknown(error) ? "reload_required" : "error",
      );
      setMessage(
        clientMutationErrorMessage(
          error,
          "the media file was removed",
          "reload_before_retry",
          "The media could not be removed.",
        ),
      );
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Private coaching media</span>
          <h1>Media library</h1>
          <p>
            Upload once, then reuse a swing clip, image, or source CSV in coaching content.
            Roadmap never analyzes the swing or claims a live device integration.
          </p>
        </div>
        <a className={styles.primaryAction} href="#upload-media">
          Upload media
        </a>
      </header>

      {!configuration.ready ? (
        <section className={styles.configuration} role="status">
          <strong>Media upload is configuration ready — activation pending.</strong>
          <p>
            An approved upload policy is not configured. Text-first roadmaps remain fully
            available; no file limit or consent policy is being invented here.
          </p>
        </section>
      ) : (
        <section className={styles.uploadPanel} id="upload-media">
          <div className={styles.sectionHeading}>
            <div>
              <span className={styles.eyebrow}>{replacement ? "Replace or retry" : "New upload"}</span>
              <h2>{replacement ? "Choose the new source file" : "Add a private file"}</h2>
            </div>
            <span className={styles.limit}>
              Up to {formatBytes(configuration.maxBytes)} · video up to {formatDuration(configuration.maxVideoDurationMs)}
            </span>
          </div>
          {replacement ? (
            <div className={styles.replacementNotice}>
              <span>
                Replacing <strong>{replacement.caption || replacement.originalFilename || "untitled media"}</strong>
              </span>
              <button
                type="button"
                disabled={uploadControlsLocked}
                onClick={() => setReplacement(null)}
              >
                Cancel replacement
              </button>
            </div>
          ) : null}
          <form ref={formRef} className={styles.uploadForm} method="post" onSubmit={submit}>
            <label className={styles.fileField}>
              <span>Image, swing video, or source CSV</span>
              <input
                ref={fileRef}
                required
                name="file"
                type="file"
                accept={configuration.allowedMimeTypes.join(",")}
                disabled={uploadControlsLocked}
              />
              <small>The original stays private and is not published by uploading it.</small>
            </label>
            <div className={styles.twoColumns}>
              <label>
                <span>Accessible description</span>
                <input
                  required
                  maxLength={1000}
                  name="altText"
                  placeholder="Down-the-line swing at the range"
                  disabled={uploadControlsLocked}
                />
              </label>
              <label>
                <span>View or orientation label</span>
                <input
                  maxLength={160}
                  name="viewLabel"
                  placeholder="Down the line"
                  disabled={uploadControlsLocked}
                />
              </label>
              <label>
                <span>Captured date</span>
                <input
                  name="capturedAt"
                  type="date"
                  max={todayDate()}
                  disabled={uploadControlsLocked}
                />
              </label>
              <label>
                <span>Frame orientation</span>
                <select
                  name="orientation"
                  defaultValue="unknown"
                  disabled={uploadControlsLocked}
                >
                  <option value="unknown">Detect later / unknown</option>
                  <option value="landscape">Landscape</option>
                  <option value="portrait">Portrait</option>
                  <option value="square">Square</option>
                </select>
              </label>
            </div>
            <label>
              <span>Caption</span>
              <input
                maxLength={2000}
                name="caption"
                placeholder="Baseline 7-iron swing"
                disabled={uploadControlsLocked}
              />
            </label>
            <label>
              <span>Coach context</span>
              <textarea
                maxLength={2000}
                name="coachContext"
                rows={3}
                placeholder="What should the golfer notice, and why is this clip included?"
                disabled={uploadControlsLocked}
              />
            </label>
            <details className={styles.optionalFields}>
              <summary>Optional poster and transcript</summary>
              <label>
                <span>Video poster / thumbnail</span>
                <select
                  name="posterMediaAssetId"
                  defaultValue=""
                  disabled={uploadControlsLocked}
                >
                  <option value="">Use the video&apos;s first available frame</option>
                  {assets
                    .filter((asset) => asset.status === "ready" && asset.mediaKind === "image")
                    .map((asset) => (
                      <option key={asset.id} value={asset.id}>
                        {asset.caption || asset.originalFilename || asset.altText || "Untitled image"}
                      </option>
                    ))}
                </select>
                <small>
                  Upload a still image first, then select it here as this video&apos;s
                  private poster. The poster follows the video into published coaching content.
                </small>
              </label>
              <label>
                <span>Spoken-content transcript</span>
                <textarea
                  maxLength={20000}
                  name="transcript"
                  rows={4}
                  disabled={uploadControlsLocked}
                />
              </label>
            </details>
            <div className={styles.submitRow}>
              <button
                className={styles.primaryAction}
                disabled={uploadControlsLocked}
                type="submit"
              >
                {state === "measuring"
                  ? "Checking file…"
                  : state === "uploading"
                    ? `Uploading ${progress}%…`
                    : replacement
                      ? "Upload replacement"
                      : "Upload privately"}
              </button>
              {(state === "measuring" || state === "uploading") && (
                <progress aria-label="Upload progress" max={100} value={progress}>
                  {progress}%
                </progress>
              )}
            </div>
          </form>
        </section>
      )}

      {message ? (
        <p
          className={
            state === "error" || state === "reload_required"
              ? styles.errorMessage
              : styles.statusMessage
          }
          role={
            state === "error" || state === "reload_required"
              ? "alert"
              : "status"
          }
        >
          {message}
        </p>
      ) : null}

      {state === "reload_required" ? (
        <button
          className={styles.primaryAction}
          type="button"
          onClick={() => window.location.reload()}
        >
          Reload and inspect the media library
        </button>
      ) : null}

      <section aria-labelledby="library-heading">
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.eyebrow}>Reusable assets</span>
            <h2 id="library-heading">Your private library</h2>
          </div>
          <span className={styles.limit}>{assets.length} stored item{assets.length === 1 ? "" : "s"}</span>
        </div>
        {assets.length ? (
          <div className={styles.gallery}>
            {assets.map((asset) => (
              <article
                className={styles.assetCard}
                id={`media-asset-${asset.id}`}
                key={asset.id}
                data-status={asset.status}
                tabIndex={-1}
              >
                <MediaPreview asset={asset} />
                <div className={styles.assetBody}>
                  <div className={styles.assetTitleRow}>
                    <div>
                      <span className={styles.assetStatus}>{statusLabel(asset.status)}</span>
                      <h3>{asset.caption || asset.originalFilename || "Untitled media"}</h3>
                    </div>
                    <span className={styles.kind}>{asset.mediaKind}</span>
                  </div>
                  <p>{asset.altText || "No accessible description stored."}</p>
                  <dl className={styles.metadata}>
                    <div>
                      <dt>Captured</dt>
                      <dd>{asset.capturedAt ? formatDate(asset.capturedAt) : "Not recorded"}</dd>
                    </div>
                    <div>
                      <dt>View</dt>
                      <dd>{asset.viewLabel || asset.orientation}</dd>
                    </div>
                    <div>
                      <dt>File</dt>
                      <dd>{formatBytes(asset.byteSize)}</dd>
                    </div>
                    {asset.mediaKind === "video" ? (
                      <div>
                        <dt>Poster</dt>
                        <dd>{asset.posterMediaAssetId ? "Selected image" : "Video frame"}</dd>
                      </div>
                    ) : null}
                  </dl>
                  {asset.coachContext ? <p className={styles.context}>{asset.coachContext}</p> : null}
                  {asset.replacementMediaAssetId ? (
                    <p className={styles.replaced}>A newer replacement is stored. Existing published revisions remain explicit.</p>
                  ) : null}
                  {asset.failureCode ? (
                    <p className={styles.failure}>Upload failed: {humanizeCode(asset.failureCode)}. Choose the source file to retry.</p>
                  ) : null}
                  <div className={styles.cardActions}>
                    <button
                      type="button"
                      onClick={() => beginReplacement(asset)}
                      disabled={
                        uploadControlsLocked ||
                        Boolean(asset.replacementMediaAssetId)
                      }
                    >
                      {asset.status === "failed" ? "Retry upload" : "Replace"}
                    </button>
                    <button
                      className={styles.destructive}
                      type="button"
                      disabled={
                        uploadControlsLocked ||
                        removingId === asset.id
                      }
                      onClick={() => remove(asset)}
                    >
                      {removingId === asset.id ? "Removing…" : "Remove"}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <span aria-hidden="true">▶</span>
            <h3>No media yet</h3>
            <p>
              Add a clearly labelled synthetic or consented coaching file when it helps tell
              the golfer’s story. Media is always optional.
            </p>
            {configuration.ready ? <a href="#upload-media">Upload the first file</a> : null}
          </div>
        )}
      </section>
    </div>
  );
}

function MediaPreview({ asset }: { asset: ClientMediaAsset }) {
  if (asset.status !== "ready" || !asset.url) {
    return (
      <div className={styles.previewFallback} role="img" aria-label={`${statusLabel(asset.status)} media preview`}>
        <span aria-hidden="true">{asset.status === "failed" ? "!" : "…"}</span>
        <small>{statusLabel(asset.status)}</small>
      </div>
    );
  }
  if (asset.mediaKind === "image") {
    // Private, user-supplied media cannot be routed through an unauthenticated
    // image optimizer. Native dimensions are capped by CSS.
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={styles.preview} src={asset.url} alt={asset.altText || ""} loading="lazy" />;
  }
  if (asset.mediaKind === "video") {
    return (
      <video
        className={styles.preview}
        controls
        preload="metadata"
        poster={asset.posterUrl || undefined}
      >
        <source src={asset.url} type={asset.mimeType} />
        {asset.transcript || "This browser cannot play the private video."}
      </video>
    );
  }
  if (asset.mediaKind === "document") {
    return (
      <div className={styles.previewFallback} role="group" aria-label="Private source document">
        <strong>CSV / document</strong>
        <a href={asset.url} download={asset.originalFilename || undefined}>
          Download private source
        </a>
      </div>
    );
  }
  return <div className={styles.previewFallback}>Preview unavailable</div>;
}

async function measureMedia(file: File): Promise<{
  widthPixels: number | null;
  heightPixels: number | null;
  durationMs: number | null;
}> {
  const url = URL.createObjectURL(file);
  try {
    if (file.type.startsWith("image/")) {
      const image = document.createElement("img");
      const loaded = new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("The image could not be read. Choose a valid source file."));
      });
      image.src = url;
      await loaded;
      return {
        widthPixels: image.naturalWidth || null,
        heightPixels: image.naturalHeight || null,
        durationMs: null,
      };
    }
    if (file.type.startsWith("video/")) {
      const video = document.createElement("video");
      video.preload = "metadata";
      const loaded = new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error("The video metadata could not be read. Choose a valid source file."));
      });
      video.src = url;
      await loaded;
      const durationSeconds = await finiteVideoDuration(video);
      return {
        widthPixels: video.videoWidth || null,
        heightPixels: video.videoHeight || null,
        durationMs: Math.max(1, Math.round(durationSeconds * 1000)),
      };
    }
    if (file.type === "text/csv") {
      return { widthPixels: null, heightPixels: null, durationMs: null };
    }
    throw new Error("Choose a supported image, video, CSV, or document.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

const VIDEO_DURATION_RECOVERY_TIMEOUT_MS = 4_000;

async function finiteVideoDuration(video: HTMLVideoElement): Promise<number> {
  if (Number.isFinite(video.duration) && video.duration > 0) {
    return video.duration;
  }

  // MediaRecorder-style WebM files can be fully playable while initially
  // exposing an infinite duration. A bounded seek asks the browser to locate
  // the real end of the finite local Blob; durationchange then supplies the
  // value that is sent through the same server-side duration policy.
  return new Promise<number>((resolve, reject) => {
    let timer = 0;
    const events = ["durationchange", "seeked", "timeupdate"] as const;
    const cleanup = () => {
      window.clearTimeout(timer);
      for (const eventName of events) {
        video.removeEventListener(eventName, settle);
      }
    };
    const fail = () => {
      cleanup();
      reject(new Error("The video duration could not be verified."));
    };
    const settle = () => {
      if (!Number.isFinite(video.duration) || video.duration <= 0) return;
      const duration = video.duration;
      cleanup();
      try {
        video.currentTime = 0;
      } catch {
        // The recovered finite duration remains valid if resetting the
        // detached metadata element is unsupported by this browser.
      }
      resolve(duration);
    };

    for (const eventName of events) {
      video.addEventListener(eventName, settle);
    }
    timer = window.setTimeout(fail, VIDEO_DURATION_RECOVERY_TIMEOUT_MS);
    try {
      video.currentTime = Number.MAX_SAFE_INTEGER;
    } catch {
      fail();
    }
  });
}

async function uploadWithProgress(
  body: Blob,
  onProgress: (value: number) => void,
): Promise<ClientMediaAsset> {
  const response = await requestClientUpload("/api/media", body, {
    onProgress,
    timeoutMs: clientMediaUploadTimeoutMs(body.size),
  });
  const value = await requireClientMutationJson<{ asset: ClientMediaAsset }>(
    response,
    isUploadResponse,
    "The upload did not finish. Check the file and try again.",
  );
  return withPrivateUrl(value.asset);
}

function formText(form: FormData, field: string): string | null {
  const value = form.get(field);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

type CapturedMediaUploadFields = Omit<
  MediaUploadFields,
  "durationMs" | "heightPixels" | "widthPixels"
>;

function captureMediaUploadFields(
  formElement: HTMLFormElement,
  file: File,
  replacement: MediaAssetView | null,
): CapturedMediaUploadFields {
  const form = new FormData(formElement);
  const altText = formText(form, "altText");
  if (!altText) {
    throw new Error("Describe the media for people who cannot view it.");
  }
  const orientation = formText(form, "orientation") ?? "unknown";
  if (!isMediaOrientation(orientation)) {
    throw new Error("Choose a valid frame orientation.");
  }
  const posterMediaAssetId = formText(form, "posterMediaAssetId");
  if (posterMediaAssetId && !file.type.startsWith("video/")) {
    throw new Error("A poster image can be selected only when uploading a video.");
  }

  return Object.freeze({
    altText,
    caption: formText(form, "caption"),
    capturedAt: formText(form, "capturedAt"),
    coachContext: formText(form, "coachContext"),
    orientation,
    posterMediaAssetId,
    replacementForAssetId: replacement?.id ?? null,
    replacementReason: replacement
      ? replacement.status === "failed"
        ? "processing_retry"
        : "coach_replaced"
      : null,
    transcript: formText(form, "transcript"),
    viewLabel: formText(form, "viewLabel"),
  });
}

function isMediaOrientation(
  value: string,
): value is MediaUploadMetadata["orientation"] {
  return ["landscape", "portrait", "square", "unknown"].includes(value);
}

function isUploadResponse(value: unknown): value is { asset: ClientMediaAsset } {
  if (!value || typeof value !== "object" || !("asset" in value)) return false;
  const asset = value.asset;
  return Boolean(asset && typeof asset === "object" && "id" in asset && typeof asset.id === "string");
}

function withPrivateUrl(asset: MediaAssetView): ClientMediaAsset {
  return {
    ...asset,
    url: asset.status === "ready" ? `/api/media/${encodeURIComponent(asset.id)}` : null,
    posterUrl: asset.posterMediaAssetId
      ? `/api/media/${encodeURIComponent(asset.posterMediaAssetId)}`
      : null,
  };
}

function statusLabel(status: MediaAssetView["status"]): string {
  return {
    pending: "Processing",
    ready: "Ready",
    failed: "Needs retry",
    quarantined: "Unavailable",
    deleted: "Removed",
  }[status];
}

function humanizeCode(value: string): string {
  return value.replaceAll("_", " ");
}

function formatBytes(value: number): string {
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(value >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
}

function formatDuration(value: number): string {
  const seconds = Math.round(value / 1000);
  if (seconds < 60) return `${seconds} seconds`;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function formatDate(value: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}
