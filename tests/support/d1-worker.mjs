import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Miniflare } from "miniflare";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const serverRoot = resolve(projectRoot, "dist/server");

export const testOrigin = "https://roadmap.test";

const TEST_OWNER_ACCESS_PEPPER =
  "synthetic-owner-access-pepper-for-tests-only-2026-08-07";
const TEST_OWNER_EMAIL_DIGESTS = [
  "f39ac1742ba2cd9a074d8b9e1749a0f27d68867b012a4c412f1d74392ca0ddee",
  "64b324c39c650e97d7ae285e733f72de0c663e85dcda9eb073ccbfebeb546ed0",
  "47590e495c47269d2f0974139289fe0cf88b1c2a808d821ee971cc156908ddff",
  "272f4b94a240649612ff0c31e7f1d96475fe9cdc376a4472ef2a89ef251268bd",
  "407db0a81b1552eb43f7726f2608d79d82b83681106bf13a20bea6ec36e1e301",
  "cd30b063aee679470878e7c1b550c4eefb6a27d2ecec097c4e51fe343ff0f6ef",
  "0b7bb0ebde3cf931a8c2c76cbce9b1ab5f66415d13dae9531b7c7114862abd75",
];

export async function startD1Worker(bindingOverrides = {}, runtimeOptions = {}) {
  const common = {
    compatibilityDate: "2026-08-07",
    compatibilityFlags: ["nodejs_compat"],
    bindings: {
      APP_URL: testOrigin,
      SHARE_TOKEN_PEPPER:
        "synthetic-local-critical-journey-pepper-2026-08-07",
      ABUSE_LIMIT_PEPPER:
        "synthetic-local-abuse-limit-pepper-2026-08-07",
      INSTRUCTOR_ACCESS_MODE: "owner_private",
      OWNER_PRIVATE_ACCESS_PEPPER: TEST_OWNER_ACCESS_PEPPER,
      OWNER_PRIVATE_EMAIL_DIGESTS: TEST_OWNER_EMAIL_DIGESTS.join(","),
      ...bindingOverrides,
    },
    d1Databases: { DB: "roadmap-critical-journey" },
    r2Buckets: { MEDIA: "roadmap-critical-journey-media" },
    ...(runtimeOptions.outboundService
      ? { outboundService: runtimeOptions.outboundService }
      : {}),
    ...(runtimeOptions.triggerHandlers
      ? { unsafeTriggerHandlers: true }
      : {}),
  };
  const miniflare = new Miniflare({
    ...common,
    modules: true,
    script: SETUP_WORKER,
  });

  try {
    const journal = JSON.parse(
      await readFile(resolve(projectRoot, "drizzle/meta/_journal.json"), "utf8"),
    );
    const migrations = await Promise.all(
      [...journal.entries]
        .sort((left, right) => left.idx - right.idx)
        .filter(
          (entry) =>
            runtimeOptions.migrationThroughIndex === undefined ||
            entry.idx <= runtimeOptions.migrationThroughIndex,
        )
        .map((entry) =>
          readFile(resolve(projectRoot, `drizzle/${entry.tag}.sql`), "utf8"),
        ),
    );
    const statements = migrations.flatMap((migration) =>
      migration
        .split("--> statement-breakpoint")
        .map((sql) => sql.trim())
        .filter(Boolean),
    );
    const setupResponse = await miniflare.dispatchFetch(
      new URL("/__setup", testOrigin),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(statements),
      },
    );
    if (!setupResponse.ok) {
      throw new Error(`D1 migration failed: ${await setupResponse.text()}`);
    }

    const discoveredModules = await walkServerModules(serverRoot);
    const modulePaths = [
      "index.js",
      ...discoveredModules.filter((path) => path !== "index.js").sort(),
    ];
    const appOptions = {
      ...common,
      rootPath: serverRoot,
      modulesRoot: serverRoot,
      modules: modulePaths.map((path) => ({ type: "ESModule", path })),
    };
    await miniflare.setOptions(appOptions);

    return {
      dispatch(path, init = {}) {
        const headers = new Headers(init.headers);
        if (!headers.has("cf-connecting-ip")) {
          headers.set("cf-connecting-ip", "192.0.2.10");
        }
        return miniflare.dispatchFetch(new URL(path, testOrigin), {
          ...init,
          headers,
        });
      },
      dispatchScheduled(cron = "*/5 * * * *") {
        return miniflare.dispatchFetch(
          new URL(
            `/cdn-cgi/local/scheduled?cron=${encodeURIComponent(cron)}`,
            testOrigin,
          ),
        );
      },
      database() {
        return miniflare.getD1Database("DB");
      },
      async inspect(queries) {
        await miniflare.setOptions({
          ...common,
          modules: true,
          script: INSPECT_WORKER,
        });
        try {
          const response = await miniflare.dispatchFetch(
            new URL("/__inspect", testOrigin),
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(queries),
            },
          );
          if (!response.ok) {
            throw new Error(`D1 inspection failed: ${await response.text()}`);
          }
          return await response.json();
        } finally {
          await miniflare.setOptions(appOptions);
        }
      },
      dispose() {
        return miniflare.dispose();
      },
    };
  } catch (error) {
    await miniflare.dispose();
    throw error;
  }
}

async function walkServerModules(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkServerModules(absolutePath)));
    } else if (/\.(?:m?js)$/.test(entry.name)) {
      files.push(relative(serverRoot, absolutePath).replaceAll("\\", "/"));
    }
  }
  return files;
}

const SETUP_WORKER = `
export default {
  async fetch(request, env) {
    const statements = await request.json();
    await env.DB.batch(statements.map((sql) => env.DB.prepare(sql)));
    return new Response("ok");
  },
};`;

const INSPECT_WORKER = `
export default {
  async fetch(request, env) {
    const queries = await request.json();
    const results = await env.DB.batch(
      queries.map(({ sql, params = [] }) => env.DB.prepare(sql).bind(...params)),
    );
    return Response.json(results);
  },
};`;

export function identityHeaders(email, fullName) {
  return {
    "oai-authenticated-user-email": email,
    "oai-authenticated-user-full-name": encodeURIComponent(fullName),
    "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
  };
}

export function writeHeaders(email, fullName) {
  return {
    ...identityHeaders(email, fullName),
    "content-type": "application/json",
    origin: testOrigin,
    "sec-fetch-site": "same-origin",
  };
}
