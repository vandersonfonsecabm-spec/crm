# Relatório — PostgreSQL real da Proposta ↔ Catálogo V1

## Estado inicial

- Worktree candidato: `release/ga2-post-e6a`.
- SHA inicial: `0c57e7dc2f6cb62e98451b0f05b5ddfe1f845709`.
- `backend/prisma/dev.db` não foi acessado nem alterado.
- Produção, Railway staging, Vercel, IA, Meta e outbound permaneceram intocados.
- Docker Engine disponível: `29.7.2`.

## O que faltava e foi executado

1. Rehearsal real da sequência completa PostgreSQL em container descartável `postgres:16-alpine`.
2. Migração com banco vazio e fronteiras históricas.
3. Seed representativo antes da V1 para provar o backfill determinístico:
   `ItemPropostaComercial.empresaId <- PropostaComercial.empresaId` e `LEGACY_ITEM`.
4. Validação real das FKs tenant-scoped, CHECKs de `CATALOG_ITEM`/`LEGACY_ITEM`, retenção `ON DELETE RESTRICT`, snapshots, revalidação, Decimal `ROUND_HALF_UP` e CAS concorrente.
5. Rehearsal separado de falha/rollback da migration com item órfão, verificando ausência de DDL parcial e preservação do dado para recuperação.

## Correções necessárias encontradas

- O gate não reconhecia uma migration que adiciona a chave tenant a uma tabela já existente. Foi criado o limite explícito de relações indisponíveis até a migration concluir.
- Expectativas antigas do gate estavam defasadas: fronteira pré-V1 `157` relações e pós-V1 `243` FKs, em vez de `88`/`234`.
- O teste de seed PostgreSQL foi ajustado para não enviar múltiplos comandos em prepared statement.
- O runner passou a incluir o teste real específico da V1 e um comando reproduzível de rollback.

## Resultado dos testes

### Suíte PostgreSQL real

Comando:

```text
npm --prefix backend run test:postgres:real
```

Resultado: `PASS`.

- Imagem: `postgres:16-alpine`.
- Harness: `23` testes declarados.
- Migration boundary: `PASS`.
- Backfill legado: `PASS`.
- V1 real: `1/1 PASS`.
- Suíte completa PostgreSQL: `PASS`.
- Evidência: `%TEMP%\crm-postgres-real\20260826025729160-1344-dab676b2910d.log`.
- Manifesto: `%TEMP%\crm-postgres-real\20260826025729160-1344-dab676b2910d.json`.

O teste V1 real cobriu:

- dois tenants e rejeição de vínculos cruzados;
- CHECK de item catalogado incompleto;
- CHECK de item legado com referência de catálogo;
- ProductOffer, catálogo e estoque protegidos por `RESTRICT`;
- snapshot histórico preservado após mudança de preço;
- preço alterado, oferta expirada/inativa, preço stale, moeda divergente,
  estoque esgotado, material version alterado e disponibilidade stale;
- `10.004 → 1000`, `10.005 → 1001`, `10.006 → 1001` sem float;
- duas atualizações concorrentes, com apenas uma vencendo o CAS.

### Rollback real

Comando:

```text
npm --prefix backend run test:postgres:v1:rollback
```

Resultado: `PASS`.

- A migration falhou no preflight controlado `ITEM_PROPOSTA_COMERCIAL_PARENT_MISSING`.
- `empresaId` e `itemType` não ficaram parcialmente criados.
- O item órfão permaneceu disponível para recuperação.
- O histórico Prisma não marcou a migration como concluída; a falha foi atômica.
- Evidência: `%TEMP%\crm-postgres-real\v1-rollback.log`.

### Verificações auxiliares

- Foco do novo gate: `1/1 PASS`.
- `node --check` dos scripts/testes alterados: `PASS`.
- `git diff --check`: `PASS`.
- Pós-execução Docker: `containers=0`; nenhum container de rehearsal ficou ativo.

Uma execução intermediária apresentou uma falha concorrente transitória já existente no teste de Email inbound. A execução completa seguinte, no mesmo código, passou integralmente; nenhum código de Email foi alterado.

## Arquivos alterados

- `backend/scripts/tenant-isolation-gate.cjs`
- `backend/scripts/run-postgres-tests.cjs`
- `backend/scripts/test-postgres-real.cjs`
- `backend/scripts/rehearse-postgres-v1-rollback.cjs`
- `backend/tests/tenant-isolation-gate.test.js`
- `backend/tests/tenant-isolation-pending-migrations-postgres.test.js`
- `backend/tests/commercial-proposal-catalog-v1-postgres.test.js`
- `backend/package.json`

## Commit e publicação

- Commit local: `afe830d40972d765d33fd1692c2663f4157c554c`.
- Worktree final limpo.
- Push, merge, deploy e migration em ambiente oficial: **não executados**.

## Estado final

```text
COMMERCIAL_PROPOSAL_CATALOG_CONTRACT_V1=APPROVED
POSTGRES_REAL_REHEARSAL=PASS
POSTGRES_V1_BACKFILL=PASS
POSTGRES_V1_CONSTRAINTS=PASS
POSTGRES_V1_REVALIDATION=PASS
POSTGRES_V1_CAS=PASS
POSTGRES_V1_ROLLBACK=PASS
PRODUCTION_DATABASE_ACCESS=0
PRODUCTION_DEPLOY=0
```

O gate que faltava foi fechado no candidato local. A promoção para staging/produção continua sendo uma operação separada e ainda não foi iniciada.

## Addendum de paridade PostgreSQL 18.4

Após o primeiro rehearsal em `postgres:16-alpine`, o runner foi corrigido para
o layout de volume das imagens PostgreSQL 18+. A suíte completa e o rollback
foram repetidos com `POSTGRES_TEST_IMAGE=postgres:18.4`, ambos com `PASS`.

```text
POSTGRES_REAL_REHEARSAL_18_4=PASS
POSTGRES_ROLLBACK_18_4=PASS
```
