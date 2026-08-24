const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");
const { Prisma, PrismaClient } = require("@prisma/client");
const { relationSpecs } = require("./check-tenant-relation-integrity.cjs");
const { classifyPolymorphicRows, POLYMORPHIC_ROWS_QUERY } = require("./tenant-isolation-verifier-utils.cjs");
const { sanitizeFailure: sanitizeVerifierFailure } = require("./tenant-isolation-log-utils.cjs");

const EXPECTED_RELATION_COUNT = 157;
const TENANT_RELATION_MANIFEST_VERSION = 1;
const EXPECTED_TENANT_RELATION_MANIFEST_SHA256 = "52544dffd716eb60969b33adc050452fc702bb7ed622afb81188e9cb383733a0";
const DEFAULT_MIGRATION_NAME = "20260801123000_enforce_tenant_safe_relations";
const DEFAULT_MIGRATION_DIR = path.resolve(__dirname, "..", "prisma", "migrations");
const DEFAULT_POSTGRES_MIGRATION_DIR = path.resolve(__dirname, "..", "prisma-postgres", "migrations");
const CANONICAL_MIGRATION_HASHES = Object.freeze({
  sqlite: Object.freeze({
    "20260512022253_init": "43f29671fe8b438e4e0425610f42a7d8e8d797124689e58fab2386460451299e",
    "20260621211000_add_inventory_foundation": "91e587a501e8f5e508bcebe30c7625054bbf4360728d32305db5e9566fb1c74e",
    "20260622083500_sync_current_crm_schema": "eb470779a1af0a74fba1918c4db8ff185a3557f74e24b960d9860def0b260237",
    "20260623093500_add_follow_up_management": "33aaed4ea4bd200e6beb00a09e398c36d8df2669d2466d2b65a9656c60370695",
    "20260624100000_add_company_user_auth_foundation": "7ea99a1d256280aa75e7547aca52bec49610d64ec8e9cdfd780dbea0985ba235",
    "20260704090000_add_integration_hub_foundation": "025d8c2d5f344b57af50965892e4ace3294de98773691f0dbd3686e7b06d0039",
    "20260705103000_add_bling_oauth_state": "a10131355d0362e85cf3bf8d33f6a5c73c447dbc1d7d39cedfb87694f6567cb9",
    "20260705120000_add_channel_foundation": "5f8e2136c7e343add271a2187585677b335e1d679fda328fad0a1fa88eac3750",
    "20260705200000_add_company_scope_to_commercial_core": "61f3e0e926fe4c23162eaf8dac4c889f6553335cdd12e9d7731b977c03e813ec",
    "20260716172157_add_leads_communication_foundation_a": "2fdbcdb9cc61e55cf1be5e7d4c703740e8af84c3ad3fe8a3ca131ead487d2e0e",
    "20260716185853_add_collaborative_reply_controls_b2": "4a2efaec23281437e207f132764267a8e660386abb01c7a3a41b6e3675eb9669",
    "20260716210000_add_site_lead_capture_d1": "9916266d5cced9f21643ff2026b6fff4116508274505ce2fa8cbe5e4ee7c1742",
    "20260717020000_add_tenant_feature_rollout_e1a": "284865616ce1b7d311403bed15d99d00586b7e4ba7b2c4775a1a9f8fd4a297d4",
    "20260717100000_add_lead_to_negocio_conversion_g1": "3e4e1a04cadce51e991f85811734af98ae801185f2151ab16e4fb5184dbc2cc6",
    "20260718140000_add_negocios_kanban_g2a": "965daab2a38f3b3d5b0a3566fc019524bf6f983a40d7d4a7e946d0109afb13dc",
    "20260718184500_add_whatsapp_integration_foundation": "05f678f6e558321232bb0703e7dec6b1ae2bad699d3cfb2032d40ecea988c6a6",
    "20260718205500_add_event_webhook_atomic_payload": "b608cdc4fdb4237e7270962e86d2f4ad88a2d5dc7d0c48da5c240d691358f677",
    "20260721123000_add_inbox_operational_history": "c444d059ea4802bb2db82fb7d829c4869839bdeb0208b5d874481dbc5829272e",
    "20260721213000_add_inbox_commercial_qualification": "b83bd4c38ef25f00b86d3a22be0654ebf558c72604fb0cfcca5dbdbf4634d9b3",
    "20260722013000_add_commercial_proposals": "fae9530dac0f7253ff1296ea0eaf87c5b10899c912c78edda6e6415c0cf718a4",
    "20260722043000_add_agenda_and_followups": "5029c1395945bc4215a205b42b428f5bddfca9f3f30b706de57c769880f9ac85",
    "20260722133000_add_customer_360_fields": "d95a165d005d529193a069f3f943bf4c5a49e2aeb6c9a3cab74a4577ac2448d9",
    "20260726123000_add_business_stage_timing": "3271bd2e1d335c3c57b430f1bd08463ed12e12eaddb2853548000c5928c9cba5",
    "20260726203000_add_internal_automations": "3662aaebb97c4331f18c4f7fb67a706ddb1a5b8927686715f9a606f4ca4215f5",
    "20260727103000_add_platform_tenant_audit": "db26c3c70abb043ee3dd84496f2c779f35c2efb14f2deefe1acb23e5caac1042",
    "20260730160000_add_instagram_direct_schema_foundation": "b58190e751df58fd472226b9cc2268a2984f71972a176a0bb3df60f66a26f5fa",
    "20260731120000_add_messenger_direct_schema_foundation": "fe4556db53d172c7e1fa4cc1a1f6cd19c7ce52947c9d73181b35d23699308c14",
    "20260731190000_add_email_inbound_foundation": "0660390d59dec45a08936c3ffc55eee88c2064eaffff00b12a2b797493f7ac74",
    "20260801123000_enforce_tenant_safe_relations": "1ed42b8752af6234c4abcb3aaff6805d610819848eb8ab6fbb7e4e67b3532b0c",
    "20260801150000_add_user_security_foundation": "b34acdfebadf0ae3badc55af5ca86a64a1627c3aece46edb414463a3c48dbca7",
    "20260811120000_add_meta_credential_store": "41e080170602b2ea9adbd2659829d12ba7637bc989263dfaf1bff21910e924af",
    "20260811130000_add_meta_oauth_state_binding": "08f76dce5d9b4c1b0d44990d116dfb60dd373bb8b988438e1037a9fc9571c34c",
    "20260813150000_add_customer_archive": "5846035e8e1805da9398d6da844d30ae73fa1893b017b7aea8a118bcdf6ec38e",
    "20260815120000_add_h8_notifications": "d9e251b64eed2f4f8c44581437ad64d92c7319bf17482f58a066256cf5a80119",
    "20260823152000_add_distributed_rate_limit": "f61541e812b474efb193e3c92d2c52b757d13b13213ed45abb8771f11e22a443",
    "20260823180000_add_stock_core_e2": "8aa52ca292f1fa175278ec4bb3f7a9906e2176e80f19922a19c7c520470220eb",
    "20260823200000_add_stock_rules_h8_projection": "ec802084d3d4149a5026cd7c670586e671a327073809168333dcc68ea574eafd",
    "20260824150000_add_ai_commerce_catalog_foundation": "724f2e21d329d3d7548201e91de7fc3bd87e6d7f686f9a5c144e620853e5cb0f",
    "20260824160000_add_ai_commerce_persistent_audit_effects": "e0f864286b85e93ab433b83c9661be40b87bc33fa48455fd2cebb79302eeec9d",
  }),
  postgresql: Object.freeze({
    "20260728090000_postgres_baseline": "e07a9fd6240acec419d0d2994ffed69897bdc2b87cd7d4cc15e28cb104ce8975",
    "20260730160000_add_instagram_direct_schema_foundation": "9ad0f2d750d84136eca4292a3a38c346f87cf65ac51ff9aae6af4f76df28500c",
    "20260731120000_add_messenger_direct_schema_foundation": "a1917dbf513b176f50af466a9d7996cd51e1648df32e5db9d383bd7688574231",
    "20260731190000_add_email_inbound_foundation": "3990baeb88605cfde22d8dad088a6571b15e09601b4639f201af3965df3c4ef5",
    "20260801123000_enforce_tenant_safe_relations": "d37a4ddbec32dacece4892c8e09bc457ce53a01a3acb973cb4fe02c992a4fa96",
    "20260801150000_add_user_security_foundation": "176b4502032affd3d779bd968b13094aadc71128681ed937bfffcd0e03776174",
    "20260811120000_add_meta_credential_store": "c5efb656d5483d53ac48eabb33753fad93107362ebc74b91ca0ca036985ab1ff",
    "20260811130000_add_meta_oauth_state_binding": "403951c8fe5fba9e8bc57d739fafab2ad6216c6052ee48380bd270a3586935f4",
    "20260813150000_add_customer_archive": "f473f5f5b0e846b88570860d045027cfd1174c4d5e1d69d6d9008ea4cbd660a7",
    "20260815120000_add_h8_notifications": "7d4c655c4f15b47066229645b761331a9b94deb7b63264ec7e3d81f493eaf3c5",
    "20260823152000_add_distributed_rate_limit": "42428c27f70749c8f923d2580bf5b8291abcd64eb8ba0ebbe0dd11ea0f7cd013",
    "20260823180000_add_stock_core_e2": "900e386b93ab1eb9d0f2eda8472a173c6fec4e8aa4227de342cdd4b6532fd549",
    "20260823200000_add_stock_rules_h8_projection": "c09ea359fbf9608989a99a06f8130c380be470756118c2f2e765931844fdc8d3",
    "20260824120000_fix_stock_postgres_enum_types": "6aaa84e0889bb889f6085188e3778ddde5290197921bf577117db485bc3c0fad",
    "20260824150000_add_ai_commerce_catalog_foundation": "29e51644720f34ffe1c66b9e8a156f6986090ef1733440deafc7e8ece3564988",
    "20260824160000_add_ai_commerce_persistent_audit_effects": "466a71c757a3e79d759e488c57965a4599a02a79c2bc598cbffb5018d17eb2f5",
  }),
});

const CASCADE_RELATIONS = new Set([
  "HistoricoAcompanhamento.acompanhamentoId->Acompanhamento",
  "IntegracaoOAuthState.usuarioId->Usuario",
  "IntegracaoOAuthState.canalIntegracaoId->CanalIntegracao",
  "SincronizacaoIntegracao.integracaoId->Integracao",
  "ErroIntegracao.integracaoId->Integracao",
  "ProdutoExterno.integracaoId->Integracao",
  "EstoqueExterno.integracaoId->Integracao",
  "EstoqueExterno.produtoExternoId->ProdutoExterno",
  "PrecoExterno.integracaoId->Integracao",
  "PrecoExterno.produtoExternoId->ProdutoExterno",
  "CondicaoPagamentoExterna.integracaoId->Integracao",
  "EmailMailboxAddress.canalIntegracaoId->CanalIntegracao",
  "ContatoCanal.canalIntegracaoId->CanalIntegracao",
  "ConversaCanal.canalIntegracaoId->CanalIntegracao",
  "ConversaCanal.contatoCanalId->ContatoCanal",
  "MetaCredential.canalIntegracaoId->CanalIntegracao",
  "MensagemCanal.canalIntegracaoId->CanalIntegracao",
  "MensagemCanal.conversaCanalId->ConversaCanal",
  "EmailMessageMetadata.mensagemCanalId->MensagemCanal",
  "SessaoUsuario.usuarioId->Usuario",
  "SessaoRefreshToken.sessaoId->SessaoUsuario",
  "TokenRecuperacaoSenha.usuarioId->Usuario",
  "HistoricoPropostaComercial.propostaId->PropostaComercial",
  "AutomacaoExecucao.regraId->AutomacaoRegra",
  "AutomacaoAcaoJob.execucaoId->AutomacaoExecucao",
  "AutomacaoRoundRobinEstado.regraId->AutomacaoRegra",
  "Notificacao.destinatarioId->Usuario",
  "PreferenciaNotificacaoUsuario.usuarioId->Usuario",
]);

const GLOBAL_RELATION_EXCEPTIONS = Object.freeze({
  "AuditoriaFuncionalidade.usuarioId->Usuario": Object.freeze({
    fromFields: ["usuarioId"],
    toFields: ["id"],
    scope: "global",
    reason: "AuditoriaFuncionalidade.usuarioId preserva o ator historico global e nullable.",
  }),
  "PlatformTenantAudit.actorUserId->Usuario": Object.freeze({
    fromFields: ["actorUserId"],
    toFields: ["id"],
    scope: "platform",
    reason: "PlatformTenantAudit.actorUserId representa o operador de plataforma global.",
  }),
  "CanalIntegracao.id->MetaCredential": Object.freeze({
    fromFields: ["empresaId", "id", "accessTokenRef"],
    toFields: ["empresaId", "canalIntegracaoId", "reference"],
    scope: "integration",
    reason: "CanalIntegracao aponta para a credencial Meta atual por chave composta opcional e tenant-scoped.",
  }),
});

const MIGRATION_REGISTRY = Object.freeze({
  "20260716172157_add_leads_communication_foundation_a": Object.freeze({
    relationCount: EXPECTED_RELATION_COUNT,
    relationManifestSha256: EXPECTED_TENANT_RELATION_MANIFEST_SHA256,
    sqliteSha256: "2fdbcdb9cc61e55cf1be5e7d4c703740e8af84c3ad3fe8a3ca131ead487d2e0e",
    postgresSha256: null,
    preMigrationUnavailableRelations: Object.freeze([
      "Acompanhamento.conversaCanalId->ConversaCanal",
      "ContatoCanal.clienteId->Cliente",
      "ConversaCanal.responsavelId->Usuario",
    ]),
  }),
  "20260716185853_add_collaborative_reply_controls_b2": Object.freeze({
    relationCount: EXPECTED_RELATION_COUNT,
    relationManifestSha256: EXPECTED_TENANT_RELATION_MANIFEST_SHA256,
    sqliteSha256: "4a2efaec23281437e207f132764267a8e660386abb01c7a3a41b6e3675eb9669",
    postgresSha256: null,
    preMigrationUnavailableRelations: Object.freeze([
      "ConversaCanal.respostaReservadaPorId->Usuario",
      "MensagemCanal.autorUsuarioId->Usuario",
    ]),
  }),
  "20260722043000_add_agenda_and_followups": Object.freeze({
    relationCount: EXPECTED_RELATION_COUNT,
    relationManifestSha256: EXPECTED_TENANT_RELATION_MANIFEST_SHA256,
    sqliteSha256: "5029c1395945bc4215a205b42b428f5bddfca9f3f30b706de57c769880f9ac85",
    postgresSha256: null,
    preMigrationUnavailableRelations: Object.freeze([
      "Acompanhamento.responsavelId->Usuario",
      "Acompanhamento.autorId->Usuario",
      "Acompanhamento.concluidoPorId->Usuario",
      "Acompanhamento.canceladoPorId->Usuario",
    ]),
  }),
  "20260728090000_postgres_baseline": Object.freeze({
    relationCount: EXPECTED_RELATION_COUNT,
    relationManifestSha256: EXPECTED_TENANT_RELATION_MANIFEST_SHA256,
    sqliteSha256: null,
    postgresSha256: "e07a9fd6240acec419d0d2994ffed69897bdc2b87cd7d4cc15e28cb104ce8975",
  }),
  "20260730160000_add_instagram_direct_schema_foundation": Object.freeze({
    relationCount: EXPECTED_RELATION_COUNT,
    relationManifestSha256: EXPECTED_TENANT_RELATION_MANIFEST_SHA256,
    sqliteSha256: "b58190e751df58fd472226b9cc2268a2984f71972a176a0bb3df60f66a26f5fa",
    postgresSha256: "9ad0f2d750d84136eca4292a3a38c346f87cf65ac51ff9aae6af4f76df28500c",
  }),
  "20260731120000_add_messenger_direct_schema_foundation": Object.freeze({
    relationCount: EXPECTED_RELATION_COUNT,
    relationManifestSha256: EXPECTED_TENANT_RELATION_MANIFEST_SHA256,
    sqliteSha256: "fe4556db53d172c7e1fa4cc1a1f6cd19c7ce52947c9d73181b35d23699308c14",
    postgresSha256: "a1917dbf513b176f50af466a9d7996cd51e1648df32e5db9d383bd7688574231",
  }),
  "20260731190000_add_email_inbound_foundation": Object.freeze({
    relationCount: EXPECTED_RELATION_COUNT,
    relationManifestSha256: EXPECTED_TENANT_RELATION_MANIFEST_SHA256,
    sqliteSha256: "0660390d59dec45a08936c3ffc55eee88c2064eaffff00b12a2b797493f7ac74",
    postgresSha256: "3990baeb88605cfde22d8dad088a6571b15e09601b4639f201af3965df3c4ef5",
  }),
  [DEFAULT_MIGRATION_NAME]: Object.freeze({
    relationCount: EXPECTED_RELATION_COUNT,
    relationManifestSha256: EXPECTED_TENANT_RELATION_MANIFEST_SHA256,
    sqliteSha256: "1ed42b8752af6234c4abcb3aaff6805d610819848eb8ab6fbb7e4e67b3532b0c",
    postgresSha256: "d37a4ddbec32dacece4892c8e09bc457ce53a01a3acb973cb4fe02c992a4fa96",
  }),
  "20260801150000_add_user_security_foundation": Object.freeze({
    relationCount: EXPECTED_RELATION_COUNT,
    relationManifestSha256: EXPECTED_TENANT_RELATION_MANIFEST_SHA256,
    sqliteSha256: "b34acdfebadf0ae3badc55af5ca86a64a1627c3aece46edb414463a3c48dbca7",
    postgresSha256: "176b4502032affd3d779bd968b13094aadc71128681ed937bfffcd0e03776174",
  }),
  "20260811120000_add_meta_credential_store": Object.freeze({
    relationCount: EXPECTED_RELATION_COUNT,
    relationManifestSha256: EXPECTED_TENANT_RELATION_MANIFEST_SHA256,
    sqliteSha256: "41e080170602b2ea9adbd2659829d12ba7637bc989263dfaf1bff21910e924af",
    postgresSha256: "c5efb656d5483d53ac48eabb33753fad93107362ebc74b91ca0ca036985ab1ff",
  }),
  "20260811130000_add_meta_oauth_state_binding": Object.freeze({
    relationCount: EXPECTED_RELATION_COUNT,
    relationManifestSha256: EXPECTED_TENANT_RELATION_MANIFEST_SHA256,
    sqliteSha256: "08f76dce5d9b4c1b0d44990d116dfb60dd373bb8b988438e1037a9fc9571c34c",
    postgresSha256: "403951c8fe5fba9e8bc57d739fafab2ad6216c6052ee48380bd270a3586935f4",
    preMigrationUnavailableRelations: Object.freeze([
      "IntegracaoOAuthState.canalIntegracaoId->CanalIntegracao",
    ]),
  }),
  "20260813150000_add_customer_archive": Object.freeze({
    relationCount: EXPECTED_RELATION_COUNT,
    relationManifestSha256: EXPECTED_TENANT_RELATION_MANIFEST_SHA256,
    sqliteSha256: "5846035e8e1805da9398d6da844d30ae73fa1893b017b7aea8a118bcdf6ec38e",
    postgresSha256: "f473f5f5b0e846b88570860d045027cfd1174c4d5e1d69d6d9008ea4cbd660a7",
  }),
  "20260815120000_add_h8_notifications": Object.freeze({
    relationCount: EXPECTED_RELATION_COUNT,
    relationManifestSha256: EXPECTED_TENANT_RELATION_MANIFEST_SHA256,
    sqliteSha256: "d9e251b64eed2f4f8c44581437ad64d92c7319bf17482f58a066256cf5a80119",
    postgresSha256: "7d4c655c4f15b47066229645b761331a9b94deb7b63264ec7e3d81f493eaf3c5",
  }),
  "20260823152000_add_distributed_rate_limit": Object.freeze({
    relationCount: EXPECTED_RELATION_COUNT,
    relationManifestSha256: EXPECTED_TENANT_RELATION_MANIFEST_SHA256,
    sqliteSha256: "f61541e812b474efb193e3c92d2c52b757d13b13213ed45abb8771f11e22a443",
    postgresSha256: "42428c27f70749c8f923d2580bf5b8291abcd64eb8ba0ebbe0dd11ea0f7cd013",
  }),
  "20260823180000_add_stock_core_e2": Object.freeze({
    relationCount: EXPECTED_RELATION_COUNT,
    relationManifestSha256: EXPECTED_TENANT_RELATION_MANIFEST_SHA256,
    sqliteSha256: "8aa52ca292f1fa175278ec4bb3f7a9906e2176e80f19922a19c7c520470220eb",
    postgresSha256: "900e386b93ab1eb9d0f2eda8472a173c6fec4e8aa4227de342cdd4b6532fd549",
  }),
  "20260823200000_add_stock_rules_h8_projection": Object.freeze({
    relationCount: EXPECTED_RELATION_COUNT,
    relationManifestSha256: EXPECTED_TENANT_RELATION_MANIFEST_SHA256,
    sqliteSha256: "ec802084d3d4149a5026cd7c670586e671a327073809168333dcc68ea574eafd",
    postgresSha256: "c09ea359fbf9608989a99a06f8130c380be470756118c2f2e765931844fdc8d3",
  }),
  "20260824120000_fix_stock_postgres_enum_types": Object.freeze({
    relationCount: EXPECTED_RELATION_COUNT,
    relationManifestSha256: EXPECTED_TENANT_RELATION_MANIFEST_SHA256,
    sqliteSha256: null,
    postgresSha256: "6aaa84e0889bb889f6085188e3778ddde5290197921bf577117db485bc3c0fad",
  }),
  "20260824150000_add_ai_commerce_catalog_foundation": Object.freeze({
    relationCount: EXPECTED_RELATION_COUNT,
    relationManifestSha256: EXPECTED_TENANT_RELATION_MANIFEST_SHA256,
    sqliteSha256: "724f2e21d329d3d7548201e91de7fc3bd87e6d7f686f9a5c144e620853e5cb0f",
    postgresSha256: "29e51644720f34ffe1c66b9e8a156f6986090ef1733440deafc7e8ece3564988",
  }),
  "20260824160000_add_ai_commerce_persistent_audit_effects": Object.freeze({
    relationCount: EXPECTED_RELATION_COUNT,
    relationManifestSha256: EXPECTED_TENANT_RELATION_MANIFEST_SHA256,
    sqliteSha256: "e0f864286b85e93ab433b83c9661be40b87bc33fa48455fd2cebb79302eeec9d",
    postgresSha256: "466a71c757a3e79d759e488c57965a4599a02a79c2bc598cbffb5018d17eb2f5",
  }),
});

class GateFailure extends Error {
  constructor(code) {
    super(code);
    this.name = "GateFailure";
    this.code = code;
  }
}

function relationKey(child, childField, parent) {
  return `${child}.${childField}->${parent}`;
}

function relationSpecKey(spec) {
  return relationKey(spec[1], spec[2], spec[3]);
}

function quotedIdentifier(value) {
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(value)) throw new GateFailure("TENANT_GATE_IDENTIFIER_INVALID");
  return `"${value}"`;
}

function normalizeFields(fields) {
  return Array.isArray(fields) ? fields.map(String) : [];
}

function expectedDeleteAction(key) {
  return CASCADE_RELATIONS.has(key) ? "Cascade" : "Restrict";
}

function canonicalRelationManifest(specs = relationSpecs, exceptions = GLOBAL_RELATION_EXCEPTIONS) {
  return {
    version: TENANT_RELATION_MANIFEST_VERSION,
    relations: specs.map(([category, child, childField, parent, tenantKey = "empresaId"]) => {
      const key = relationKey(child, childField, parent);
      return {
        category,
        child,
        childField,
        parent,
        tenantKey,
        onDelete: expectedDeleteAction(key),
        onUpdate: "Restrict",
      };
    }),
    exceptions: Object.entries(exceptions)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => ({
        key,
        fromFields: [...value.fromFields],
        toFields: [...value.toFields],
        scope: value.scope,
        reason: value.reason,
      })),
  };
}

function tenantRelationManifestHash(specs = relationSpecs, exceptions = GLOBAL_RELATION_EXCEPTIONS) {
  return crypto.createHash("sha256")
    .update(JSON.stringify(canonicalRelationManifest(specs, exceptions)))
    .digest("hex");
}

function loadDatamodel() {
  const datamodel = Prisma?.dmmf?.datamodel;
  if (!datamodel || !Array.isArray(datamodel.models)) throw new GateFailure("TENANT_GATE_DMMF_UNAVAILABLE");
  return datamodel;
}

function scalarField(model, name) {
  return model.fields.find((field) => field.kind === "scalar" && field.name === name);
}

function tenantField(model) {
  return scalarField(model, "empresaId") || scalarField(model, "tenantId");
}

function hasUniqueFields(model, fields) {
  const expected = JSON.stringify(fields);
  return (model.uniqueFields || []).some((candidate) => JSON.stringify(candidate) === expected)
    || (model.uniqueIndexes || []).some((candidate) => JSON.stringify(candidate.fields) === expected);
}

function discoverTenantRelations(datamodel) {
  const models = new Map(datamodel.models.map((model) => [model.name, model]));
  const tenantModels = datamodel.models.filter((model) => tenantField(model));
  const candidates = [];

  for (const child of tenantModels) {
    const childTenant = tenantField(child).name;
    for (const field of child.fields.filter((item) => item.kind === "object" && item.relationFromFields?.length)) {
      const parent = models.get(field.type);
      if (!parent || !scalarField(parent, "empresaId")) continue;
      const fromFields = normalizeFields(field.relationFromFields);
      const toFields = normalizeFields(field.relationToFields);
      const childField = fromFields.find((value) => value !== childTenant);
      if (!childField) throw new GateFailure("TENANT_GATE_RELATION_FIELD_INVALID");
      candidates.push({
        child: child.name,
        childField,
        childTenant,
        field: field.name,
        fromFields,
        parent: parent.name,
        toFields,
        relationOnDelete: field.relationOnDelete || "Restrict",
        relationOnUpdate: field.relationOnUpdate || "Restrict",
      });
    }
  }

  return { models, tenantModels, candidates };
}

function inspectArchitecture({
  datamodel = loadDatamodel(),
  specs = relationSpecs,
  exceptions = GLOBAL_RELATION_EXCEPTIONS,
} = {}) {
  const failures = [];
  if (specs.length !== EXPECTED_RELATION_COUNT) failures.push("TENANT_GATE_RELATION_COUNT_MISMATCH");
  const relationManifestHash = tenantRelationManifestHash(specs, exceptions);
  if (relationManifestHash !== EXPECTED_TENANT_RELATION_MANIFEST_SHA256) {
    failures.push("TENANT_GATE_RELATION_MANIFEST_HASH_MISMATCH");
  }

  const { models, tenantModels, candidates } = discoverTenantRelations(datamodel);
  const composite = new Map();
  const simple = new Map();

  for (const candidate of candidates) {
    const key = relationKey(candidate.child, candidate.childField, candidate.parent);
    const isComposite = candidate.fromFields.includes(candidate.childTenant)
      && candidate.toFields.includes("empresaId")
      && candidate.toFields.includes("id");
    const target = isComposite ? composite : simple;
    if (target.has(key)) failures.push("TENANT_GATE_DUPLICATE_RELATION");
    target.set(key, candidate);
  }

  const seenSpecs = new Set();
  for (const spec of specs) {
    const [, child, childField, parent, tenantKey = "empresaId"] = spec;
    const key = relationKey(child, childField, parent);
    if (seenSpecs.has(key)) failures.push("TENANT_GATE_DUPLICATE_MANIFEST");
    seenSpecs.add(key);
    const candidate = composite.get(key);
    if (!candidate) {
      failures.push("TENANT_RELATION_MISSING_FROM_SCHEMA");
      continue;
    }
    const expectedFrom = [tenantKey, childField];
    const expectedTo = ["empresaId", "id"];
    if (JSON.stringify(candidate.fromFields) !== JSON.stringify(expectedFrom)
      || JSON.stringify(candidate.toFields) !== JSON.stringify(expectedTo)) {
      failures.push("TENANT_RELATION_COMPOSITE_KEY_MISMATCH");
    }
    const parentModel = models.get(parent);
    if (!parentModel || !hasUniqueFields(parentModel, expectedTo)) failures.push("TENANT_PARENT_UNIQUE_MISSING");
    if (candidate.relationOnDelete !== expectedDeleteAction(key)) failures.push("TENANT_RELATION_DELETE_ACTION_MISMATCH");
    if (candidate.relationOnUpdate !== "Restrict") failures.push("TENANT_RELATION_UPDATE_ACTION_MISMATCH");
  }

  for (const [key] of composite) if (!seenSpecs.has(key)) failures.push("TENANT_RELATION_NOT_REGISTERED");

  for (const [key, candidate] of simple) {
    const exception = exceptions[key];
    if (!exception) {
      failures.push("TENANT_RELATION_SIMPLE_UNDOCUMENTED");
      continue;
    }
    if (JSON.stringify(candidate.fromFields) !== JSON.stringify(exception.fromFields)
      || JSON.stringify(candidate.toFields) !== JSON.stringify(exception.toFields)) {
      failures.push("TENANT_RELATION_EXCEPTION_SHAPE_MISMATCH");
    }
  }

  for (const [key, expectedException] of Object.entries(GLOBAL_RELATION_EXCEPTIONS)) {
    const candidate = simple.get(key);
    const exception = exceptions[key];
    if (!candidate || !exception) failures.push("TENANT_RELATION_EXCEPTION_MISSING");
    if (!exception?.reason || !exception?.scope || exception.reason !== expectedException.reason || exception.scope !== expectedException.scope) {
      failures.push("TENANT_RELATION_EXCEPTION_UNDOCUMENTED");
    }
  }

  return {
    failures: [...new Set(failures)],
    relationCount: composite.size,
    relationManifestHash,
    tenantModelCount: tenantModels.length,
    discovered: { composite, simple, models },
  };
}

function databaseUrl(env = process.env) {
  const value = String(env.POSTGRES_DATABASE_URL || env.DATABASE_URL || "").trim();
  if (!value) throw new GateFailure("TENANT_GATE_DATABASE_URL_MISSING");
  if (!/^postgres(ql)?:\/\//i.test(value) && !/^file:/i.test(value)) {
    throw new GateFailure("TENANT_GATE_DATABASE_PROTOCOL_INVALID");
  }
  return value;
}

function databaseKind(url) {
  return /^file:/i.test(url) ? "sqlite" : "postgresql";
}

function migrationDirectories(directory) {
  if (!directory || !fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(directory, entry.name, "migration.sql")))
    .map((entry) => entry.name)
    .sort();
}

function splitSqlStatements(sql) {
  const statements = [];
  let current = "";
  let quote = null;
  let lineComment = false;
  let blockComment = false;
  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1];
    if (lineComment) {
      if (char === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (!quote && char === "-" && next === "-") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (!quote && char === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (quote) {
      current += char;
      if (char === quote && sql[index - 1] !== "\\") quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      current += char;
      continue;
    }
    if (char === ";") {
      if (current.trim()) statements.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

function sqlTokens(statement) {
  return String(statement).toUpperCase().match(/[A-Z][A-Z0-9_]*/g) || [];
}

function migrationTouchesTenantRelations(sql, architecture) {
  const tenantTables = new Set();
  for (const candidate of architecture.discovered.composite.values()) {
    tenantTables.add(candidate.child.toUpperCase());
    tenantTables.add(candidate.parent.toUpperCase());
  }
  for (const statement of splitSqlStatements(sql)) {
    const tokens = sqlTokens(statement);
    const hasForeignKey = tokens.includes("FOREIGN") && tokens.includes("KEY");
    const hasReference = tokens.includes("REFERENCES");
    const hasConstraintChange = tokens.includes("CONSTRAINT") && (tokens.includes("ADD") || tokens.includes("DROP"));
    const hasUniqueChange = tokens.includes("UNIQUE") && (tokens.includes("INDEX") || tokens.includes("CONSTRAINT"));
    if (!(hasForeignKey || hasReference || hasConstraintChange || hasUniqueChange)) continue;
    if (tokens.some((token) => tenantTables.has(token))) return true;
  }
  return false;
}

function createdTablesFromMigrationSql(sql) {
  const created = new Set();
  for (const statement of splitSqlStatements(sql)) {
    const tokens = sqlTokens(statement);
    const createIndex = tokens.indexOf("CREATE");
    if (createIndex < 0 || tokens[createIndex + 1] !== "TABLE") continue;
    let tableIndex = createIndex + 2;
    if (tokens[tableIndex] === "IF" && tokens[tableIndex + 1] === "NOT" && tokens[tableIndex + 2] === "EXISTS") {
      tableIndex += 3;
    }
    if (tokens[tableIndex]) created.add(tokens[tableIndex]);
  }
  return created;
}

function createdTablesThroughMigrations(directory, migrationName) {
  if (!directory || !fs.existsSync(directory)) return new Set();
  const names = migrationDirectories(directory);
  const selected = migrationName ? names.filter((name) => name <= migrationName) : names;
  const created = new Set();
  for (const name of selected) {
    const file = path.join(directory, name, "migration.sql");
    if (!fs.existsSync(file)) continue;
    for (const table of createdTablesFromMigrationSql(fs.readFileSync(file, "utf8"))) created.add(table);
  }
  return created;
}

async function pendingMigrationNames({ url, directory, migrationName }) {
  const canonical = migrationDirectories(directory);
  if (canonical.length === 0) throw new GateFailure("TENANT_GATE_MIGRATION_HISTORY_UNKNOWN");
  const expectedLatest = canonical.at(-1);
  if (migrationName && migrationName !== expectedLatest) throw new GateFailure("TENANT_GATE_MIGRATION_LATEST_MISMATCH");
  const kind = databaseKind(url);
  let rows = [];
  let appTableCount = 0;
  if (kind === "postgresql") {
    const client = new Client({ connectionString: url, statement_timeout: 30000 });
    await client.connect();
    try {
      const tables = await client.query("SELECT tablename AS name FROM pg_tables WHERE schemaname = current_schema()");
      appTableCount = tables.rows.filter((row) => String(row.name) !== "_prisma_migrations").length;
      if (tables.rows.some((row) => row.name === "_prisma_migrations")) {
        rows = (await client.query('SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY started_at, id')).rows;
      }
    } finally { await client.end(); }
  } else {
    const prisma = new PrismaClient({ datasourceUrl: url });
    try {
      const tables = await prisma.$queryRawUnsafe("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'");
      appTableCount = tables.filter((row) => String(row.name) !== "_prisma_migrations").length;
      if (tables.some((row) => row.name === "_prisma_migrations")) {
        rows = await prisma.$queryRawUnsafe('SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY started_at, id');
      }
    } finally { await prisma.$disconnect(); }
  }
  if (rows.length === 0 && appTableCount > 0) throw new GateFailure("TENANT_GATE_MIGRATION_HISTORY_MISSING");
  if (rows.length > 0 && appTableCount === 0) throw new GateFailure("TENANT_GATE_MIGRATION_HISTORY_SCHEMA_MISSING");
  const uniqueApplied = validateMigrationHistory(canonical, rows, appTableCount);
  validateAppliedMigrationChecksums(directory, rows);
  const pending = canonical.slice(uniqueApplied.length);
  Object.defineProperty(pending, "appTableCount", { value: appTableCount, enumerable: false });
  return pending;
}

function validateMigrationHistory(canonical, rows, appTableCount = 0) {
  if (rows.length === 0 && appTableCount > 0) throw new GateFailure("TENANT_GATE_MIGRATION_HISTORY_MISSING");
  const applied = [];
  for (const row of rows) {
    const name = String(row.migration_name || "");
    if (!canonical.includes(name)) throw new GateFailure("TENANT_GATE_MIGRATION_HISTORY_UNKNOWN");
    if (!row.finished_at || row.rolled_back_at) throw new GateFailure("TENANT_GATE_MIGRATION_HISTORY_DIRTY");
    applied.push(name);
  }
  const uniqueApplied = [...new Set(applied)];
  if (uniqueApplied.length !== applied.length) throw new GateFailure("TENANT_GATE_MIGRATION_HISTORY_DUPLICATE");
  for (let index = 0; index < uniqueApplied.length; index += 1) {
    if (uniqueApplied[index] !== canonical[index]) throw new GateFailure("TENANT_GATE_MIGRATION_HISTORY_OUT_OF_ORDER");
  }
  return uniqueApplied;
}

function validateAppliedMigrationChecksums(directory, rows) {
  for (const row of rows) {
    const file = path.join(directory, String(row.migration_name || ""), "migration.sql");
    if (!fs.existsSync(file)) throw new GateFailure("TENANT_GATE_MIGRATION_FILE_MISSING");
    const checksum = String(row.checksum || "").trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(checksum) || !migrationChecksumMatches(file, checksum)) {
      throw new GateFailure("TENANT_GATE_MIGRATION_CHECKSUM_MISMATCH");
    }
  }
}

function migrationRegistrationRequired(kind, name) {
  return kind === "postgresql" || String(name) >= DEFAULT_MIGRATION_NAME;
}

function assertCanonicalMigrationSequence(directory, kind, architecture) {
  const hashKey = kind === "postgresql" ? "postgresSha256" : "sqliteSha256";
  const sourceHashes = CANONICAL_MIGRATION_HASHES[kind];
  const names = migrationDirectories(directory);
  for (const name of names) {
    const file = path.join(directory, name, "migration.sql");
    const registry = MIGRATION_REGISTRY[name];
    if (migrationRegistrationRequired(kind, name) && !registry) {
      throw new GateFailure("TENANT_GATE_MIGRATION_UNREGISTERED");
    }
    const actualHash = sha256(file);
    if (!sourceHashes[name] || !migrationHashMatches(file, sourceHashes[name])) {
      throw new GateFailure("TENANT_GATE_MIGRATION_HASH_MISMATCH");
    }
    if (!registry) continue;
    if (!migrationHashMatches(file, registry[hashKey])) throw new GateFailure("TENANT_GATE_MIGRATION_HASH_MISMATCH");
    if (registry.relationCount !== relationSpecs.length) throw new GateFailure("TENANT_GATE_REGISTRY_RELATION_COUNT_MISMATCH");
    if (registry.relationManifestSha256 !== architecture.relationManifestHash) {
      throw new GateFailure("TENANT_GATE_REGISTRY_MANIFEST_HASH_MISMATCH");
    }
  }
  if (JSON.stringify(names) !== JSON.stringify(Object.keys(sourceHashes).sort())) {
    throw new GateFailure("TENANT_GATE_MIGRATION_SET_MISMATCH");
  }
}

function assertPendingRelationBoundary(architecture, key) {
  const spec = relationSpecs.find((candidate) => relationSpecKey(candidate) === key);
  if (!spec) throw new GateFailure("TENANT_GATE_PENDING_RELATION_BOUNDARY_INVALID");
  const [, child, childField] = spec;
  const field = scalarField(architecture.discovered.models.get(child), childField);
  if (!field || field.isRequired) throw new GateFailure("TENANT_GATE_PENDING_RELATION_BOUNDARY_INVALID");
}

async function pendingMigrationBoundary({ url, directory, migrationName, architecture }) {
  const pending = await pendingMigrationNames({ url, directory, migrationName });
  const allowedMissingTables = new Set();
  const unavailableRelationKeys = new Set();
  const kind = databaseKind(url);
  const hashKey = kind === "postgresql" ? "postgresSha256" : "sqliteSha256";
  const sourceHashes = CANONICAL_MIGRATION_HASHES[kind];
  for (const name of pending) {
    const file = path.join(directory, name, "migration.sql");
    if (!fs.existsSync(file)) throw new GateFailure("TENANT_GATE_MIGRATION_FILE_MISSING");
    const sql = fs.readFileSync(file, "utf8");
    const createdTables = createdTablesFromMigrationSql(sql);
    const registry = MIGRATION_REGISTRY[name];
    if (!registry && migrationRegistrationRequired(kind, name)) {
      throw new GateFailure("TENANT_GATE_MIGRATION_UNREGISTERED");
    }
    if (!sourceHashes[name] || !migrationHashMatches(file, sourceHashes[name])) {
      throw new GateFailure("TENANT_GATE_MIGRATION_HASH_MISMATCH");
    }
    if (pending.appTableCount > 0) {
      for (const table of createdTables) allowedMissingTables.add(table);
    }
    if (!registry) continue;
    if (!migrationHashMatches(file, registry[hashKey])) throw new GateFailure("TENANT_GATE_MIGRATION_HASH_MISMATCH");
    if (registry.relationCount !== relationSpecs.length) throw new GateFailure("TENANT_GATE_REGISTRY_RELATION_COUNT_MISMATCH");
    if (registry.relationManifestSha256 !== architecture.relationManifestHash) {
      throw new GateFailure("TENANT_GATE_REGISTRY_MANIFEST_HASH_MISMATCH");
    }
    for (const key of registry.preMigrationUnavailableRelations || []) {
      assertPendingRelationBoundary(architecture, key);
      if (pending.appTableCount > 0) unavailableRelationKeys.add(key);
    }
  }
  return { allowedMissingTables, pendingMigrations: pending, unavailableRelationKeys };
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function migrationChecksumMatches(file, checksum) {
  return migrationHashMatches(file, checksum);
}

function migrationHashMatches(file, expected) {
  const raw = fs.readFileSync(file);
  const text = raw.toString("utf8").replace(/\r\n/g, "\n");
  const lfHash = crypto.createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
  const crlfHash = crypto.createHash("sha256").update(Buffer.from(text.replace(/\n/g, "\r\n"), "utf8")).digest("hex");
  return expected === sha256(file) || expected === lfHash || expected === crlfHash;
}

function inferHashKey(directory) {
  const normalized = path.resolve(directory).replace(/\\/g, "/");
  if (normalized.includes("/prisma-postgres/")) return "postgresSha256";
  if (normalized.includes("/prisma/migrations")) return "sqliteSha256";
  return null;
}

function assertMigrationRegistration({
  architecture,
  migrationDir,
  migrationName,
  sqliteMigrationDir,
  postgresMigrationDir,
} = {}) {
  const inferredMigrationHashKey = migrationDir ? inferHashKey(migrationDir) : null;
  if (migrationDir && !sqliteMigrationDir && !postgresMigrationDir && !inferredMigrationHashKey) {
    throw new GateFailure("TENANT_GATE_MIGRATION_PROVIDER_UNKNOWN");
  }
  const directories = [
    { directory: sqliteMigrationDir, hashKey: "sqliteSha256" },
    { directory: postgresMigrationDir, hashKey: "postgresSha256" },
    ...(!sqliteMigrationDir && !postgresMigrationDir && migrationDir
      ? [{ directory: migrationDir, hashKey: inferredMigrationHashKey }]
      : []),
  ].filter((item) => item.directory);
  if (directories.length === 0) return { migrationName: null, relationAffecting: false };

  const resolvedName = migrationName || migrationDirectories(directories[0].directory).at(-1);
  if (!resolvedName) throw new GateFailure("TENANT_GATE_MIGRATION_MISSING");
  const registry = MIGRATION_REGISTRY[resolvedName];
  let relationAffecting = false;
  let createdTables = null;

  for (const { directory, hashKey } of directories) {
    const file = path.join(directory, resolvedName, "migration.sql");
    if (!fs.existsSync(file)) throw new GateFailure("TENANT_GATE_MIGRATION_FILE_MISSING");
    const kind = hashKey === "postgresSha256" ? "postgresql" : hashKey === "sqliteSha256" ? "sqlite" : null;
    if (kind) assertCanonicalMigrationSequence(directory, kind, architecture);
    const sql = fs.readFileSync(file, "utf8");
    relationAffecting ||= migrationTouchesTenantRelations(sql, architecture);
    const providerCreatedTables = createdTablesFromMigrationSql(sql);
    if (createdTables && JSON.stringify([...createdTables].sort()) !== JSON.stringify([...providerCreatedTables].sort())) {
      throw new GateFailure("TENANT_GATE_MIGRATION_PROVIDER_DRIFT");
    }
    createdTables = providerCreatedTables;
    if (registry && hashKey && !migrationHashMatches(file, registry[hashKey])) throw new GateFailure("TENANT_GATE_MIGRATION_HASH_MISMATCH");
  }

  if (relationAffecting && !registry) throw new GateFailure("TENANT_GATE_MIGRATION_UNREGISTERED");
  if (registry && registry.relationCount !== relationSpecs.length) throw new GateFailure("TENANT_GATE_REGISTRY_RELATION_COUNT_MISMATCH");
  if (registry && registry.relationManifestSha256 !== architecture.relationManifestHash) {
    throw new GateFailure("TENANT_GATE_REGISTRY_MANIFEST_HASH_MISMATCH");
  }
  const result = { migrationName: resolvedName, relationAffecting };
  Object.defineProperty(result, "createdTables", { value: createdTables || new Set(), enumerable: false });
  return result;
}

function assertCanonicalArchitectureMigrations({ architecture, migrationName } = {}) {
  const sqlite = assertMigrationRegistration({
    architecture,
    migrationName,
    sqliteMigrationDir: DEFAULT_MIGRATION_DIR,
  });
  const postgresql = assertMigrationRegistration({
    architecture,
    migrationName,
    postgresMigrationDir: DEFAULT_POSTGRES_MIGRATION_DIR,
  });
  if (sqlite.migrationName !== postgresql.migrationName) {
    throw new GateFailure("TENANT_GATE_MIGRATION_PROVIDER_DRIFT");
  }
  return {
    migrationName: sqlite.migrationName,
    relationAffecting: sqlite.relationAffecting || postgresql.relationAffecting,
    providers: { sqlite, postgresql },
  };
}

function allRelationTables() {
  const tables = new Set();
  for (const [, child, , parent] of relationSpecs) {
    tables.add(child);
    tables.add(parent);
  }
  tables.add("AutomacaoExecucao");
  tables.add("Lead");
  tables.add("Negocio");
  return [...tables];
}

function failureIfUnsafe(result) {
  const totals = result.relations.reduce(
    (sum, item) => ({ orphaned: sum.orphaned + item.orphaned, crossed: sum.crossed + item.crossed }),
    { orphaned: 0, crossed: 0 },
  );
  const polymorphicUnsafe = [
    "invalid_pilot_synthetic",
    "orphaned_lead",
    "crossed_lead",
    "incoherent_lead",
    "orphaned_business",
    "crossed_business",
    "incoherent_business",
  ].some((key) => result.polymorphic[key] > 0);
  if (totals.orphaned > 0 || totals.crossed > 0 || polymorphicUnsafe) throw new GateFailure("TENANT_GATE_DATA_INTEGRITY_FAILED");
  return { totals, polymorphic: result.polymorphic };
}

async function queryRows(client, sql) {
  const result = await client.query(sql);
  return Array.isArray(result) ? result : result.rows;
}

async function relationCount(client, spec, kind) {
  const [, child, foreignKey, parent, tenantKey = "empresaId"] = spec;
  const sql = kind === "postgresql"
    ? `SELECT COUNT(*) FILTER (WHERE p."id" IS NULL)::int AS orphaned, COUNT(*) FILTER (WHERE p."id" IS NOT NULL AND p."empresaId" <> c.${quotedIdentifier(tenantKey)})::int AS crossed FROM ${quotedIdentifier(child)} c LEFT JOIN ${quotedIdentifier(parent)} p ON p."id" = c.${quotedIdentifier(foreignKey)} WHERE c.${quotedIdentifier(foreignKey)} IS NOT NULL`
    : `SELECT COALESCE(SUM(CASE WHEN p."id" IS NULL THEN 1 ELSE 0 END), 0) AS orphaned, COALESCE(SUM(CASE WHEN p."id" IS NOT NULL AND p."empresaId" <> c.${quotedIdentifier(tenantKey)} THEN 1 ELSE 0 END), 0) AS crossed FROM ${quotedIdentifier(child)} c LEFT JOIN ${quotedIdentifier(parent)} p ON p."id" = c.${quotedIdentifier(foreignKey)} WHERE c.${quotedIdentifier(foreignKey)} IS NOT NULL`;
  const row = (await queryRows(client, sql))[0] || {};
  return { category: spec[0], relation: relationSpecKey(spec), orphaned: Number(row.orphaned || 0), crossed: Number(row.crossed || 0) };
}

async function polymorphicCount(client) {
  const rows = await queryRows(client, POLYMORPHIC_ROWS_QUERY);
  return classifyPolymorphicRows(rows);
}

async function listTables(client, kind) {
  const rows = kind === "postgresql"
    ? (await queryRows(client, "SELECT tablename AS name FROM pg_tables WHERE schemaname = current_schema()"))
    : (await queryRows(client, "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"));
  return new Set(rows.map((row) => String(row.name)));
}

async function listColumns(client, kind, tables) {
  const columns = new Map();
  if (kind === "postgresql") {
    const rows = await queryRows(client, "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = current_schema()");
    for (const row of rows) {
      const table = String(row.table_name);
      if (!columns.has(table)) columns.set(table, new Set());
      columns.get(table).add(String(row.column_name));
    }
    return columns;
  }
  for (const table of allRelationTables().filter((name) => tables.has(name))) {
    const rows = await queryRows(client, `PRAGMA table_info(${quotedIdentifier(table)})`);
    columns.set(table, new Set(rows.map((row) => String(row.name))));
  }
  return columns;
}

function relationSpecsForExistingSchema(tables, {
  allowedMissingTables = new Set(),
  columnsByTable,
  unavailableRelationKeys = new Set(),
} = {}) {
  const required = allRelationTables();
  const missing = required.filter((table) => !tables.has(table));
  const allowed = new Set([...allowedMissingTables].map((table) => String(table).toUpperCase()));
  if (missing.some((table) => !allowed.has(table.toUpperCase()))) {
    throw new GateFailure("TENANT_GATE_SCHEMA_INCOMPLETE");
  }
  for (const spec of relationSpecs) {
    const [, child, , parent] = spec;
    if (!tables.has(parent) && tables.has(child) && !allowed.has(parent.toUpperCase())) {
      throw new GateFailure("TENANT_GATE_SCHEMA_INCOMPLETE");
    }
  }
  return relationSpecs.filter((spec) => {
    const [, child, childField, parent, tenantKey = "empresaId"] = spec;
    if (!tables.has(child) || !tables.has(parent)) return false;
    if (!columnsByTable) return true;
    const childColumns = columnsByTable.get(child) || new Set();
    const parentColumns = columnsByTable.get(parent) || new Set();
    if (!childColumns.has(tenantKey) || !parentColumns.has("empresaId") || !parentColumns.has("id")) {
      throw new GateFailure("TENANT_GATE_SCHEMA_INCOMPLETE");
    }
    if (childColumns.has(childField)) return true;
    if (unavailableRelationKeys.has(relationSpecKey(spec))) return false;
    const error = new GateFailure("TENANT_GATE_SCHEMA_INCOMPLETE");
    error.relation = relationSpecKey(spec);
    throw error;
  });
}

async function inspectData(client, kind, {
  allowEmpty = false,
  allowedMissingTables = new Set(),
  unavailableRelationKeys = new Set(),
} = {}) {
  const tables = await listTables(client, kind);
  const required = allRelationTables();
  const present = required.filter((table) => tables.has(table));
  if (present.length === 0) {
    if (allowEmpty) return { emptyDatabase: true, relations: [], polymorphic: {} };
    throw new GateFailure("TENANT_GATE_SCHEMA_EMPTY");
  }
  const columnsByTable = await listColumns(client, kind, tables);
  const inspectableSpecs = relationSpecsForExistingSchema(tables, {
    allowedMissingTables,
    columnsByTable,
    unavailableRelationKeys,
  });
  const relations = [];
  for (const spec of inspectableSpecs) relations.push(await relationCount(client, spec, kind));
  const polymorphicTables = ["AutomacaoExecucao", "Lead", "Negocio"];
  const polymorphic = polymorphicTables.every((table) => tables.has(table))
    ? await polymorphicCount(client)
    : {};
  const result = failureIfUnsafe({ relations, polymorphic });
  return { emptyDatabase: false, relations, checkedRelationCount: relations.length, ...result };
}

function expectedConstraintKey(child, childColumns, parent, parentColumns) {
  return `${child}|${childColumns.join(",")}|${parent}|${parentColumns.join(",")}`;
}

function allowedConstraintKeys() {
  const allowed = new Set();
  for (const [, child, childField, parent, tenantKey = "empresaId"] of relationSpecs) {
    allowed.add(expectedConstraintKey(child, [tenantKey, childField], parent, ["empresaId", "id"]));
  }
  for (const [key, exception] of Object.entries(GLOBAL_RELATION_EXCEPTIONS)) {
    const [left, parent] = key.split("->");
    const [child, childField] = left.split(".");
    allowed.add(expectedConstraintKey(child, exception.fromFields, parent, exception.toFields));
  }
  return allowed;
}

function expectedConstraintActions(child, childField, parent) {
  const key = relationKey(child, childField, parent);
  return { onDelete: expectedDeleteAction(key), onUpdate: "Restrict" };
}

async function postgresForeignKeys(client) {
  const rows = (await client.query(`SELECT child.relname AS "child", parent.relname AS "parent", constraint_row.confdeltype AS "deleteAction", constraint_row.confupdtype AS "updateAction", ARRAY(SELECT child_attribute.attname FROM unnest(constraint_row.conkey) WITH ORDINALITY AS column_list(attnum, ord) JOIN pg_attribute child_attribute ON child_attribute.attrelid = constraint_row.conrelid AND child_attribute.attnum = column_list.attnum ORDER BY column_list.ord) AS "childColumns", ARRAY(SELECT parent_attribute.attname FROM unnest(constraint_row.confkey) WITH ORDINALITY AS column_list(attnum, ord) JOIN pg_attribute parent_attribute ON parent_attribute.attrelid = constraint_row.confrelid AND parent_attribute.attnum = column_list.attnum ORDER BY column_list.ord) AS "parentColumns" FROM pg_constraint constraint_row JOIN pg_class child ON child.oid = constraint_row.conrelid JOIN pg_class parent ON parent.oid = constraint_row.confrelid JOIN pg_namespace child_namespace ON child_namespace.oid = child.relnamespace WHERE constraint_row.contype = 'f' AND child_namespace.nspname = current_schema()`)).rows;
  return rows.map((row) => ({
    ...row,
    childColumns: normalizeDatabaseArray(row.childColumns),
    parentColumns: normalizeDatabaseArray(row.parentColumns),
  }));
}

function normalizeDatabaseArray(value) {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string" && value.startsWith("{") && value.endsWith("}")) {
    return value.slice(1, -1).split(",").filter(Boolean).map((item) => item.replace(/^"|"$/g, ""));
  }
  if (value && typeof value === "object") return Object.values(value).map(String);
  throw new GateFailure("TENANT_GATE_DATABASE_ARRAY_INVALID");
}

function postgresAction(code) {
  return { a: "NoAction", r: "Restrict", c: "Cascade", n: "SetNull", d: "SetDefault" }[code] || "Unknown";
}

function canonicalAction(value) {
  const normalized = String(value || "").toLowerCase().replace(/[^a-z]/g, "");
  return {
    noaction: "NoAction",
    restrict: "Restrict",
    cascade: "Cascade",
    setnull: "SetNull",
    setdefault: "SetDefault",
  }[normalized] || "Unknown";
}

async function postgresUniqueKeys(client) {
  const rows = (await client.query(`SELECT table_class.relname AS "table", ARRAY(SELECT attribute.attname FROM unnest(index_row.indkey) WITH ORDINALITY AS column_list(attnum, ord) JOIN pg_attribute attribute ON attribute.attrelid = index_row.indrelid AND attribute.attnum = column_list.attnum ORDER BY column_list.ord) AS "columns" FROM pg_index index_row JOIN pg_class table_class ON table_class.oid = index_row.indrelid JOIN pg_namespace table_namespace ON table_namespace.oid = table_class.relnamespace WHERE index_row.indisunique AND table_namespace.nspname = current_schema()`)).rows;
  return rows.map((row) => ({ ...row, columns: normalizeDatabaseArray(row.columns) }));
}

async function sqliteForeignKeys(client, tables) {
  const result = [];
  for (const table of tables) {
    const rows = await queryRows(client, `PRAGMA foreign_key_list(${quotedIdentifier(table)})`);
    const groups = new Map();
    for (const row of rows) {
      const id = Number(row.id);
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id).push(row);
    }
    for (const group of groups.values()) {
      group.sort((left, right) => Number(left.seq) - Number(right.seq));
      result.push({
        child: table,
        parent: String(group[0].table),
        childColumns: group.map((row) => String(row.from)),
        parentColumns: group.map((row) => String(row.to)),
        deleteAction: String(group[0].on_delete || "NoAction").replace(" ", ""),
        updateAction: String(group[0].on_update || "NoAction").replace(" ", ""),
      });
    }
  }
  return result;
}

async function sqliteUniqueKeys(client, tables) {
  const result = [];
  for (const table of tables) {
    const indexes = await queryRows(client, `PRAGMA index_list(${quotedIdentifier(table)})`);
    for (const index of indexes.filter((row) => Number(row.unique) === 1)) {
      const columns = await queryRows(client, `PRAGMA index_info(${quotedIdentifier(String(index.name))})`);
      result.push({ table, columns: columns.sort((left, right) => Number(left.seqno) - Number(right.seqno)).map((row) => String(row.name)) });
    }
  }
  return result;
}

async function inspectConstraints(client, kind, architecture) {
  const actual = kind === "postgresql"
    ? await postgresForeignKeys(client)
    : await sqliteForeignKeys(client, allRelationTables());
  const uniques = kind === "postgresql"
    ? await postgresUniqueKeys(client)
    : await sqliteUniqueKeys(client, [...new Set(relationSpecs.map((spec) => spec[3]))]);
  const allowed = allowedConstraintKeys();
  const actualKeys = new Set();
  for (const row of actual) {
    const key = expectedConstraintKey(row.child, row.childColumns, row.parent, row.parentColumns);
    const isTenantParent = architecture.discovered.models.get(row.parent)?.fields?.some((field) => field.kind === "scalar" && field.name === "empresaId");
    const isTenantChild = Boolean(tenantField(architecture.discovered.models.get(row.child) || { fields: [] }));
    if (isTenantParent && isTenantChild && !allowed.has(key)) throw new GateFailure("TENANT_GATE_CONSTRAINT_UNREGISTERED");
    if (allowed.has(key)) actualKeys.add(key);
    if (!allowed.has(key)) continue;
    const expected = expectedConstraintActions(row.child, row.childColumns.find((field) => field !== "empresaId" && field !== "tenantId") || row.childColumns[0], row.parent);
    const onDelete = kind === "postgresql" ? postgresAction(row.deleteAction) : canonicalAction(row.deleteAction);
    const onUpdate = kind === "postgresql" ? postgresAction(row.updateAction) : canonicalAction(row.updateAction);
    if (row.childColumns.length > 1 && (onDelete !== expected.onDelete || onUpdate !== expected.onUpdate)) {
      const error = new GateFailure("TENANT_GATE_CONSTRAINT_ACTION_MISMATCH");
      error.relation = key;
      error.expected = expected;
      error.actual = { onDelete, onUpdate };
      throw error;
    }
  }
  for (const [, child, childField, parent, tenantKey = "empresaId"] of relationSpecs) {
    const key = expectedConstraintKey(child, [tenantKey, childField], parent, ["empresaId", "id"]);
    if (!actualKeys.has(key)) throw new GateFailure("TENANT_GATE_CONSTRAINT_MISSING");
  }
  for (const [relation, exception] of Object.entries(GLOBAL_RELATION_EXCEPTIONS)) {
    const [left, parent] = relation.split("->");
    const [child, childField] = left.split(".");
    const key = expectedConstraintKey(child, exception.fromFields, parent, exception.toFields);
    if (!actualKeys.has(key)) throw new GateFailure("TENANT_GATE_EXCEPTION_CONSTRAINT_MISSING");
  }
  for (const [, , , parent] of relationSpecs) {
    const found = uniques.some((row) => row.table === parent && JSON.stringify(row.columns) === JSON.stringify(["empresaId", "id"]));
    if (!found) throw new GateFailure("TENANT_GATE_PARENT_UNIQUE_MISSING");
  }
  return { checkedForeignKeys: actual.length, checkedUniqueParents: new Set(relationSpecs.map((spec) => spec[3])).size };
}

async function inspectPostgres({ mode, env, architecture, allowEmpty, migrationBoundary }) {
  const url = databaseUrl(env);
  const client = new Client({ connectionString: url, statement_timeout: 30000 });
  await client.connect();
  let rolledBack = false;
  try {
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const data = await inspectData(client, "postgresql", { allowEmpty, ...migrationBoundary });
    const constraints = data.emptyDatabase || mode === "pre-migration" ? null : await inspectConstraints(client, "postgresql", architecture);
    await client.query("ROLLBACK");
    rolledBack = true;
    return { database: "postgresql", data, constraints, rolledBack };
  } finally {
    if (!rolledBack) {
      try { await client.query("ROLLBACK"); } catch {}
    }
    await client.end();
  }
}

async function inspectSqlite({ mode, env, architecture, allowEmpty, migrationBoundary }) {
  const url = databaseUrl(env);
  const prisma = new PrismaClient({ datasourceUrl: url });
  try {
    await prisma.$connect();
    await prisma.$queryRawUnsafe("PRAGMA query_only = ON");
    const data = await inspectData({ query: (sql) => prisma.$queryRawUnsafe(sql) }, "sqlite", { allowEmpty, ...migrationBoundary });
    const constraints = data.emptyDatabase || mode === "pre-migration" ? null : await inspectConstraints({ query: (sql) => prisma.$queryRawUnsafe(sql) }, "sqlite", architecture);
    return { database: "sqlite", data, constraints, rolledBack: false };
  } finally {
    await prisma.$disconnect();
  }
}

function sanitizeFailure(error) {
  return sanitizeVerifierFailure(error, "tenant-isolation-gate");
}

async function runGate({
  mode,
  env = process.env,
  datamodel,
  specs = relationSpecs,
  exceptions = GLOBAL_RELATION_EXCEPTIONS,
  schemaPath,
  migrationDir,
  migrationName,
  sqliteMigrationDir,
  postgresMigrationDir,
} = {}) {
  if (!["architecture", "pre-migration", "post-migration", "production-readonly"].includes(mode)) {
    throw new GateFailure("TENANT_GATE_MODE_INVALID");
  }
  if (schemaPath && (!fs.existsSync(schemaPath) || !fs.statSync(schemaPath).isFile())) throw new GateFailure("TENANT_GATE_SCHEMA_MISSING");
  const architecture = inspectArchitecture({ datamodel: datamodel || loadDatamodel(), specs, exceptions });
  if (architecture.failures.length > 0) throw new GateFailure(architecture.failures[0]);
  const hasArchitectureMigrationDirectory = Boolean(migrationDir || sqliteMigrationDir || postgresMigrationDir);
  const migration = mode === "architecture"
    ? hasArchitectureMigrationDirectory
      ? assertMigrationRegistration({ architecture, migrationDir, migrationName, sqliteMigrationDir, postgresMigrationDir })
      : assertCanonicalArchitectureMigrations({ architecture, migrationName })
    : null;
  if (mode === "architecture") return {
    mode,
    safe: true,
    relationCount: architecture.relationCount,
    relationManifestHash: architecture.relationManifestHash,
    migration,
  };

  const url = databaseUrl(env);
  const kind = databaseKind(url);
  const migrationDirectory = sqliteMigrationDir
    || postgresMigrationDir
    || migrationDir
    || (kind === "postgresql" ? DEFAULT_POSTGRES_MIGRATION_DIR : DEFAULT_MIGRATION_DIR);
  const databaseMigration = assertMigrationRegistration({
    architecture,
    migrationName,
    ...(kind === "postgresql"
      ? { postgresMigrationDir: migrationDirectory }
      : { sqliteMigrationDir: migrationDirectory }),
  });
  const migrationBoundary = mode === "pre-migration"
    ? await pendingMigrationBoundary({ url, directory: migrationDirectory, migrationName: databaseMigration.migrationName, architecture })
    : { allowedMissingTables: new Set(), unavailableRelationKeys: new Set() };
  if (mode !== "pre-migration" && ["post-migration", "production-readonly"].includes(mode)) {
    const pending = await pendingMigrationNames({ url, directory: migrationDirectory, migrationName: databaseMigration.migrationName });
    if (pending.length > 0) throw new GateFailure("TENANT_GATE_MIGRATION_PENDING");
  }
  const database = kind === "postgresql"
    ? await inspectPostgres({
      mode,
      env,
      architecture,
      allowEmpty: mode === "pre-migration" && migrationBoundary.pendingMigrations?.appTableCount === 0,
      migrationBoundary,
    })
    : await inspectSqlite({
      mode,
      env,
      architecture,
      allowEmpty: mode === "pre-migration" && migrationBoundary.pendingMigrations?.appTableCount === 0,
      migrationBoundary,
    });
  if (mode === "production-readonly" && database.database !== "postgresql") throw new GateFailure("TENANT_GATE_PRODUCTION_POSTGRES_REQUIRED");
  return {
    mode,
    safe: true,
    relationCount: architecture.relationCount,
    relationManifestHash: architecture.relationManifestHash,
    migration: databaseMigration,
    database: database.database,
    emptyDatabase: database.data.emptyDatabase,
    checkedRelationCount: database.data.checkedRelationCount || 0,
    totals: database.data.totals || { orphaned: 0, crossed: 0 },
    polymorphic: database.data.polymorphic || {},
    constraints: database.constraints,
    rolledBack: database.rolledBack,
  };
}

async function runCli({ defaultMode } = {}) {
  const args = process.argv.slice(2);
  const mode = args[0] || defaultMode;
  const options = { mode };
  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];
    if (!["--schema", "--migration-dir", "--migration-name", "--sqlite-migration-dir", "--postgres-migration-dir"].includes(arg)) {
      throw new GateFailure("TENANT_GATE_ARGUMENT_INVALID");
    }
    options[arg.slice(2).replaceAll("-", "")] = args[++index];
  }
  const result = await runGate({
    ...options,
    schemaPath: options.schema,
    migrationDir: options.migrationdir,
    migrationName: options.migrationname,
    sqliteMigrationDir: options.sqlitemigrationdir,
    postgresMigrationDir: options.postgresmigrationdir,
  });
  console.log(JSON.stringify({ event: "tenant_isolation_gate", ...result }));
  return result;
}

if (require.main === module) {
  runCli()
    .catch((error) => {
      console.error(JSON.stringify({ event: "tenant_isolation_gate", safe: false, error: sanitizeFailure(error) }));
      process.exitCode = 1;
    });
}

module.exports = {
  CASCADE_RELATIONS,
  DEFAULT_MIGRATION_NAME,
  GLOBAL_RELATION_EXCEPTIONS,
  MIGRATION_REGISTRY,
  EXPECTED_RELATION_COUNT,
  TENANT_RELATION_MANIFEST_VERSION,
  EXPECTED_TENANT_RELATION_MANIFEST_SHA256,
  GateFailure,
  canonicalRelationManifest,
  createdTablesFromMigrationSql,
  createdTablesThroughMigrations,
  pendingMigrationBoundary,
  assertPendingRelationBoundary,
  validateAppliedMigrationChecksums,
  validateMigrationHistory,
  failureIfUnsafe,
  inspectArchitecture,
  migrationRegistrationRequired,
  migrationTouchesTenantRelations,
  relationSpecsForExistingSchema,
  runCli,
  runGate,
  sanitizeFailure,
  tenantRelationManifestHash,
};
