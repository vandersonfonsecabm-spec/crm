import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const dashboardPath = path.resolve("src/pages/Dashboard.tsx");
const dashboardSource = fs.readFileSync(dashboardPath, "utf8");

test("client loading is scoped to client-backed routes", () => {
  assert.match(dashboardSource, /const CLIENT_DATA_PAGES = new Set<ActivePage>\(\[/);
  assert.match(dashboardSource, /if \(!CLIENT_DATA_PAGES\.has\(activePage\)\)/);
  assert.match(dashboardSource, /\}, pageChanged \? 0 : 250\);/);
});
