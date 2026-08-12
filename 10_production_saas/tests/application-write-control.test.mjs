import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

register(new URL("./support/cloudflare-loader.mjs", import.meta.url));

test("application write mode accepts only exact enabled and frozen values", async () => {
  const {
    readApplicationWriteControl,
    SCHEDULED_WRITES_UNAVAILABLE_LOG,
  } = await import(
    "../lib/application-write-control.ts"
  );

  assert.equal(
    SCHEDULED_WRITES_UNAVAILABLE_LOG,
    "Scheduled application writes unavailable",
  );

  assert.deepEqual(readApplicationWriteControl("enabled"), {
    state: "enabled",
    writesEnabled: true,
  });
  assert.deepEqual(readApplicationWriteControl("frozen"), {
    state: "frozen",
    writesEnabled: false,
  });
  for (const value of [
    undefined,
    "",
    "invalid",
    " enabled ",
    " frozen ",
    "ENABLED",
    "FROZEN",
  ]) {
    assert.deepEqual(readApplicationWriteControl(value), {
      state: "invalid",
      writesEnabled: false,
    });
  }
});

test("write reachability blocks unsafe methods and GET or HEAD routes with incidental writes", async () => {
  const { requestMayReachApplicationWrites } = await import(
    "../lib/application-write-control.ts"
  );

  for (const path of [
    "/",
    "/privacy",
    "/support",
    "/terms",
    "/r",
    "/r/plan",
    "/api/health",
    "/api/operations/health",
  ]) {
    for (const method of ["GET", "HEAD", "get", "head"]) {
      assert.equal(
        requestMayReachApplicationWrites(method, path),
        false,
        `${method} ${path}`,
      );
    }
  }

  for (const path of [
    "/app",
    "/app/golfers",
    "/api",
    "/api/profile",
    "/api/health/",
    "/api/operations/health/",
    "/api/__invalid_path__",
  ]) {
    for (const method of ["GET", "HEAD"]) {
      assert.equal(
        requestMayReachApplicationWrites(method, path),
        true,
        `${method} ${path}`,
      );
    }
  }

  for (const path of ["/app", "/api/profile", "/r", "/privacy"]) {
    assert.equal(requestMayReachApplicationWrites("OPTIONS", path), false);
    assert.equal(requestMayReachApplicationWrites("options", path), false);
  }

  for (const method of [
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "CONNECT",
    "TRACE",
    "",
    "malformed",
  ]) {
    for (const path of ["/", "/r", "/api/health"]) {
      assert.equal(
        requestMayReachApplicationWrites(method, path),
        true,
        `${method} ${path}`,
      );
    }
  }
});
