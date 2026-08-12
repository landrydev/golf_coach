import assert from "node:assert/strict";
import { register } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

register(new URL("./support/cloudflare-loader.mjs", import.meta.url));

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("the production Worker keeps internal prerender routes disabled", async (context) => {
  const previousPrerenderFlag = process.env.VINEXT_PRERENDER;
  process.env.VINEXT_PRERENDER = "1";
  context.after(() => {
    if (previousPrerenderFlag === undefined) {
      delete process.env.VINEXT_PRERENDER;
    } else {
      process.env.VINEXT_PRERENDER = previousPrerenderFlag;
    }
  });

  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set(
    "test",
    `prerender-worker-${process.pid}-${Date.now()}-${Math.random()}`,
  );
  const { default: worker } = await import(workerUrl.href);

  for (const route of [
    "/__vinext/prerender",
    "/__vinext/prerender/static-params?pattern=%2F",
    "/__vinext/prerender/pages-static-paths?pattern=%2F",
    "/%5f%5fvinext%2fprerender%2fstatic-params?pattern=%2F",
    "/%255f%255fvinext%252fprerender%252fstatic-params?pattern=%2F",
    "/__vinext%5cprerender%5cstatic-params?pattern=%2F",
  ]) {
    for (const headers of [
      {},
      { "x-vinext-prerender-secret": "synthetic-invalid-value" },
    ]) {
      const response = await worker.fetch(
        new Request(new URL(route, "https://roadmap.example"), { headers }),
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
      assert.equal(response.status, 404);
    }
  }
});

test("the packaged Node server rejects missing and invalid prerender credentials", async (context) => {
  const { startProdServer } = await import(
    "../node_modules/vinext/dist/server/prod-server.js"
  );
  const handle = await startProdServer({
    port: 0,
    host: "127.0.0.1",
    outDir: path.join(projectRoot, "dist"),
    noCompression: true,
  });
  context.after(
    () =>
      new Promise((resolve, reject) =>
        handle.server.close((error) => (error ? reject(error) : resolve())),
      ),
  );

  for (const headers of [
    {},
    { "x-vinext-prerender-secret": "synthetic-invalid-value" },
  ]) {
    const response = await fetch(
      `http://127.0.0.1:${handle.port}/__vinext/prerender/static-params?pattern=%2F`,
      { headers },
    );
    assert.equal(response.status, 403);
    assert.equal(await response.text(), "Forbidden");
  }
});
