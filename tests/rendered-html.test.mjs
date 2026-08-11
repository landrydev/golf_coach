import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

register(new URL("./support/cloudflare-loader.mjs", import.meta.url));

async function fetchBuiltApp(path = "/", init = {}) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${Math.random()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(new URL(path, "https://roadmap.example"), init),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Roadmap acquisition page and synthetic example", async () => {
  const response = await fetchBuiltApp();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="en-CA">/i);
  assert.match(
    html,
    /<title>Roadmap \| Coach-branded golf development roadmaps<\/title>/i,
  );
  assert.match(html, /rel="icon" href="[^"]*\/favicon\.svg"/i);
  assert.match(html, /For independent golf instructors across Canada/i);
  assert.match(html, /Sell the plan, not another hour\./i);
  assert.match(html, /Start your first roadmap/i);
  assert.match(html, /Synthetic sample/i);
  assert.match(html, /Maya Bennett, Mark Chen[^<]+fictional/i);
  assert.match(html, /This is not a customer result\./i);
  assert.match(html, /does not promise a package sale/i);
  assert.match(html, /Does Roadmap handle booking or payment\?/i);
  assert.match(html, /Roadmap explains the recommendation and then hands the golfer/i);

  assert.doesNotMatch(html, /codex-preview|Building your site|taking shape/i);
  assert.doesNotMatch(
    html,
    /(?:\$\s*75|CAD\s*75)(?:\.00)?(?:\s*\/\s*month|\s+per month)/i,
  );
  assert.doesNotMatch(html, /ASSUMPTION-DRIVEN LOCAL PROTOTYPE/i);
});

test("public HTML exposes a coherent semantic entry path", async () => {
  const response = await fetchBuiltApp();
  const html = await response.text();

  assert.match(html, /<a class="skip-link" href="#main-content">/i);
  assert.match(html, /<main id="main-content">/i);
  assert.equal((html.match(/<h1\b/gi) ?? []).length, 1);
  assert.match(html, /<nav[^>]+aria-label="Main navigation"/i);
  const viewport = html.match(/<meta name="viewport" content="([^"]+)"/i)?.[1] ?? "";
  assert.match(viewport, /\bwidth=device-width\b/i);
  assert.match(viewport, /\binitial-scale=1\b/i);
  assert.match(html, /href="#how-it-works"/i);
  assert.match(html, /href="#sample"/i);
  assert.match(html, /href="#pricing"/i);
  assert.match(html, /<a[^>]+href="\/auth\/login\?return_to=%2Fapp"/i);
  assert.doesNotMatch(html, /href="\/app"/i);
  assert.match(html, /<meta name="robots" content="index, follow"/i);
  assert.match(html, /property="og:locale" content="en_CA"/i);
  assert.match(html, /https:\/\/roadmap\.example\/og\.png/i);
});

test("production responses apply the selected baseline security headers", async () => {
  const response = await fetchBuiltApp();
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("cross-origin-opener-policy"), "same-origin");
  assert.equal(response.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.equal(
    response.headers.get("strict-transport-security"),
    "max-age=31536000; includeSubDomains",
  );
  assert.match(response.headers.get("permissions-policy") ?? "", /camera=\(\)/);
  assert.match(response.headers.get("permissions-policy") ?? "", /payment=\(self\)/);

  const policy = response.headers.get("content-security-policy") ?? "";
  assert.match(policy, /default-src 'self'/);
  assert.match(policy, /frame-ancestors 'none'/);
  assert.match(policy, /object-src 'none'/);
  assert.match(policy, /form-action 'self'/);
  assert.match(policy, /connect-src 'self'/);
  assert.match(policy, /frame-src 'none'/);
  assert.doesNotMatch(policy, /api\.stripe\.com|checkout\.stripe\.com|billing\.stripe\.com/);
  assert.match(policy, /upgrade-insecure-requests/);
});

test("public privacy, terms, and support routes render their bounded responsibilities", async () => {
  const [privacyResponse, termsResponse, supportResponse] = await Promise.all([
    fetchBuiltApp("/privacy"),
    fetchBuiltApp("/terms"),
    fetchBuiltApp("/support"),
  ]);
  for (const response of [privacyResponse, termsResponse, supportResponse]) {
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  }

  const [privacy, terms, support] = await Promise.all([
    privacyResponse.text(),
    termsResponse.text(),
    supportResponse.text(),
  ]);
  assert.match(privacy, /<title>Privacy notice \| Roadmap<\/title>/i);
  assert.match(privacy, /Access, correction, withdrawal, and questions/i);
  assert.match(privacy, /initial product is adults-only/i);
  assert.match(privacy, /Private links are bearer credentials/i);

  assert.match(terms, /<title>Terms of use \| Roadmap<\/title>/i);
  assert.match(terms, /Roadmap does not autonomously diagnose/i);
  assert.match(terms, /Coach-package transactions are between the instructor and golfer/i);
  assert.match(terms, /SaaS subscription is separate from an instructor[^<]+coaching packages/i);

  assert.match(support, /<title>Support \| Roadmap<\/title>/i);
  assert.match(support, /For instructors/i);
  assert.match(support, /For golfers/i);
  assert.match(support, /Never send a password, card number, production secret, full private link/i);
});

test("private instructor routes are explicitly non-cacheable and non-indexable", async () => {
  const response = await fetchBuiltApp("/app");
  const cacheControl = response.headers.get("cache-control") ?? "";
  assert.match(cacheControl, /private/i);
  assert.match(cacheControl, /no-store/i);
  assert.match(cacheControl, /max-age=0/i);
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(
    response.headers.get("x-robots-tag"),
    "noindex, nofollow, noarchive",
  );
});
