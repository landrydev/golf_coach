import assert from "node:assert/strict";
import test from "node:test";
import {
  startD1Worker,
  writeHeaders,
} from "./support/d1-worker.mjs";

const coach = {
  email: "coach.a@example.test",
  name: "Billing Recovery Coach",
};

test(
  "native billing submissions recover to truthful HTML notices while API clients retain JSON",
  { timeout: 60_000 },
  async (context) => {
    const worker = await startD1Worker();
    context.after(() => worker.dispose());

    for (const [path, query] of [
      ["/api/billing/checkout", "checkout=unavailable"],
      ["/api/billing/portal", "portal=unavailable"],
    ]) {
      const browser = await worker.dispatch(path, {
        method: "POST",
        redirect: "manual",
        headers: {
          ...writeHeaders(coach.email, coach.name),
          accept: "text/html,application/xhtml+xml",
        },
      });
      assert.equal(browser.status, 303);
      assert.equal(browser.headers.get("location"), `/app/billing?${query}`);
      assert.match(browser.headers.get("cache-control") ?? "", /no-store/);

      const api = await worker.dispatch(path, {
        method: "POST",
        headers: {
          ...writeHeaders(coach.email, coach.name),
          accept: "application/json",
        },
      });
      assert.equal(api.status, 503);
      assert.equal((await api.json()).error.code, "billing_not_configured");
    }
  },
);
