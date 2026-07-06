const INTENTS = new Set([
  "SAUDACAO",
  "CONSULTAR_PRODUTO",
  "CONSULTAR_PRECO",
  "CONSULTAR_ESTOQUE",
  "CONSULTAR_DISPONIBILIDADE",
  "CONSULTAR_PROMOCAO",
  "FALAR_COM_VENDEDOR",
  "NAO_COMPREENDIDA",
]);

function detectIntent(message) {
  const original = String(message || "").trim();
  const text = normalizeForIntent(original);
  const sku = findSku(original);
  const barcode = findBarcode(original);
  const productTerm = extractProductTerm(text, original, sku, barcode);

  if (matchesAny(text, ["vendedor", "atendente", "humano", "falar com alguem", "falar com vendedor"])) {
    return result("FALAR_COM_VENDEDOR", productTerm, "human-handoff", sku, barcode);
  }
  if (matchesAny(text, ["promocao", "promocional", "desconto", "oferta"])) {
    return result("CONSULTAR_PROMOCAO", productTerm, "promotion-keyword", sku, barcode);
  }
  if (matchesAny(text, ["preco", "valor", "quanto custa", "cotacao", "orcamento"])) {
    return result("CONSULTAR_PRECO", productTerm, "price-keyword", sku, barcode);
  }
  if (matchesAny(text, ["estoque", "saldo", "deposito"])) {
    return result("CONSULTAR_ESTOQUE", productTerm, "stock-keyword", sku, barcode);
  }
  if (matchesAny(text, ["disponivel", "tem no", "tem ", "possui"])) {
    return result("CONSULTAR_DISPONIBILIDADE", productTerm, "availability-keyword", sku, barcode);
  }
  if (sku || barcode || matchesAny(text, ["produto", "oleo", "semente", "rocadeira", "fertilizante"])) {
    return result("CONSULTAR_PRODUTO", productTerm, "product-keyword", sku, barcode);
  }
  if (matchesAny(text, ["bom dia", "boa tarde", "boa noite", "ola", "oi"])) {
    return result("SAUDACAO", null, "greeting", sku, barcode);
  }

  return result("NAO_COMPREENDIDA", productTerm, "fallback", sku, barcode);
}

function result(intencao, termoBusca, regra, sku, codigoBarras) {
  return {
    intencao: INTENTS.has(intencao) ? intencao : "NAO_COMPREENDIDA",
    termoBusca: cleanTerm(termoBusca || sku || codigoBarras || ""),
    sku: sku || null,
    codigoBarras: codigoBarras || null,
    regra,
  };
}

function normalizeForIntent(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesAny(text, terms) {
  return terms.some((term) => text.includes(normalizeForIntent(term)));
}

function findSku(value) {
  const match = String(value || "").match(/\bSKU[-:\s]*([A-Za-z0-9._-]{3,60})\b/i);
  return match ? match[1].trim() : null;
}

function findBarcode(value) {
  const match = String(value || "").match(/\b\d{8,14}\b/);
  return match ? match[0] : null;
}

function extractProductTerm(normalized, original, sku, barcode) {
  if (sku || barcode) return sku || barcode;
  let text = normalized
    .replace(/\b(bom dia|boa tarde|boa noite|ola|oi|por favor|quero|gostaria|saber|qual|preco|valor|tem|disponivel|estoque|promocao|produto|vendedor|falar|com|no|na|em|esta|está|de|da|do|o|a|um|uma)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text && original) text = String(original).trim();
  return cleanTerm(text);
}

function cleanTerm(value) {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  return text.length > 120 ? text.slice(0, 120).trim() : text;
}

module.exports = { detectIntent, normalizeForIntent };
