import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { startD1Worker, testOrigin, writeHeaders } from "../tests/support/d1-worker.mjs";

const host = "127.0.0.1";
const port = Number(process.env.VISUAL_REVIEW_PORT || 4175);
const clientRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../dist/client");
const identity = {
  email: "visual.coach@example.test",
  name: "Coach Rowan",
};

const worker = await startD1Worker();
const fixture = await createSyntheticFixture(worker);

const server = createServer(async (request, response) => {
  try {
    const incomingUrl = new URL(request.url || "/", `http://${host}:${port}`);
    if (
      incomingUrl.pathname.startsWith("/assets/") ||
      incomingUrl.pathname === "/og.png"
    ) {
      await serveClientAsset(incomingUrl.pathname, response);
      return;
    }
    if (incomingUrl.pathname === "/__visual/golfer") {
      response.statusCode = 302;
      response.setHeader(
        "Set-Cookie",
        `roadmap_share=${fixture.token}; Path=/r; HttpOnly; SameSite=Lax`,
      );
      response.setHeader("Location", "/r/plan");
      response.end();
      return;
    }

    const body = await readBody(request);
    const headers = new Headers();
    for (const [name, value] of Object.entries(request.headers)) {
      if (value !== undefined && name !== "host") {
        headers.set(name, Array.isArray(value) ? value.join(", ") : value);
      }
    }
    headers.set("oai-authenticated-user-email", identity.email);
    headers.set("oai-authenticated-user-full-name", encodeURIComponent(identity.name));
    headers.set(
      "oai-authenticated-user-full-name-encoding",
      "percent-encoded-utf-8",
    );
    if (headers.has("origin")) headers.set("origin", testOrigin);

    const upstream = await worker.dispatch(
      `${incomingUrl.pathname}${incomingUrl.search}`,
      {
        method: request.method,
        headers,
        body: body.length ? body : undefined,
      },
    );
    response.statusCode = upstream.status;
    response.statusMessage = upstream.statusText;
    upstream.headers.forEach((value, name) => response.setHeader(name, value));
    response.end(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    response.statusCode = 500;
    response.setHeader("Content-Type", "text/plain; charset=utf-8");
    response.end(error instanceof Error ? error.message : "Visual review server error");
  }
});

server.listen(port, host, () => {
  console.log(`Visual review server ready at http://${host}:${port}`);
});

async function shutdown() {
  await new Promise((resolve) => server.close(resolve));
  await worker.dispose();
}

process.once("SIGINT", () => void shutdown().finally(() => process.exit(0)));
process.once("SIGTERM", () => void shutdown().finally(() => process.exit(0)));

async function createSyntheticFixture(reviewWorker) {
  const profile = await jsonWrite(reviewWorker, "/api/profile", "PUT", {
    displayName: identity.name,
    businessName: "Foothills Golf Studio",
    professionalTitle: "Independent golf instructor",
    philosophy: "Clear priorities, honest evidence, and practical next steps.",
    contactEmail: identity.email,
    contactPhone: null,
    websiteUrl: "https://coach.example.ca",
    city: "Calgary",
    provinceOrTerritory: "Alberta",
    accentColor: "#176b55",
  });
  assertStatus(profile, 200, "profile fixture");

  const packageResponse = await jsonWrite(reviewWorker, "/api/packages", "POST", {
    title: "Four-session development phase",
    description: "Four focused sessions connected to the first roadmap phase.",
    priceCents: 48_000,
    currency: "CAD",
    terms: "Synthetic visual-review package. Confirm current terms with the coach.",
    inclusions: ["Four private lessons", "Coach-authored practice direction"],
    externalActionUrl: "https://booking.example.ca/visual-review",
    status: "active",
    isDefault: true,
  });
  assertStatus(packageResponse, 201, "package fixture");
  const coachingPackage = (await packageResponse.json()).package;

  const golferResponse = await jsonWrite(reviewWorker, "/api/golfers", "POST", {
    adultEligibilityConfirmed: true,
    displayName: "Jordan Synthetic",
    email: "jordan.visual@example.test",
    planTitle: "Predictable contact roadmap",
    coachingPackageId: coachingPackage.id,
    goal: {
      statement: "Build predictable contact through a full league round.",
      why: "Play confidently without guarding against a two-way miss.",
      context: "Synthetic content prepared only for release visual review.",
    },
    assessment: {
      summary: "Strike drifts toward the heel when transition tempo increases.",
      strengths: "Athletic setup and accurate awareness of strike location.",
      primaryPattern: "Heel contact appears as transition tempo increases.",
      limitations: "A small indoor sample does not prove transfer to the course.",
    },
    priority: {
      title: "Centered contact at playing tempo",
      rationale: "Contact stability supports later trajectory and speed decisions.",
    },
    phases: [
      [1, "Own centered contact", "Create a stable strike window at controlled tempo."],
      [2, "Shape trajectory", "Add launch windows without losing contact quality."],
      [3, "Choose targets", "Transfer the pattern into representative decisions."],
      [4, "Perform under pressure", "Test the pattern with scored constraints."],
    ].map(([number, title, purpose]) => ({
      number,
      title,
      purpose,
      rationale: number === 1 ? "Centered contact is the narrowest observed foundation." : null,
      progressSignals: number === 1 ? ["Centered contact repeats in a coach-reviewed set."] : [],
    })),
  });
  assertStatus(golferResponse, 201, "golfer fixture");
  const golfer = await golferResponse.json();

  const publishResponse = await jsonWrite(
    reviewWorker,
    `/api/plans/${golfer.plan.id}/publish`,
    "POST",
    {
      confirmation: "reviewed_exact_golfer_view",
      expectedRevision: golfer.plan.revision,
      intendedRecipientContext: "Synthetic visual-review golfer",
      expiresInDays: 1,
    },
  );
  assertStatus(publishResponse, 201, "publish fixture");
  const share = (await publishResponse.json()).share;
  const token = new URLSearchParams(new URL(share.url).hash.slice(1)).get("token");
  if (!token) throw new Error("Visual fixture did not create a private token.");

  return { token };
}

function jsonWrite(reviewWorker, path, method, body) {
  return reviewWorker.dispatch(path, {
    method,
    headers: writeHeaders(identity.email, identity.name),
    body: JSON.stringify(body),
  });
}

function assertStatus(response, expected, label) {
  if (response.status !== expected) {
    throw new Error(`${label} returned ${response.status}; expected ${expected}.`);
  }
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function serveClientAsset(pathname, response) {
  const absolutePath = resolve(clientRoot, `.${pathname}`);
  if (!absolutePath.startsWith(`${clientRoot}${sep}`)) {
    response.statusCode = 404;
    response.end();
    return;
  }
  try {
    const body = await readFile(absolutePath);
    const contentTypes = {
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".png": "image/png",
    };
    response.statusCode = 200;
    response.setHeader(
      "Content-Type",
      contentTypes[extname(absolutePath).toLowerCase()] || "application/octet-stream",
    );
    response.setHeader("Cache-Control", "no-store");
    response.end(body);
  } catch {
    response.statusCode = 404;
    response.end();
  }
}
