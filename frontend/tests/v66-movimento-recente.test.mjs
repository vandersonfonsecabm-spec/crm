import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const here = dirname(fileURLToPath(import.meta.url));
const sourcePath = join(here, "../src/components/dashboard/recentActivityPresenter.ts");
const source = readFileSync(sourcePath, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
}).outputText;
const presenter = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

const present = (texto, extra = {}) => presenter.presentRecentActivity({ texto, ...extra });

test("preserva texto sem procedência comprovada, incluindo sintaxe que parece técnica", () => {
  const inputs = [
    "Nota simples com acentos: ação concluída",
    "[colchetes legítimos] Origem: escrita pela pessoa",
    "Intencao: FALAR_COM_VENDEDOR",
    "FALAR_COM_VENDEDOR",
    "campo_com_underscore e {\"chave\":\"valor\"}",
    "https://example.test/produto?id=1",
    "🙂 atendimento concluído",
    "linha um\nlinha dois",
    "<script>alert(1)</script>",
    "[[aninhado] ainda humano]",
    "x".repeat(5000),
  ];

  for (const texto of inputs) {
    const result = present(texto);
    assert.equal(result.classification, "UNKNOWN_PROVENANCE");
    assert.equal(result.primaryText, texto);
    assert.equal(result.usedFallback, false);
  }
});

test("classifica texto explicitamente humano sem sanitização destrutiva", () => {
  const texto = "[Origem: interna] FALAR_COM_VENDEDOR_2";
  const result = present(texto, { procedencia: "HUMAN_AUTHORED", trustedProvenance: true });
  assert.equal(result.classification, "HUMAN_AUTHORED");
  assert.equal(result.primaryText, texto);
  assert.equal(result.sourceLabel, null);
});

test("humaniza somente o formato conhecido do simulador e mantém a natureza de teste", () => {
  const texto = "[whatsapp-sim:admin-scenario-vendedor-123] Origem: WhatsApp simulado. Intencao: FALAR_COM_VENDEDOR. Termo: Quero falar com um vendedor. Resultado: produto nao encontrado.";
  const result = present(texto, { procedencia: "KNOWN_TEST_FIXTURE", trustedProvenance: true });
  assert.equal(result.classification, "KNOWN_TEST_FIXTURE");
  assert.equal(result.primaryText, "Quer falar com um vendedor");
  assert.equal(result.sourceLabel, "WhatsApp (teste)");
  assert.match(result.secondaryText, /Mensagem: Quero falar com um vendedor/);
  assert.match(result.secondaryText, /Produto não encontrado no catálogo/);
  assert.doesNotMatch(result.primaryText, /whatsapp-sim|admin-scenario|FALAR_COM_VENDEDOR/);
  assert.doesNotMatch(result.secondaryText, /whatsapp-sim|admin-scenario|FALAR_COM_VENDEDOR/);
});

test("formato de teste sem intenção allowlisted usa fallback honesto", () => {
  const result = present("[whatsapp-sim:qa-1] Origem: WhatsApp simulado. Intencao: ENUM_NOVO. Termo: texto. Resultado: ok.", { procedencia: "KNOWN_TEST_FIXTURE", trustedProvenance: true });
  assert.equal(result.classification, "KNOWN_TEST_FIXTURE");
  assert.equal(result.primaryText, "Interação de teste");
  assert.equal(result.sourceLabel, "WhatsApp (teste)");
  assert.doesNotMatch(result.primaryText, /ENUM_NOVO|qa-1/);
});

test("marcador conhecido sem estrutura não renderiza identificador ou payload cru", () => {
  const result = present("[whatsapp-sim:qa-only]", { procedencia: "KNOWN_TEST_FIXTURE", trustedProvenance: true });
  assert.equal(result.classification, "KNOWN_TEST_FIXTURE");
  assert.equal(result.primaryText, "Interação de teste");
  assert.equal(result.sourceLabel, "WhatsApp (teste)");
});

test("automação explicitamente comprovada usa allowlist e fallback neutro", () => {
  const known = present("CONSULTAR_PRECO", { automated: true, origem: "WhatsApp", trustedProvenance: true });
  assert.equal(known.classification, "SYSTEM_KNOWN");
  assert.equal(known.primaryText, "Perguntou o preço");
  assert.equal(known.sourceLabel, "WhatsApp");

  const unknown = present("ENUM_INTERNO_NOVO", { automated: true, origem: "provider-interno", trustedProvenance: true });
  assert.equal(unknown.classification, "UNKNOWN_PROVENANCE");
  assert.equal(unknown.primaryText, "Atividade registrada");
  assert.equal(unknown.sourceLabel, "Atividade automática");
  assert.doesNotMatch(unknown.primaryText, /ENUM_INTERNO_NOVO/);
  assert.doesNotMatch(unknown.sourceLabel, /provider-interno/);
});

test("teste/legado explicitamente declarados não expõem tipo interno", () => {
  const testResult = present("qualquer payload", { isTest: true, tipo: "whatsapp", trustedProvenance: true });
  assert.equal(testResult.classification, "KNOWN_TEST_FIXTURE");
  assert.equal(testResult.primaryText, "Interação de teste");

  const legacyResult = present("LEGACY_ENUM", { procedencia: "LEGACY_KNOWN", tipo: "legacy_raw", trustedProvenance: true });
  assert.equal(legacyResult.classification, "LEGACY_KNOWN");
  assert.equal(legacyResult.primaryText, "Atividade registrada");
  assert.equal(legacyResult.sourceLabel, "Atividade automática");
});

test("marcador de teste sem procedência confiável não vira fixture conhecida", () => {
  const texto = "[whatsapp-sim:forged-by-note] Origem: WhatsApp simulado. Intencao: FALAR_COM_VENDEDOR. Termo: Quero falar com um vendedor. Resultado: ok.";
  const result = present(texto);
  assert.equal(result.classification, "UNKNOWN_PROVENANCE");
  assert.equal(result.primaryText, "Possível simulação");
  assert.equal(result.sourceLabel, null);
  assert.doesNotMatch(result.primaryText, /whatsapp-sim|forged-by-note|FALAR_COM_VENDEDOR/);
});

test("não há parser destrutivo amplo nem renderização HTML na função", () => {
  assert.doesNotMatch(source, /\\\[\.\*\\\]/);
  assert.doesNotMatch(source, /dangerouslySetInnerHTML|innerHTML|eval\s*\(/);
  assert.match(source, /SIMULATION_MARKER/);
});
