import assert from "node:assert/strict";
import test from "node:test";
import {
  identityHeaders,
  startD1Worker,
  writeHeaders,
} from "./support/d1-worker.mjs";

const coach = { email: "coach.a@example.test", name: "Coach Avery" };

test("terminal offset metadata never advertises an unusable next page", async () => {
  const { MAX_PAGE_OFFSET, offsetPaginationMetadata } = await import(
    "../lib/pagination.ts"
  );
  assert.deepEqual(
    offsetPaginationMetadata({
      limit: 50,
      offset: MAX_PAGE_OFFSET,
      hasMore: true,
    }),
    {
      limit: 50,
      offset: MAX_PAGE_OFFSET,
      hasMore: false,
      nextOffset: null,
      truncated: true,
    },
  );
  assert.equal(
    offsetPaginationMetadata({ limit: 50, offset: 99_950, hasMore: true })
      .nextOffset,
    MAX_PAGE_OFFSET,
  );
});

test(
  "golfer and package listings remain bounded and traversable at synthetic capacity",
  { timeout: 90_000 },
  async (context) => {
    const worker = await startD1Worker();
    context.after(() => worker.dispose());

    const profile = await worker.dispatch("/api/profile", {
      method: "PUT",
      headers: writeHeaders(coach.email, coach.name),
      body: JSON.stringify({
        displayName: coach.name,
        contactEmail: coach.email,
      }),
    });
    assert.equal(profile.status, 200);

    await worker.inspect([
      {
        sql: `with recursive seq(n) as (
                select 1 union all select n + 1 from seq where n < 130
              )
              insert into golfers (
                id, account_id, display_name, status, eligibility_status,
                last_activity_at, updated_at
              )
              select 'capacity_golfer_' || printf('%03d', seq.n),
                     accounts.id,
                     'Capacity Golfer ' || printf('%03d', seq.n),
                     'active', 'adult_confirmed',
                     1786190000000 + seq.n,
                     1786190000000 + seq.n
                from seq cross join accounts
               where accounts.normalized_email = ?`,
        params: [coach.email],
      },
      {
        sql: `with recursive seq(n) as (
                select 1 union all select n + 1 from seq where n < 130
              )
              insert into development_plans (
                id, account_id, golfer_id, title, status, revision, updated_at
              )
              select 'capacity_plan_' || printf('%03d', seq.n),
                     accounts.id,
                     'capacity_golfer_' || printf('%03d', seq.n),
                     'Capacity Plan ' || printf('%03d', seq.n),
                     'draft', 1, 1786190000000 + seq.n
                from seq cross join accounts
               where accounts.normalized_email = ?`,
        params: [coach.email],
      },
      {
        sql: `with recursive seq(n) as (
                select 1 union all select n + 1 from seq where n < 130
              )
              insert into coaching_packages (
                id, account_id, name, purpose, fit_description, status,
                current_details_text, inclusions, terms_summary,
                external_action_type, external_action_label, external_action_url,
                is_default, updated_at
              )
              select 'capacity_package_' || printf('%03d', seq.n),
                     accounts.id,
                     'Capacity Package ' || printf('%03d', seq.n),
                     'Synthetic capacity purpose.',
                     'Synthetic capacity fit.',
                     'active',
                     'Current details require coach confirmation.',
                     '[]',
                     'Synthetic terms.',
                     'contact',
                     'Contact coach',
                     'https://booking.example.ca/capacity',
                     0,
                     1786190000000 + seq.n
                from seq cross join accounts
               where accounts.normalized_email = ?`,
        params: [coach.email],
      },
    ]);

    const golferPages = await Promise.all([
      getJson(worker, "/api/golfers?limit=50&offset=0"),
      getJson(worker, "/api/golfers?limit=50&offset=50"),
      getJson(worker, "/api/golfers?limit=50&offset=100"),
    ]);
    assert.deepEqual(
      golferPages.map(({ response }) => response.status),
      [200, 200, 200],
    );
    assert.deepEqual(
      golferPages.map(({ body }) => body.golfers.length),
      [50, 50, 30],
    );
    assert.deepEqual(
      golferPages.map(({ body }) => body.pagination.hasMore),
      [true, true, false],
    );
    assert.equal(golferPages[0].body.golfers[0].displayName, "Capacity Golfer 130");
    assert.equal(golferPages[2].body.golfers.at(-1).displayName, "Capacity Golfer 001");
    assert.equal(
      new Set(golferPages.flatMap(({ body }) => body.golfers.map(({ id }) => id))).size,
      130,
    );

    const packagePages = await Promise.all([
      getJson(worker, "/api/packages?limit=50&offset=0"),
      getJson(worker, "/api/packages?limit=50&offset=50"),
      getJson(worker, "/api/packages?limit=50&offset=100"),
    ]);
    assert.deepEqual(
      packagePages.map(({ body }) => body.packages.length),
      [50, 50, 30],
    );
    assert.equal(packagePages[0].body.packages[0].name, "Capacity Package 130");
    assert.equal(packagePages[2].body.packages.at(-1).name, "Capacity Package 001");
    assert.equal(
      new Set(packagePages.flatMap(({ body }) => body.packages.map(({ id }) => id))).size,
      130,
    );

    for (const path of [
      "/api/golfers?limit=101",
      "/api/golfers?offset=-1",
      "/api/packages?limit=all",
      "/api/packages?offset=100001",
    ]) {
      const invalid = await getJson(worker, path);
      assert.equal(invalid.response.status, 400, path);
      assert.equal(invalid.body.error.code, "invalid_pagination", path);
    }

    const golferPage = await worker.dispatch("/app/golfers?page=5", {
      headers: identityHeaders(coach.email, coach.name),
    });
    assert.equal(golferPage.status, 200);
    const golferHtml = await golferPage.text();
    assert.match(golferHtml, /Capacity Golfer 005/);
    assert.match(golferHtml, /Capacity Golfer 001/);
    assert.doesNotMatch(golferHtml, /Capacity Golfer 130/);
    assert.match(golferHtml, /Previous records/);

    const packagePage = await worker.dispatch("/app/packages?page=5", {
      headers: identityHeaders(coach.email, coach.name),
    });
    assert.equal(packagePage.status, 200);
    const packageHtml = await packagePage.text();
    assert.match(packageHtml, /Capacity Package 005/);
    assert.match(packageHtml, /Capacity Package 001/);
    assert.doesNotMatch(packageHtml, /Capacity Package 130/);

    const newGolferPage = await worker.dispatch("/app/golfers/new", {
      headers: identityHeaders(coach.email, coach.name),
    });
    assert.equal(newGolferPage.status, 200);
    assert.match(await newGolferPage.text(), /Package selection is bounded/);

    const workspace = await worker.dispatch("/app", {
      headers: identityHeaders(coach.email, coach.name),
    });
    const workspaceHtml = await workspace.text();
    assert.match(workspaceHtml, /Capacity Golfer 130/);
    assert.doesNotMatch(workspaceHtml, /Capacity Golfer 120/);
  },
);

async function getJson(worker, path) {
  const response = await worker.dispatch(path, {
    headers: identityHeaders(coach.email, coach.name),
  });
  return { response, body: await response.json() };
}
