# Implementação V1 — proposta comercial ↔ catálogo

Data: 25/08/2026
Contrato: `docs/COMMERCIAL_PROPOSAL_CATALOG_CONTRACT_V1.md`
Estado: candidato local, sem push/deploy e sem migration oficial

## Resultado

O contrato aprovado foi implementado localmente de forma aditiva:

- `CATALOG_ITEM` e `LEGACY_ITEM` são distintos;
- itens existentes são preservados como legacy;
- itens catalogados recebem referências tenant-scoped e snapshots;
- preço, moeda, SKU, unidade, revisão, validade e versão material são resolvidos
  pelo servidor;
- ProductOffer é evidência de origem e não é apagado por esta migration;
- PDFs históricos usam snapshots persistidos;
- transições materiais de itens catalogados executam revalidação central;
- divergências retornam `PROPOSAL_REVALIDATION_REQUIRED` sem alteração silenciosa;
- desconto automático, autoridade de IA e nova política de desconto continuam
  desativados.

## Arquivos principais

- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/20260825170000_add_commercial_proposal_catalog_items/migration.sql`
- `backend/prisma-postgres/migrations/20260825170000_add_commercial_proposal_catalog_items/migration.sql`
- `backend/src/commercial-proposals/service.js`
- `backend/src/commercial-proposals/pdf.js`
- `frontend/src/services/crmApi.ts`
- `backend/scripts/check-tenant-relation-integrity.cjs`
- `backend/scripts/tenant-isolation-gate.cjs`

## Migration

A migration SQLite e PostgreSQL foi adicionada com:

- preflight fail-closed de itens órfãos;
- `empresaId` determinístico herdado da proposta;
- `itemType` e checks de combinação;
- quatro FKs compostas tenant-scoped;
- `RESTRICT` para ProductOffer/catálogo/estoque;
- cascata somente no item filho da proposta;
- índices e unique compatíveis;
- ações aditivas de histórico;
- sem matching automático de itens antigos;
- sem purge, delete ou alteração de dados comerciais além do backfill
  determinístico exigido pela nova FK.

O gate de tenant foi atualizado para 161 relações e para os hashes das duas
migrations.

## Revalidação

Somente `CATALOG_ITEM` passa pela revalidação antes de:

```text
RASCUNHO → PRONTA
PRONTA → ENVIADA
ENVIADA → ACEITA
```

São comparados diretamente oferta, validade, status, preço Decimal, moeda,
status do preço, catálogo, revisão, SKU, unidade, estoque, materialVersion,
freshness e quantidade. A leitura usa locks PostgreSQL para oferta, catálogo,
produto e saldos quando o provider real estiver disponível.

`LEGACY_ITEM` preserva o comportamento anterior e não exige ProductOffer.

## Evidências

- Prisma SQLite validate: PASS.
- Prisma PostgreSQL derivado validate: PASS.
- Migration sandbox V1: `2/2 PASS`.
- Serviço de proposta/catalogação: `4/4 PASS`.
- PDF/snapshot: `3/3 PASS`.
- Contrato frontend: `1/1 PASS`.
- Frontend global: `197/197 PASS`.
- Frontend build: PASS.
- Frontend lint: PASS.
- `node --check`: PASS nos módulos/scripts alterados.
- `git diff --check`: PASS.

O teste de preparação PostgreSQL continua com `21/22 PASS`; o único caso
restante exige `CRM_TEST_DATABASE_URL`, uma limitação de ambiente conhecida.

## Limitações e gate de publicação

Não foi executado:

- migration contra PostgreSQL descartável real;
- rehearsal PostgreSQL com duas conexões;
- teste de race real em PostgreSQL;
- migration/deploy no banco oficial.

Motivo: esta worktree não possui `dev.db` protegido e a máquina não possui URL
PostgreSQL descartável autorizada/Docker. Portanto o candidato não deve ser
publicado automaticamente. O gate permanece:

```text
POSTGRES_REAL_REHEARSAL=BLOCKED_ENVIRONMENT
PRODUCTION_SCHEMA_MIGRATION=NOT_APPLIED
META_REAL_CHANNELS=OFF
AI_REAL_CONNECTOR=OFF
OUTBOUND=0
```

## Revisão adversarial residual

Antes do canário real ainda é obrigatório provar em PostgreSQL:

- migration transacional e rerun;
- FK/checks/RESTRICT;
- duas conexões concorrentes;
- alteração de preço/estoque intercalada com revalidação;
- ausência de duplicidade de auditoria;
- retenção do ProductOffer e PDF histórico.

Nenhum finding HIGH/CRITICAL novo foi introduzido pelo candidato local, mas a
ausência do rehearsal PostgreSQL impede declarar produção pronta.
