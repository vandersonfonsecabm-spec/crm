export type RecentActivityClassification =
  | "HUMAN_AUTHORED"
  | "SYSTEM_KNOWN"
  | "SYSTEM_KNOWN_MIXED"
  | "LEGACY_KNOWN"
  | "KNOWN_TEST_FIXTURE"
  | "UNKNOWN_PROVENANCE";

export type RecentActivityInput = {
  texto?: unknown;
  tipo?: unknown;
  origem?: unknown;
  procedencia?: unknown;
  provenance?: unknown;
  trustedProvenance?: unknown;
  automated?: unknown;
  isTest?: unknown;
};

export type RecentActivityPresentation = {
  classification: RecentActivityClassification;
  primaryText: string;
  secondaryText: string | null;
  sourceLabel: string | null;
  isTest: boolean;
  usedFallback: boolean;
  reasonCode: string;
};

const SIMULATION_MARKER = /^\[whatsapp-sim:[A-Za-z0-9][A-Za-z0-9._:-]{0,149}\](?:\s+|$)/;
const SIMULATION_ORIGIN = "Origem: WhatsApp simulado.";
const INTENT_LABELS: Record<string, string> = {
  SAUDACAO: "Enviou uma saudação",
  CONSULTAR_PRODUTO: "Consultou um produto",
  CONSULTAR_PRECO: "Perguntou o preço",
  CONSULTAR_ESTOQUE: "Perguntou sobre o estoque",
  CONSULTAR_DISPONIBILIDADE: "Perguntou sobre disponibilidade",
  CONSULTAR_PROMOCAO: "Perguntou sobre promoção",
  FALAR_COM_VENDEDOR: "Quer falar com um vendedor",
  NAO_COMPREENDIDA: "Mensagem não compreendida",
};

export function presentRecentActivity(input: RecentActivityInput): RecentActivityPresentation {
  const rawText = typeof input.texto === "string" ? input.texto : "";
  const markerMatch = rawText.match(SIMULATION_MARKER);

  if (markerMatch) {
    const body = rawText.slice(markerMatch[0].length).trim();
    return isTrustedTest(input) ? presentKnownSimulation(body) : presentInferredSimulation(body);
  }
  if (isExplicitTest(input)) return fallbackPresentation("KNOWN_TEST_FIXTURE", "Interação de teste", "known-test-provenance", true, input);
  if (isExplicitAutomation(input)) return presentKnownOrUnknownAutomation(rawText, input);
  if (hasTrustedProvenance(input) && canonicalProvenance(input.procedencia ?? input.provenance) === "HUMAN_AUTHORED") return presentHumanText(rawText);

  return {
    classification: "UNKNOWN_PROVENANCE",
    primaryText: rawText.trim() ? rawText : "Nota comercial registrada",
    secondaryText: null,
    sourceLabel: null,
    isTest: false,
    usedFallback: !rawText.trim(),
    reasonCode: rawText.trim() ? "unknown-text-preserved" : "unknown-empty-text",
  };
}

function presentHumanText(rawText: string): RecentActivityPresentation {
  return {
    classification: "HUMAN_AUTHORED",
    primaryText: rawText.trim() ? rawText : "Nota comercial registrada",
    secondaryText: null,
    sourceLabel: null,
    isTest: false,
    usedFallback: !rawText.trim(),
    reasonCode: rawText.trim() ? "human-text-preserved" : "human-empty-text",
  };
}

function presentKnownSimulation(body: string): RecentActivityPresentation {
  const parsed = parseSimulationBody(body);
  if (!parsed) return fallbackPresentation("KNOWN_TEST_FIXTURE", "Interação de teste", "known-test-structure-fallback", true, { origem: "WhatsApp Simulado", trustedProvenance: true });

  const intent = parsed.intent.toUpperCase();
  const knownIntent = Object.prototype.hasOwnProperty.call(INTENT_LABELS, intent);
  const secondaryParts: string[] = [];
  if (parsed.term) secondaryParts.push(`Mensagem: ${parsed.term}`);
  const resultText = presentSimulationResult(parsed.result);
  if (resultText) secondaryParts.push(resultText);
  if (secondaryParts.length === 0) secondaryParts.push("Interação registrada");

  return {
    classification: "KNOWN_TEST_FIXTURE",
    primaryText: knownIntent ? INTENT_LABELS[intent] : "Interação de teste",
    secondaryText: secondaryParts.join(" · "),
    sourceLabel: "WhatsApp (teste)",
    isTest: true,
    usedFallback: !knownIntent,
    reasonCode: knownIntent ? `known-test-intent:${intent}` : "known-test-unknown-intent",
  };
}

function presentInferredSimulation(body: string): RecentActivityPresentation {
  const parsed = parseSimulationBody(body);
  const secondaryParts: string[] = [];
  if (parsed?.term) secondaryParts.push(`Mensagem: ${parsed.term}`);
  const resultText = parsed ? presentSimulationResult(parsed.result) : null;
  if (resultText) secondaryParts.push(resultText);

  return {
    classification: "UNKNOWN_PROVENANCE",
    primaryText: "Possível simulação",
    secondaryText: secondaryParts.length > 0 ? secondaryParts.join(" · ") : null,
    sourceLabel: null,
    isTest: false,
    usedFallback: true,
    reasonCode: parsed ? "inferred-test-pattern" : "inferred-test-marker",
  };
}

function presentKnownOrUnknownAutomation(text: string, input: RecentActivityInput): RecentActivityPresentation {
  const normalizedText = text.trim().toUpperCase();
  const knownIntent = INTENT_LABELS[normalizedText];
  const sourceLabel = sourceLabelFor(input);
  if (knownIntent) {
    return {
      classification: "SYSTEM_KNOWN",
      primaryText: knownIntent,
      secondaryText: "Interação registrada",
      sourceLabel,
      isTest: false,
      usedFallback: false,
      reasonCode: `known-automation-intent:${normalizedText}`,
    };
  }

  const provenance = canonicalProvenance(input.procedencia ?? input.provenance);
  const classification: RecentActivityClassification = provenance === "LEGACY_KNOWN" ? "LEGACY_KNOWN" : "UNKNOWN_PROVENANCE";
  return fallbackPresentation(classification, "Atividade registrada", "automatic-fallback", false, input);
}

function parseSimulationBody(body: string) {
  if (!body.startsWith(SIMULATION_ORIGIN)) return null;
  const afterOrigin = body.slice(SIMULATION_ORIGIN.length).trimStart();
  const intentPrefix = "Intencao: ";
  const termToken = ". Termo: ";
  const resultToken = ". Resultado: ";
  if (!afterOrigin.startsWith(intentPrefix)) return null;

  const afterIntentLabel = afterOrigin.slice(intentPrefix.length);
  const termIndex = afterIntentLabel.indexOf(termToken);
  if (termIndex <= 0) return null;
  const intent = afterIntentLabel.slice(0, termIndex).trim();
  const afterTermLabel = afterIntentLabel.slice(termIndex + termToken.length);
  const resultIndex = afterTermLabel.indexOf(resultToken);
  if (resultIndex < 0) return null;
  const term = afterTermLabel.slice(0, resultIndex).trim();
  const result = afterTermLabel.slice(resultIndex + resultToken.length).replace(/\s*\.\s*$/, "").trim();
  if (!intent || !result) return null;
  return { intent, term, result };
}

function presentSimulationResult(value: string) {
  if (!value) return null;
  if (normalize(value) === "produto nao encontrado") return "Produto não encontrado no catálogo";
  return `Resultado: ${value}`;
}

function fallbackPresentation(
  classification: RecentActivityClassification,
  primaryText: string,
  reasonCode: string,
  isTest: boolean,
  input: RecentActivityInput,
): RecentActivityPresentation {
  return {
    classification,
    primaryText,
    secondaryText: null,
    sourceLabel: sourceLabelFor(input) ?? (isTest ? "Interação de teste" : "Atividade automática"),
    isTest,
    usedFallback: true,
    reasonCode,
  };
}

function sourceLabelFor(input: RecentActivityInput): string | null {
  const origin = typeof input.origem === "string" ? input.origem.trim() : "";
  const normalizedOrigin = normalize(origin);
  if (normalizedOrigin === "whatsapp simulado") return "WhatsApp (teste)";
  if (normalizedOrigin === "whatsapp") return "WhatsApp";
  if (normalizedOrigin === "email") return "E-mail";
  if (normalizedOrigin === "messenger") return "Messenger";
  if (normalizedOrigin === "instagram") return "Instagram";
  if (normalizedOrigin === "site") return "Site";
  return null;
}

function isExplicitTest(input: RecentActivityInput) {
  return isTrustedTest(input);
}

function isExplicitAutomation(input: RecentActivityInput) {
  return hasTrustedProvenance(input) && (input.automated === true || ["SYSTEM_KNOWN", "SYSTEM_KNOWN_MIXED", "LEGACY_KNOWN", "UNKNOWN_PROVENANCE"].includes(canonicalProvenance(input.procedencia ?? input.provenance)));
}

function isTrustedTest(input: RecentActivityInput) {
  return hasTrustedProvenance(input) && (input.isTest === true || canonicalProvenance(input.procedencia ?? input.provenance) === "KNOWN_TEST_FIXTURE");
}

function hasTrustedProvenance(input: RecentActivityInput) {
  return input.trustedProvenance === true;
}

function canonicalProvenance(value: unknown) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}
