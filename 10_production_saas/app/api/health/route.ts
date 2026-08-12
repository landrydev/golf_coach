export const dynamic = "force-dynamic";

/**
 * Cheap public liveness only. Dependency and configuration readiness is
 * intentionally owner-only at /api/operations/health so public polling cannot
 * amplify D1/R2 work or expose a configuration oracle.
 */
export async function GET() {
  return Response.json(
    {
      status: "live",
      releaseId: publicReleaseId(process.env.RELEASE_ID),
    },
    {
      headers: {
        "Cache-Control": "public, max-age=30, stale-while-revalidate=30",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
      },
    },
  );
}

function publicReleaseId(value: string | undefined): string {
  const candidate = value?.trim() || "unversioned";
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(candidate)
    ? candidate
    : "invalid_release_id";
}
