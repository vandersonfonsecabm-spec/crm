const assert = require("node:assert/strict");
const test = require("node:test");
const { createDatabaseProbe } = require("../src/database/readiness-probe");

test("readiness usa single-flight e uma unica query para chamadas concorrentes", async () => {
  let calls = 0;
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const probe = createDatabaseProbe({
    queryDatabase: async () => {
      calls += 1;
      await pending;
    },
  });
  const first = probe.probe();
  const second = probe.probe();
  release();
  await Promise.all([first, second]);
  assert.equal(calls, 1);
});

test("timeout propagado pela query nao deixa promessa zumbi no probe", async () => {
  let calls = 0;
  let now = 0;
  const probe = createDatabaseProbe({
    now: () => now,
    errorCacheMs: 0,
    queryDatabase: async ({ timeoutMs }) => {
      calls += 1;
      const error = new Error("statement timeout");
      error.code = "57014";
      error.timeoutMs = timeoutMs;
      throw error;
    },
  });
  await assert.rejects(probe.probe(), (error) => error.code === "57014" && error.timeoutMs === 3000);
  now = 1;
  await assert.rejects(probe.probe(), (error) => error.code === "57014");
  assert.equal(calls, 2);
});
