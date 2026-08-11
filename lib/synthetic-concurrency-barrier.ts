import { env } from "cloudflare:workers";

type SyntheticConcurrencyBarrierEnvironment = {
  APP_URL?: string;
  SYNTHETIC_CONCURRENCY_BARRIER_MODE?: string;
  SYNTHETIC_CONCURRENCY_BARRIER?: Fetcher;
};

const SYNTHETIC_TEST_ORIGIN = "https://roadmap-test.chatgpt.site";
const SYNTHETIC_BARRIER_MODE = "local-miniflare-race-tests-v1";

/**
 * Provides deterministic interleavings for local Miniflare race tests. The
 * hook is inert unless both the synthetic `.test` origin and an internal
 * service binding are deliberately supplied by the test harness; no deployed
 * environment documents or configures either switch.
 */
export async function pauseAtSyntheticConcurrencyBarrier(
  checkpoint: string,
): Promise<void> {
  const environment = activeSyntheticEnvironment();
  if (!environment) return;

  const response = await environment.SYNTHETIC_CONCURRENCY_BARRIER.fetch(
    new Request(
      `${SYNTHETIC_TEST_ORIGIN}/__synthetic_concurrency_barrier/${encodeURIComponent(checkpoint)}`,
      { method: "POST" },
    ),
  );
  if (!response.ok) {
    throw new Error("The synthetic concurrency barrier failed.");
  }
}

/**
 * Consumes a deliberately armed one-shot fault from the same local-only
 * service seam used for deterministic race barriers. Deployed environments
 * cannot activate this without all three exact synthetic controls.
 */
export async function consumeSyntheticConcurrencyFault(
  checkpoint: string,
  scope: string,
): Promise<boolean> {
  const environment = activeSyntheticEnvironment();
  if (!environment) return false;
  const response = await environment.SYNTHETIC_CONCURRENCY_BARRIER.fetch(
    new Request(
      `${SYNTHETIC_TEST_ORIGIN}/__synthetic_concurrency_fault/${encodeURIComponent(checkpoint)}?scope=${encodeURIComponent(scope)}`,
      { method: "POST" },
    ),
  );
  if (!response.ok) {
    throw new Error("The synthetic concurrency fault controller failed.");
  }
  return response.headers.get("x-roadmap-synthetic-fault") === "inject";
}

function activeSyntheticEnvironment():
  | (SyntheticConcurrencyBarrierEnvironment & {
      SYNTHETIC_CONCURRENCY_BARRIER: Fetcher;
    })
  | null {
  const environment = env as unknown as SyntheticConcurrencyBarrierEnvironment;
  if (
    environment.APP_URL !== SYNTHETIC_TEST_ORIGIN ||
    environment.SYNTHETIC_CONCURRENCY_BARRIER_MODE !== SYNTHETIC_BARRIER_MODE ||
    !environment.SYNTHETIC_CONCURRENCY_BARRIER
  ) {
    return null;
  }
  return environment as SyntheticConcurrencyBarrierEnvironment & {
    SYNTHETIC_CONCURRENCY_BARRIER: Fetcher;
  };
}
