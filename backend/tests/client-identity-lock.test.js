const assert = require("node:assert/strict");
const { test } = require("node:test");
const { lockClientIdentities } = require("../src/shared/clientLifecycleLock");

test("locks de identidade são separados, deduplicados e ordenados por tenant", async () => {
  const previousTestUrl = process.env.CRM_TEST_DATABASE_URL;
  const calls = [];
  process.env.CRM_TEST_DATABASE_URL = "postgresql://disposable.test/qa";
  try {
    await lockClientIdentities({
      async $queryRaw(_strings, value) {
        calls.push(value);
        return [];
      },
    }, 7, ["site:phone:5511999999999", "site:email:cliente@qa.test", "SITE:PHONE:5511999999999"]);
  } finally {
    if (previousTestUrl === undefined) delete process.env.CRM_TEST_DATABASE_URL;
    else process.env.CRM_TEST_DATABASE_URL = previousTestUrl;
  }
  assert.deepEqual(calls, [
    "7:site:email:cliente@qa.test",
    "7:site:phone:5511999999999",
  ]);
});
