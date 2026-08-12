import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import { startFunctionalQaServer } from "./functional-qa-server.mjs";

const OUTPUT = path.resolve("output/beta2-browser");
const VIEWPORTS = [
  { name: "mobile-320", width: 320, height: 844 },
  { name: "mobile-390", width: 390, height: 844 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "desktop-1440", width: 1440, height: 1000 },
];
const failures = [];
const results = [];

await mkdir(OUTPUT, { recursive: true });
const runtime = await startFunctionalQaServer({
  port: 0,
  eagerScenarios: [
    "fresh",
    "standard",
    "three-phase",
    "mixed-30",
    "long-content",
    "expired",
    "revoked",
    "republished",
  ],
});
const browser = await chromium.launch({ headless: true });

try {
  await exerciseCoachJourney();
  await exerciseRoadmapCreation();
  await reviewResponsiveExperience();
  await reviewEdgeStates();
} finally {
  await browser.close();
  await runtime.close();
}

const summary = {
  candidate: "Roadmap Beta 2 premium low-admin experience",
  reviewedAt: new Date().toISOString(),
  resultCount: results.length,
  failureCount: failures.length,
  results,
  failures,
};
await writeFile(
  path.join(OUTPUT, "summary.json"),
  `${JSON.stringify(summary, null, 2)}\n`,
  "utf8",
);

if (failures.length) {
  console.error("Beta 2 browser acceptance failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(`Beta 2 browser acceptance passed across ${results.length} reviewed surfaces.`);
}

async function exerciseCoachJourney() {
  const viewport = VIEWPORTS.at(-1);
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  diagnostics(page, "coach-journey");

  await visit(page, "coach-home", `${runtime.origin}/__qa/standard/app`, viewport);
  await visit(page, "players", `${runtime.origin}/app/golfers`, viewport);

  const playerHref = await firstPlayerHref(page);
  if (!playerHref) {
    failures.push("coach-journey: no player link was available");
    await context.close();
    return;
  }

  await visit(page, "player-workspace", `${runtime.origin}${playerHref}`, viewport);
  const quickUpdate = page.locator("form").filter({ hasText: "Sixty-second lesson update" });
  if (await quickUpdate.count()) {
    await quickUpdate.locator('[name="changed"]').fill(
      "The player found a start line they could recognize without steering the face.",
    );
    await quickUpdate.locator('[name="practice"]').fill(
      "Hit three sets of four drives to a wide corridor, resetting fully between shots.",
    );
    await quickUpdate.locator('[name="attention"]').fill(
      "Notice the start line before judging the curve.",
    );
    await quickUpdate.locator('[name="cadence"]').fill("Three sets of four, twice this week");
    await quickUpdate.getByRole("button", { name: "Update player journey" }).click();
    await page
      .getByText("The lesson takeaway, next practice, and player journey are updated.")
      .waitFor({ timeout: 30_000 });
    await capture(page, "lesson-update-complete", viewport);
  } else {
    failures.push("coach-journey: sixty-second lesson update was not rendered");
  }

  await context.close();
}

async function exerciseRoadmapCreation() {
  const viewport = VIEWPORTS.at(-1);
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  diagnostics(page, "roadmap-creation");

  await page.goto(`${runtime.origin}/__qa/fresh/app`, { waitUntil: "domcontentloaded" });
  await page.goto(`${runtime.origin}/app/golfers/new`, { waitUntil: "domcontentloaded" });
  await settle(page);

  const form = page.locator("form").filter({ hasText: "A roadmap is a conversation" });
  if (!(await form.count())) {
    failures.push("roadmap-creation: conversational roadmap form was not rendered");
    await context.close();
    return;
  }

  await form.locator('[name="displayName"]').fill("Alex Morgan");
  await form.locator('[name="goal"]').fill("Start more drives in play and enjoy competitive rounds.");
  await form.locator('[name="why"]').fill("One severe miss currently changes the entire day.");
  await form.locator('[name="strengths"]').fill("Athletic motion, useful speed, and strong commitment.");
  await form.locator('[name="pattern"]').fill("Start direction and strike move together under pressure.");
  await form.locator('[name="priority"]').fill("Own the start direction");
  await form.locator('[name="whyFirst"]').fill("A predictable start line gives every later decision a stable base.");
  await form.locator('[name="adultEligibilityConfirmed"]').check();

  await Promise.all([
    page.waitForURL(/\/app\/golfers\/[^/?#]+$/, { timeout: 45_000 }),
    form.getByRole("button", { name: "Create roadmap" }).click(),
  ]);
  await settle(page);
  await capture(page, "new-roadmap-player-workspace", viewport);
  await context.close();
}

async function reviewResponsiveExperience() {
  for (const viewport of VIEWPORTS) {
    const coach = await browser.newContext({ viewport });
    const coachPage = await coach.newPage();
    diagnostics(coachPage, `${viewport.name}-coach`);
    await visit(
      coachPage,
      `${viewport.name}-coach-home`,
      `${runtime.origin}/__qa/standard/app`,
      viewport,
    );
    await visit(
      coachPage,
      `${viewport.name}-players`,
      `${runtime.origin}/app/golfers`,
      viewport,
    );
    const playerHref = await firstPlayerHref(coachPage);
    if (playerHref) {
      await visit(
        coachPage,
        `${viewport.name}-player-workspace`,
        `${runtime.origin}${playerHref}`,
        viewport,
      );
    } else {
      failures.push(`${viewport.name}: no player workspace link`);
    }
    await coach.close();

    const golfer = await browser.newContext({ viewport });
    const golferPage = await golfer.newPage();
    diagnostics(golferPage, `${viewport.name}-golfer`);
    await visit(
      golferPage,
      `${viewport.name}-golfer-publication`,
      `${runtime.origin}/__qa/standard/golfer`,
      viewport,
    );
    await golfer.close();
  }
}

async function reviewEdgeStates() {
  const viewport = VIEWPORTS.at(-1);
  const entries = [
    ["fresh-home", "/__qa/fresh/app"],
    ["mixed-30-home", "/__qa/mixed-30/app"],
    ["long-content-player", "/__qa/long-content/app"],
    ["long-content-publication", "/__qa/long-content/golfer"],
    ["three-phase-publication", "/__qa/three-phase/golfer"],
    ["expired-private-link", "/__qa/expired/golfer"],
    ["revoked-private-link", "/__qa/revoked/golfer"],
    ["republished-current", "/__qa/republished/golfer"],
    ["republished-old", "/__qa/republished/old-golfer"],
  ];
  for (const [name, route] of entries) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    diagnostics(page, name);
    await visit(page, name, `${runtime.origin}${route}`, viewport);
    await context.close();
  }
}

function diagnostics(page, label) {
  page.on("pageerror", (error) => failures.push(`${label}: page error: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") {
      failures.push(`${label}: console error: ${message.text()}`);
    }
  });
  page.on("requestfailed", (request) => {
    if (!request.url().endsWith("/favicon.ico")) {
      failures.push(
        `${label}: failed request ${request.method()} ${request.url()}: ${request.failure()?.errorText ?? "unknown"}`,
      );
    }
  });
}

async function visit(page, name, url, viewport) {
  const response = await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });
  await settle(page);
  const status = response?.status() ?? null;
  if (status !== null && status >= 500) {
    failures.push(`${name}: document returned ${status}`);
  }
  await capture(page, name, viewport, status, url);
}

async function capture(page, name, viewport, status = null, requestedUrl = page.url()) {
  const bodyText = (await page.locator("body").innerText()).trim();
  if (bodyText.length < 20) {
    failures.push(`${name}: rendered body was unexpectedly empty`);
  }
  const geometry = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
    bodyWidth: document.body.scrollWidth,
  }));
  if (geometry.documentWidth > geometry.viewportWidth + 1) {
    failures.push(
      `${name}: horizontal overflow ${geometry.documentWidth}px > ${geometry.viewportWidth}px`,
    );
  }
  const fileName = `${safe(name)}-${viewport.width}x${viewport.height}.png`;
  await page.screenshot({ path: path.join(OUTPUT, fileName), fullPage: true });
  results.push({
    name,
    requestedUrl,
    finalUrl: page.url(),
    status,
    viewport,
    bodyCharacters: bodyText.length,
    geometry,
    screenshot: fileName,
  });
}

async function firstPlayerHref(page) {
  const hrefs = await page
    .locator('a[href^="/app/golfers/"]')
    .evaluateAll((links) =>
      links.map((link) => link.getAttribute("href")).filter(Boolean),
    );
  return hrefs.find((href) => /^\/app\/golfers\/[^/?#]+$/.test(href)) ?? null;
}

async function settle(page) {
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(350);
}

function safe(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
