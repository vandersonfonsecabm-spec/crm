const PILOT_SOURCE_TYPE = "PILOT_SYNTHETIC";
const PILOT_SOURCE_MARKER = /"sourceType"\s*:\s*"PILOT_SYNTHETIC"/;
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const POLYMORPHIC_ROWS_QUERY = `SELECT
  e."entidadeTipo" AS "entityType",
  e."entidadeId" AS "entityId",
  e."leadId" AS "leadId",
  e."negocioId" AS "businessId",
  e."empresaId" AS "tenantId",
  e."resumoJson" AS "summaryJson",
  l."id" AS "leadExists",
  l."empresaId" AS "leadTenantId",
  n."id" AS "businessExists",
  n."empresaId" AS "businessTenantId"
FROM "AutomacaoExecucao" e
LEFT JOIN "Lead" l ON l."id" = e."entidadeId" AND e."entidadeTipo" = 'LEAD'
LEFT JOIN "Negocio" n ON n."id" = e."entidadeId" AND e."entidadeTipo" = 'NEGOCIO'`;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isBoundedText(value, maxLength) {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

function isSafeIdentifier(value, maxLength) {
  return isBoundedText(value, maxLength) && SAFE_IDENTIFIER.test(value);
}

function parsePilotSyntheticMetadata(raw) {
  const text = raw == null ? "" : String(raw);
  let value = null;
  try {
    value = text.trim() ? JSON.parse(text) : null;
  } catch {
    return { marked: PILOT_SOURCE_MARKER.test(text), valid: false, value: null };
  }

  const marked = isRecord(value) ? value.sourceType === PILOT_SOURCE_TYPE : PILOT_SOURCE_MARKER.test(text);
  if (!marked) return { marked: false, valid: false, value };

  const valid = isRecord(value)
    && value.sourceType === PILOT_SOURCE_TYPE
    && value.synthetic === true
    && isSafeIdentifier(value.sourceId, 160)
    && isSafeIdentifier(value.idempotencyKey, 180)
    && isRecord(value.payload)
    && isBoundedText(value.payload.name, 120)
    && isBoundedText(value.payload.origin, 80);

  return {
    marked: true,
    valid,
    value: valid ? {
      sourceType: PILOT_SOURCE_TYPE,
      synthetic: true,
      sourceId: value.sourceId,
      idempotencyKey: value.idempotencyKey,
      payload: { name: value.payload.name, origin: value.payload.origin },
    } : null,
  };
}

function classifyPolymorphicRows(rows) {
  const result = {
    synthetic: 0,
    invalid_pilot_synthetic: 0,
    orphaned_lead: 0,
    crossed_lead: 0,
    incoherent_lead: 0,
    orphaned_business: 0,
    crossed_business: 0,
    incoherent_business: 0,
  };

  for (const row of rows) {
    const pilot = parsePilotSyntheticMetadata(row.summaryJson);
    const isSynthetic = pilot.valid
      && row.entityType === "LEAD"
      && row.leadId == null
      && row.businessId == null;

    if (pilot.marked && !isSynthetic) result.invalid_pilot_synthetic += 1;
    if (isSynthetic) {
      result.synthetic += 1;
      continue;
    }

    if (row.entityType === "LEAD") {
      if (row.leadExists == null) result.orphaned_lead += 1;
      if (row.leadExists != null && String(row.leadTenantId) !== String(row.tenantId)) result.crossed_lead += 1;
      if (row.leadId == null || String(row.leadId) !== String(row.entityId) || row.businessId != null) {
        result.incoherent_lead += 1;
      }
    }

    if (row.entityType === "NEGOCIO") {
      if (row.businessExists == null) result.orphaned_business += 1;
      if (row.businessExists != null && String(row.businessTenantId) !== String(row.tenantId)) result.crossed_business += 1;
      if (row.businessId == null || String(row.businessId) !== String(row.entityId) || row.leadId != null) {
        result.incoherent_business += 1;
      }
    }
  }

  return result;
}

module.exports = {
  PILOT_SOURCE_TYPE,
  POLYMORPHIC_ROWS_QUERY,
  classifyPolymorphicRows,
  parsePilotSyntheticMetadata,
};
