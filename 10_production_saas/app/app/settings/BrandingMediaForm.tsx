"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  clientMutationErrorMessage,
  requestClientMutation,
  requireClientMutationJson,
} from "@/lib/client-mutation-recovery";
import {
  clientMediaUploadTimeoutMs,
  requestClientUpload,
} from "@/lib/client-upload-recovery";
import { createMediaUploadBody } from "@/lib/media-upload-protocol";
import styles from "./branding.module.css";

type BrandingRole = "logo" | "profile_photo";

type ImageAsset = Readonly<{
  id: string;
  label: string;
  altText: string;
  url: string;
}>;

type CurrentBranding = Readonly<{
  logo: Readonly<{ mediaAssetId: string; attachmentId: string | null }> | null;
  profilePhoto: Readonly<{ mediaAssetId: string; attachmentId: string | null }> | null;
}>;

export function BrandingMediaForm({
  accentColor,
  businessName,
  assets,
  current,
}: {
  accentColor: string;
  businessName: string;
  assets: ImageAsset[];
  current: CurrentBranding;
}) {
  const router = useRouter();
  const previewUrlRef = useRef<string | null>(null);
  const [role, setRole] = useState<BrandingRole>("logo");
  const [source, setSource] = useState<"upload" | "library">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [libraryId, setLibraryId] = useState(assets[0]?.id ?? "");
  const [zoom, setZoom] = useState(1);
  const [horizontal, setHorizontal] = useState(0);
  const [vertical, setVertical] = useState(0);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error" | "reload_required">("idle");
  const [message, setMessage] = useState("");

  useEffect(
    () => () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    },
    [],
  );

  function selectFile(nextFile: File | null) {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    const nextUrl = nextFile ? URL.createObjectURL(nextFile) : null;
    previewUrlRef.current = nextUrl;
    setFile(nextFile);
    setPreviewUrl(nextUrl);
  }

  const selectedLibraryAsset = useMemo(
    () => assets.find((asset) => asset.id === libraryId) ?? null,
    [assets, libraryId],
  );
  const selectedPreview = source === "upload" ? previewUrl : selectedLibraryAsset?.url ?? null;
  const currentLogo = current.logo
    ? assets.find((asset) => asset.id === current.logo?.mediaAssetId) ?? null
    : null;
  const currentPhoto = current.profilePhoto
    ? assets.find((asset) => asset.id === current.profilePhoto?.mediaAssetId) ?? null
    : null;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "saving" || state === "reload_required") return;
    setState("saving");
    setMessage("");
    try {
      let mediaAssetId = libraryId;
      if (source === "upload") {
        if (!file) throw new Error("Choose an image to crop and upload.");
        const altText = new FormData(event.currentTarget).get("altText");
        if (typeof altText !== "string" || !altText.trim()) {
          throw new Error("Describe the branding image for people who cannot see it.");
        }
        const cropped = await cropImage(file, role, zoom, horizontal, vertical);
        const uploadBody = await createMediaUploadBody(cropped, {
          altText: altText.trim(),
          caption:
            role === "logo"
              ? `${businessName} logo`
              : `${businessName} coach photo`,
          capturedAt: null,
          coachContext: null,
          durationMs: null,
          heightPixels: role === "logo" ? 300 : 600,
          orientation: role === "logo" ? "landscape" : "square",
          posterMediaAssetId: null,
          replacementForAssetId: null,
          replacementReason: null,
          transcript: null,
          viewLabel: null,
          widthPixels: role === "logo" ? 900 : 600,
        });
        const upload = await requestClientUpload("/api/media", uploadBody, {
          timeoutMs: clientMediaUploadTimeoutMs(uploadBody.size),
        });
        const uploaded = await requireClientMutationJson<{ asset: { id: string } }>(
          upload,
          (value) =>
            Boolean(
              value &&
                typeof value === "object" &&
                "asset" in value &&
                value.asset &&
                typeof value.asset === "object" &&
                "id" in value.asset &&
                typeof value.asset.id === "string",
            ),
          "The cropped image could not be uploaded.",
        );
        mediaAssetId = uploaded.asset.id;
      }
      if (!mediaAssetId) throw new Error("Choose an image from the private library.");
      const response = await requestClientMutation("/api/profile/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaAssetId, role }),
      });
      await requireClientMutationJson(
        response,
        (value) =>
          Boolean(
            value &&
              typeof value === "object" &&
              "attachment" in value &&
              value.attachment &&
              typeof value.attachment === "object" &&
              "mediaAssetId" in value.attachment &&
              value.attachment.mediaAssetId === mediaAssetId,
          ),
        "The branding image could not be selected.",
      );
      setState("saved");
      setMessage("Branding saved. Existing private links were revoked so each affected roadmap can be reviewed and republished deliberately.");
      router.refresh();
    } catch (error) {
      const uncertain =
        error instanceof Error && error.name === "ClientMutationOutcomeUnknownError";
      setState(uncertain ? "reload_required" : "error");
      setMessage(
        clientMutationErrorMessage(
          error,
          "the branding image was saved",
          "reload_before_retry",
          "The branding image could not be saved.",
        ),
      );
    }
  }

  async function remove(item: CurrentBranding["logo"], label: string) {
    if (!item?.attachmentId || state === "saving" || state === "reload_required") return;
    if (!window.confirm(`Remove the current ${label}? Affected roadmaps will require review and republishing.`)) return;
    setState("saving");
    setMessage("");
    try {
      const response = await requestClientMutation("/api/profile/media", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attachmentId: item.attachmentId,
          confirmation: "remove_profile_media",
        }),
      });
      await requireClientMutationJson(
        response,
        (value) =>
          Boolean(
            value &&
              typeof value === "object" &&
              "withdrawn" in value &&
              value.withdrawn === true,
          ),
        `The ${label} could not be removed.`,
      );
      setState("saved");
      setMessage(`The ${label} was removed. Review affected roadmaps before republishing.`);
      router.refresh();
    } catch (error) {
      const uncertain = error instanceof Error && error.name === "ClientMutationOutcomeUnknownError";
      setState(uncertain ? "reload_required" : "error");
      setMessage(
        clientMutationErrorMessage(
          error,
          `the ${label} was removed`,
          "reload_before_retry",
          `The ${label} could not be removed.`,
        ),
      );
    }
  }

  return (
    <section className={styles.card} aria-labelledby="branding-heading">
      <div className={styles.heading}>
        <div>
          <span>Optional branding</span>
          <h2 id="branding-heading">Logo, coach photo, and live preview</h2>
        </div>
        <a href="/app/media">Open media library</a>
      </div>
      <p className={styles.intro}>
        Crop a private image here or reuse one already uploaded. Branding is optional and
        stays within Roadmap’s restrained layout.
      </p>
      <div className={styles.currentGrid}>
        <BrandPreview
          accentColor={accentColor}
          businessName={businessName}
          label="Current logo"
          image={currentLogo}
          role="logo"
        />
        <BrandPreview
          accentColor={accentColor}
          businessName={businessName}
          label="Current coach photo"
          image={currentPhoto}
          role="profile_photo"
        />
      </div>
      <div className={styles.removeRow}>
        {current.logo?.attachmentId ? (
          <button type="button" onClick={() => remove(current.logo, "logo")}>Remove logo</button>
        ) : null}
        {current.profilePhoto?.attachmentId ? (
          <button type="button" onClick={() => remove(current.profilePhoto, "coach photo")}>Remove coach photo</button>
        ) : null}
      </div>

      <form className={styles.form} method="post" onSubmit={save}>
        <fieldset disabled={state === "saving" || state === "reload_required"}>
          <legend>Choose one branding slot</legend>
          <div className={styles.choiceRow}>
            <label><input type="radio" name="role" checked={role === "logo"} onChange={() => setRole("logo")} /> Logo (3:1)</label>
            <label><input type="radio" name="role" checked={role === "profile_photo"} onChange={() => setRole("profile_photo")} /> Coach photo (square)</label>
          </div>
        </fieldset>
        <fieldset disabled={state === "saving" || state === "reload_required"}>
          <legend>Choose the source</legend>
          <div className={styles.choiceRow}>
            <label><input type="radio" name="source" checked={source === "upload"} onChange={() => setSource("upload")} /> Upload and crop</label>
            <label><input type="radio" name="source" checked={source === "library"} onChange={() => setSource("library")} disabled={!assets.length} /> Reuse library image</label>
          </div>
        </fieldset>
        {source === "upload" ? (
          <div className={styles.cropEditor}>
            <label>
              Image file
              <input required type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => selectFile(event.target.files?.[0] ?? null)} />
            </label>
            <label>
              Accessible description
              <input name="altText" required maxLength={1000} placeholder={role === "logo" ? `${businessName} logo` : `Portrait of ${businessName}`} />
            </label>
            <div className={role === "logo" ? styles.wideCrop : styles.squareCrop}>
              {selectedPreview ? (
                // Local object URLs and authenticated image URLs are not optimizer inputs.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selectedPreview}
                  alt="Crop preview"
                  style={{
                    objectPosition: `${50 + horizontal / 2}% ${50 + vertical / 2}%`,
                    transform: `scale(${zoom})`,
                  }}
                />
              ) : <span>Choose an image to preview the crop</span>}
            </div>
            <div className={styles.sliderGrid}>
              <label>Zoom <input type="range" min="1" max="3" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label>
              <label>Horizontal <input type="range" min="-100" max="100" value={horizontal} onChange={(event) => setHorizontal(Number(event.target.value))} /></label>
              <label>Vertical <input type="range" min="-100" max="100" value={vertical} onChange={(event) => setVertical(Number(event.target.value))} /></label>
            </div>
          </div>
        ) : (
          <label className={styles.libraryPicker}>
            Private library image
            <select value={libraryId} onChange={(event) => setLibraryId(event.target.value)} required>
              {assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.label}</option>)}
            </select>
          </label>
        )}
        <div className={styles.livePreview} style={{ "--preview-accent": accentColor } as React.CSSProperties}>
          {selectedPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={selectedPreview} alt="" />
          ) : <span aria-hidden="true">{initials(businessName)}</span>}
          <div><small>Private coaching plan</small><strong>{businessName}</strong></div>
        </div>
        <button className={styles.primary} type="submit" disabled={state === "saving" || state === "reload_required"}>
          {state === "saving" ? "Saving branding…" : "Save selected branding"}
        </button>
      </form>
      {message ? <p className={state === "error" || state === "reload_required" ? styles.error : styles.status} role={state === "error" || state === "reload_required" ? "alert" : "status"}>{message}</p> : null}
      {state === "reload_required" ? <button className={styles.reload} type="button" onClick={() => window.location.reload()}>Reload authoritative branding</button> : null}
    </section>
  );
}

function BrandPreview({
  accentColor,
  businessName,
  label,
  image,
  role,
}: {
  accentColor: string;
  businessName: string;
  label: string;
  image: ImageAsset | null;
  role: BrandingRole;
}) {
  return (
    <article style={{ "--preview-accent": accentColor } as React.CSSProperties}>
      <small>{label}</small>
      <div className={role === "logo" ? styles.currentLogo : styles.currentPhoto}>
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image.url} alt={image.altText} />
        ) : <span aria-hidden="true">{initials(businessName)}</span>}
      </div>
      <strong>{image?.label || "Not added — Roadmap initials are used"}</strong>
    </article>
  );
}

async function cropImage(
  file: File,
  role: BrandingRole,
  zoom: number,
  horizontal: number,
  vertical: number,
): Promise<File> {
  const image = await loadImage(file);
  const width = role === "logo" ? 900 : 600;
  const height = role === "logo" ? 300 : 600;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot prepare an image crop.");
  const baseScale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const scale = baseScale * zoom;
  const drawnWidth = image.naturalWidth * scale;
  const drawnHeight = image.naturalHeight * scale;
  const xRange = Math.max(0, drawnWidth - width);
  const yRange = Math.max(0, drawnHeight - height);
  const x = -xRange * ((horizontal + 100) / 200);
  const y = -yRange * ((vertical + 100) / 200);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, x, y, drawnWidth, drawnHeight);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png", 0.92));
  if (!blob) throw new Error("The cropped image could not be prepared.");
  return new File([blob], role === "logo" ? "roadmap-logo.png" : "roadmap-coach-photo.png", { type: "image/png" });
}

async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const image = document.createElement("img");
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("The selected image could not be read."));
    });
    image.src = url;
    await loaded;
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function initials(value: string): string {
  return value.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}
