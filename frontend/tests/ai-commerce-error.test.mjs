import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import { pathToFileURL } from "node:url";

test("erros aninhados do endpoint de IA preservam o código de capability", async () => {
  const source = fs.readFileSync(new URL("../src/services/aiCommerceError.ts", import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const file = path.join(os.tmpdir(), `ai-commerce-error-${process.pid}.mjs`);
  fs.writeFileSync(file, output, "utf8");
  try {
    const { parseAICommerceErrorBody } = await import(`${pathToFileURL(file).href}?v=${Date.now()}`);
    const body = { error: { code: "AI_COMMERCE_DISABLED", message: "disabled" } };
    assert.deepEqual(parseAICommerceErrorBody(body), { code: "AI_COMMERCE_DISABLED", message: "disabled", details: body });
  } finally {
    fs.rmSync(file, { force: true });
  }
});
