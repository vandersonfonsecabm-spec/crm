import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("CSV export escapes quotes and neutralizes formula-leading cells", async () => {
  const source = await readFile(path.join(frontendDir, "src/hooks/useDashboardActions.ts"), "utf8");
  assert.match(source, /export function toCsvCell\(value: unknown\)/);
  assert.match(source, /\^\[=\+\\-@\]/);
  assert.match(source, /safeText\.replace\(\/\"\/g, '\"\"'\)/);
  assert.match(source, /row\.map\(toCsvCell\)/);
});
