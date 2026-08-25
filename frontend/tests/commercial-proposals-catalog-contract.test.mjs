import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("frontend proposal contract exposes snapshots without tenant authority or catalog prices", async () => {
  const api = await readFile(path.join(frontendDir, "src/services/crmApi.ts"), "utf8");
  const itemType = api.match(/export type CommercialProposalItem = \{[\s\S]*?\n\};/u)?.[0] || "";
  const catalogPayload = api.match(/export type CommercialProposalCatalogItemPayload = \{[\s\S]*?\n\};/u)?.[0] || "";

  for (const field of ["itemType", "productOfferId", "productNameSnapshot", "priceStatusSnapshot", "offerExpiresAt", "catalogRevision", "stockMaterialVersion"]) {
    assert.match(itemType, new RegExp(`\\b${field}\\b`));
  }
  assert.doesNotMatch(itemType, /\bempresaId\b/);
  assert.match(catalogPayload, /productOfferId: string/);
  assert.match(catalogPayload, /quantidade: string/);
  assert.doesNotMatch(catalogPayload, /valorUnitarioCentavos/);

  const serializer = api.match(/export function serializeCommercialProposalPayload[\s\S]*?\n\}/u)?.[0] || "";
  assert.match(serializer, /item\.itemType === "CATALOG_ITEM"/);
  assert.match(serializer, /productOfferId: item\.productOfferId/);
  const catalogSerializer = serializer.match(/item\.itemType === "CATALOG_ITEM"[\s\S]*?: \{/u)?.[0] || "";
  assert.doesNotMatch(catalogSerializer, /valorUnitarioCentavos|descontoCentavos/);
});
