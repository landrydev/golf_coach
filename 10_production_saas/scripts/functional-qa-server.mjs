import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  startD1Worker,
  testOrigin,
  writeHeaders,
} from "../tests/support/d1-worker.mjs";
import {
  createFunctionalQaFixtureRegistry,
  FUNCTIONAL_QA_SCENARIOS,
  functionalQaWorkerBindings,
  isFunctionalQaScenario,
} from "./functional-qa-fixtures.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = resolve(dirname(scriptPath), "..");
const clientRoot = resolve(projectRoot, "dist/client");
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 4175;
const QA_SCENARIO_COOKIE = "roadmap_qa_scenario";
const STATIC_FILE = /\.(?:avif|css|gif|ico|jpe?g|js|json|png|svg|webp|woff2?)$/i;

export async function startFunctionalQaServer(options = {}) {
  const host = options.host ?? DEFAULT_HOST;
  const requestedPort = options.port ?? configuredPort();
  const mediaStorageFaults =
    options.mediaStorageFaultController ?? createMediaStorageFaultController();
  const mediaStorageFaultsEnabled =
    !options.worker || Boolean(options.mediaStorageFaultController);
  const worker =
    options.worker ??
    (await startD1Worker(functionalQaWorkerBindings(), {
      concurrencyBarrier: mediaStorageFaults.handler,
    }));
  const ownsWorker = !options.worker;
  const richFixtureHooks = [
    ...(options.richFixtureHooks ?? []),
    ...(await configuredRichFixtureHooks(options.richFixtureModule)),
  ];
  const fixtures = createFunctionalQaFixtureRegistry({ worker, richFixtureHooks });

  try {
    for (const scenarioId of options.eagerScenarios ?? ["standard"]) {
      await fixtures.get(scenarioId);
    }
  } catch (error) {
    if (ownsWorker) await worker.dispose();
    throw error;
  }

  let browserOrigin = `http://${host}:${requestedPort}`;
  const server = createServer((request, response) => {
    void handleRequest({
      request,
      response,
      browserOrigin,
      fixtures,
      worker,
      mediaStorageFaults,
      mediaStorageFaultsEnabled,
    });
  });

  try {
    await listen(server, requestedPort, host);
  } catch (error) {
    if (ownsWorker) await worker.dispose();
    throw error;
  }
  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : requestedPort;
  browserOrigin = `http://${host}:${actualPort}`;

  let closed = false;
  return Object.freeze({
    host,
    port: actualPort,
    origin: browserOrigin,
    fixtures,
    worker,
    async close() {
      if (closed) return;
      closed = true;
      await new Promise((resolveClose, rejectClose) => {
        server.close((error) => (error ? rejectClose(error) : resolveClose()));
      });
      if (ownsWorker) await worker.dispose();
    },
  });
}

async function handleRequest({
  request,
  response,
  browserOrigin,
  fixtures,
  worker,
  mediaStorageFaults,
  mediaStorageFaultsEnabled,
}) {
  try {
    const incomingUrl = new URL(request.url || "/", browserOrigin);
    if (await serveStaticAsset(incomingUrl.pathname, request.method, response)) return;

    if (incomingUrl.pathname === "/__qa/scenarios") {
      sendJson(response, 200, {
        origin: browserOrigin,
        scenarios: FUNCTIONAL_QA_SCENARIOS.map((definition) => ({
          ...definition,
          entries: scenarioEntries(browserOrigin, definition),
        })),
      });
      return;
    }

    if (incomingUrl.pathname === "/__qa/status") {
      sendJson(response, 200, {
        ready: true,
        seededScenarios: fixtures.seededScenarioIds(),
      });
      return;
    }

    if (incomingUrl.pathname === "/__qa/reset") {
      response.statusCode = 302;
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Set-Cookie", clearScenarioCookie());
      response.setHeader("Location", "/");
      response.end();
      return;
    }

    if (incomingUrl.pathname === "/__qa/faults/media-next-storage-write") {
      if (request.method !== "POST") {
        response.statusCode = 405;
        response.setHeader("Allow", "POST");
        response.setHeader("Cache-Control", "no-store");
        response.end();
        return;
      }
      const scenarioId = requestScenario(request);
      if (
        !mediaStorageFaultsEnabled ||
        !scenarioId ||
        request.headers.origin !== browserOrigin ||
        incomingUrl.search
      ) {
        sendJson(response, 403, { error: "qa_fault_control_unavailable" });
        return;
      }
      await fixtures.get(scenarioId);
      const identity = fixtures.identityFor(scenarioId);
      const accountId = await accountIdForIdentity(worker, identity.email);
      if (!accountId) {
        sendJson(response, 409, { error: "qa_scenario_account_unavailable" });
        return;
      }
      mediaStorageFaults.arm(accountId);
      sendJson(response, 202, { armed: true });
      return;
    }

    const entry = qaEntry(incomingUrl.pathname);
    if (entry) {
      const fixture = await fixtures.get(entry.scenarioId);
      const token = entry.target === "old-golfer" ? fixture.oldToken : fixture.token;
      if (entry.target !== "app" && !token) {
        sendJson(response, 409, {
          error: "scenario_has_no_golfer_capability",
          scenarioId: entry.scenarioId,
        });
        return;
      }
      response.statusCode = 302;
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Set-Cookie", scenarioCookie(entry.scenarioId));
      response.setHeader(
        "Location",
        entry.target === "app"
          ? "/app"
          : `/r#token=${encodeURIComponent(token)}`,
      );
      response.end();
      return;
    }

    if (incomingUrl.pathname === "/__visual/golfer") {
      const fixture = await fixtures.get("standard");
      await exchangeVisualCapability({
        response,
        worker,
        fixture,
      });
      return;
    }

    const scenarioId = requestScenario(request) ?? "standard";
    if (incomingUrl.pathname.startsWith("/app") || requestScenario(request)) {
      await fixtures.get(scenarioId);
    }
    const identity = fixtures.identityFor(scenarioId);
    const upstream = await dispatchBrowserRequest({
      request,
      incomingUrl,
      worker,
      identity,
    });
    await sendUpstreamResponse(upstream, response, browserOrigin, request.method);
  } catch (error) {
    response.statusCode = 500;
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Content-Type", "text/plain; charset=utf-8");
    response.end(
      error instanceof Error ? error.message : "Functional QA server error",
    );
  }
}

async function dispatchBrowserRequest({ request, incomingUrl, worker, identity }) {
  const body = await readBody(request);
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value !== undefined && name !== "host") {
      headers.set(name, Array.isArray(value) ? value.join(", ") : value);
    }
  }
  // This local proxy buffers and may rewrite the upstream response before it
  // sends it to the browser. Ask Miniflare for an identity-encoded body so a
  // Worker response remains readable even when the Worker rejects and cancels
  // the unread remainder of a streamed request body. Forwarding Chromium's
  // gzip/br preference here can otherwise make Miniflare surface `terminated`
  // and the proxy incorrectly replace a deterministic 4xx JSON response with
  // a synthetic 500.
  headers.set("accept-encoding", "identity");
  const upstreamCookie = withoutScenarioCookie(headers.get("cookie"));
  if (upstreamCookie) headers.set("cookie", upstreamCookie);
  else headers.delete("cookie");
  headers.set("oai-authenticated-user-email", identity.email);
  headers.set("oai-authenticated-user-full-name", encodeURIComponent(identity.name));
  headers.set(
    "oai-authenticated-user-full-name-encoding",
    "percent-encoded-utf-8",
  );
  if (headers.has("origin")) headers.set("origin", testOrigin);

  return worker.dispatch(`${incomingUrl.pathname}${incomingUrl.search}`, {
    method: request.method,
    headers,
    body: body.length ? body : undefined,
  });
}

async function exchangeVisualCapability({ response, worker, fixture }) {
  const exchangeResponse = await worker.dispatch("/r/session", {
    method: "POST",
    headers: writeHeaders(fixture.identity.email, fixture.identity.name),
    body: JSON.stringify({ token: fixture.token }),
  });
  const exchangeBody = await responseJson(
    exchangeResponse,
    200,
    "visual share-session exchange",
  );
  if (!/^[0-9a-f]{64}$/u.test(exchangeBody.sessionContext)) {
    throw new Error("Visual share-session exchange returned an invalid context.");
  }
  const sessionCookie = exchangeResponse.headers.get("set-cookie");
  if (!sessionCookie) {
    throw new Error("Visual share-session exchange did not return a cookie.");
  }

  response.statusCode = 302;
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Set-Cookie", [
    scenarioCookie("standard"),
    sessionCookie.replace(/;\s*Secure\b/gi, ""),
  ]);
  response.setHeader("Location", `/r/plan?context=${exchangeBody.sessionContext}`);
  response.end();
}

async function sendUpstreamResponse(upstream, response, browserOrigin, method) {
  response.statusCode = upstream.status;
  response.statusMessage = upstream.statusText;
  for (const [name, value] of upstream.headers.entries()) {
    if (["content-length", "set-cookie", "transfer-encoding"].includes(name)) continue;
    response.setHeader(
      name,
      name === "location" ? value.replaceAll(testOrigin, browserOrigin) : value,
    );
  }
  const cookies = typeof upstream.headers.getSetCookie === "function"
    ? upstream.headers.getSetCookie()
    : [upstream.headers.get("set-cookie")].filter(Boolean);
  if (cookies.length) response.setHeader("Set-Cookie", cookies);
  if (method === "HEAD" || upstream.status === 204 || upstream.status === 304) {
    response.end();
    return;
  }

  const body = Buffer.from(await upstream.arrayBuffer());
  const contentType = upstream.headers.get("content-type") ?? "";
  if (isTextualContent(contentType)) {
    const rewritten = body
      .toString("utf8")
      .replaceAll(testOrigin, browserOrigin);
    response.setHeader("Content-Length", Buffer.byteLength(rewritten));
    response.end(rewritten);
    return;
  }
  response.setHeader("Content-Length", body.byteLength);
  response.end(body);
}

function isTextualContent(contentType) {
  return /^(?:text\/|application\/(?:javascript|json|problem\+json))/i.test(
    contentType,
  );
}

async function serveStaticAsset(pathname, method, response) {
  if ((method !== "GET" && method !== "HEAD") || !STATIC_FILE.test(pathname)) {
    return false;
  }
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return false;
  }
  if (decodedPath.includes("\0")) return false;
  const absolutePath = resolve(clientRoot, `.${decodedPath}`);
  if (
    absolutePath !== clientRoot &&
    !absolutePath.startsWith(`${clientRoot}${sep}`)
  ) {
    return false;
  }
  let body;
  try {
    body = await readFile(absolutePath);
  } catch {
    return false;
  }
  response.statusCode = 200;
  response.setHeader("Content-Type", contentTypeFor(absolutePath));
  response.setHeader("Content-Length", body.byteLength);
  response.setHeader("Cache-Control", "no-store");
  response.end(method === "HEAD" ? undefined : body);
  return true;
}

function contentTypeFor(path) {
  return (
    {
      ".avif": "image/avif",
      ".css": "text/css; charset=utf-8",
      ".gif": "image/gif",
      ".ico": "image/x-icon",
      ".jpeg": "image/jpeg",
      ".jpg": "image/jpeg",
      ".js": "text/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".png": "image/png",
      ".svg": "image/svg+xml; charset=utf-8",
      ".webp": "image/webp",
      ".woff": "font/woff",
      ".woff2": "font/woff2",
    }[extname(path).toLowerCase()] ?? "application/octet-stream"
  );
}

function qaEntry(pathname) {
  const match = pathname.match(
    /^\/__qa\/([a-z0-9-]+)\/(app|golfer|old-golfer)$/,
  );
  if (!match || !isFunctionalQaScenario(match[1])) return null;
  if (match[2] === "old-golfer" && match[1] !== "republished") return null;
  return Object.freeze({ scenarioId: match[1], target: match[2] });
}

function requestScenario(request) {
  const cookies = request.headers.cookie?.split(";") ?? [];
  for (const cookie of cookies) {
    const [rawName, ...rawValue] = cookie.trim().split("=");
    if (rawName !== QA_SCENARIO_COOKIE) continue;
    let value;
    try {
      value = decodeURIComponent(rawValue.join("="));
    } catch {
      return null;
    }
    return isFunctionalQaScenario(value) ? value : null;
  }
  return null;
}

function withoutScenarioCookie(value) {
  if (!value) return "";
  return value
    .split(";")
    .map((cookie) => cookie.trim())
    .filter((cookie) => !cookie.startsWith(`${QA_SCENARIO_COOKIE}=`))
    .join("; ");
}

function scenarioCookie(scenarioId) {
  return `${QA_SCENARIO_COOKIE}=${encodeURIComponent(
    scenarioId,
  )}; Path=/; HttpOnly; SameSite=Strict`;
}

async function accountIdForIdentity(worker, email) {
  const [result] = await worker.inspect([
    {
      sql: "select id from accounts where normalized_email = ?",
      params: [email.trim().toLowerCase()],
    },
  ]);
  return result.results[0]?.id ?? null;
}

function createMediaStorageFaultController() {
  const armedAccountIds = new Set();
  return Object.freeze({
    arm(accountId) {
      armedAccountIds.add(accountId);
    },
    async handler(request) {
      const url = new URL(request.url);
      const match = url.pathname.match(
        /^\/__synthetic_concurrency_fault\/media-next-storage-write$/,
      );
      if (
        request.method !== "POST" ||
        !match ||
        [...url.searchParams.keys()].some((key) => key !== "scope")
      ) {
        return new Response("continue");
      }
      const accountId = url.searchParams.get("scope") ?? "";
      if (!armedAccountIds.delete(accountId)) {
        return new Response("continue");
      }
      return new Response("inject", {
        headers: { "x-roadmap-synthetic-fault": "inject" },
      });
    },
  });
}

function clearScenarioCookie() {
  return `${QA_SCENARIO_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
}

function scenarioEntries(origin, definition) {
  return Object.freeze({
    app: `${origin}/__qa/${definition.id}/app`,
    ...(definition.hasGolferEntry
      ? { golfer: `${origin}/__qa/${definition.id}/golfer` }
      : {}),
    ...(definition.hasOldGolferEntry
      ? { oldGolfer: `${origin}/__qa/${definition.id}/old-golfer` }
      : {}),
  });
}

async function configuredRichFixtureHooks(explicitModule) {
  const modulePath = explicitModule ?? process.env.FUNCTIONAL_QA_RICH_FIXTURE_MODULE;
  if (!modulePath?.trim()) return [];
  const absolutePath = resolve(projectRoot, modulePath.trim());
  const projectRelative = relative(projectRoot, absolutePath);
  if (
    projectRelative.startsWith("..") ||
    projectRelative === "" ||
    resolve(projectRoot, projectRelative) !== absolutePath
  ) {
    throw new Error("FUNCTIONAL_QA_RICH_FIXTURE_MODULE must stay within 10_production_saas.");
  }
  const imported = await import(pathToFileURL(absolutePath).href);
  const hooks = imported.richFixtureHooks ?? imported.default;
  if (!Array.isArray(hooks)) {
    throw new Error("The configured rich fixture module must export a richFixtureHooks array.");
  }
  return hooks;
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function responseJson(response, expectedStatus, label) {
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (response.status !== expectedStatus) {
    throw new Error(
      `${label} returned ${response.status}; expected ${expectedStatus}: ${
        typeof body === "string" ? body : JSON.stringify(body)
      }`,
    );
  }
  return body;
}

function sendJson(response, status, body) {
  const text = `${JSON.stringify(body, null, 2)}\n`;
  response.statusCode = status;
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Content-Length", Buffer.byteLength(text));
  response.end(text);
}

function configuredPort() {
  const raw = process.env.VISUAL_REVIEW_PORT?.trim();
  if (!raw) return DEFAULT_PORT;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error("VISUAL_REVIEW_PORT must be an integer from 1 through 65535.");
  }
  return parsed;
}

function listen(server, port, host) {
  return new Promise((resolveListen, rejectListen) => {
    const onError = (error) => {
      server.off("listening", onListening);
      rejectListen(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolveListen();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}

async function main() {
  if (process.argv.includes("--describe")) {
    process.stdout.write(
      `${JSON.stringify({ scenarios: FUNCTIONAL_QA_SCENARIOS }, null, 2)}\n`,
    );
    return;
  }
  const runtime = await startFunctionalQaServer();
  process.stdout.write(`Functional QA server ready at ${runtime.origin}\n`);
  process.stdout.write(`Scenario catalogue: ${runtime.origin}/__qa/scenarios\n`);

  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await runtime.close();
    process.exit(0);
  };
  process.once("SIGINT", () => void stop());
  process.once("SIGTERM", () => void stop());
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === scriptPath) {
  await main();
}
