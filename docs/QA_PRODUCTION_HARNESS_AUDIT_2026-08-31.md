# Auditoria Canônica — QA Production Harness V1

Data: 2026-08-31
Status: IMPLEMENTAÇÃO LOCAL VALIDADA; EXECUÇÃO EM STAGING/PRODUÇÃO NÃO INICIADA

## 1. Decisão e escopo

O procedimento QA-only foi auditado antes de qualquer ação. A decisão é
segura em princípio e foi implementada como ferramenta interna transacional,
idempotente e auditável. Não foi autorizado nem executado SQL direto, rota
HTTP pública, convite por e-mail, provider real, outbound, migration oficial,
deploy, push ou escrita em staging/produção.

```text
MISSION_COMMAND_AUDIT=PASS
QA_PRODUCTION_HARNESS_V1=IMPLEMENTED
DIRECT_SQL=FORBIDDEN
PUBLIC_HTTP_ENDPOINT=FORBIDDEN
GLOBAL_PROVIDER_CHANGES=FORBIDDEN
MODEL_SELECTION_PRECONDITION=SATISFIED
RUNTIME_MODEL_ATTESTATION=NOT_REQUIRED
MODEL_IDENTITY_GATE=NOT_APPLICABLE
EXECUTOR_ACTUAL=CODEX_ROOT
```

A seleção de modelo foi registrada somente como pré-condição confirmada pelo
usuário. Não há alegação de que o runtime tenha atestado Luna/NuAuto.

## 2. Candidato congelado

```text
BRANCH=feature/canonical-sale-v1
BASELINE_FUNCTIONAL_RELEASE=2da896aac84dd683e844b266331716e9600e6357
HARNESS_FINAL_HEAD=acbe8fb655c6bd459a8cf75e3271c58838da141c
HARNESS_FINAL_TREE=09cf0332095d1103ad971d7b224386843a55c496
HARNESS_SOURCE_MANIFEST_SHA256=24e16f6b0dd18b99f94f3033f740c8beceb7283d4e3a0c8c62f04940537a13a2
DEV_DB_SHA256=6116ca72110d8c4a6b5bc214a476993afdc155ec32b3b2431e4ce54254a42533
WORKTREE_STATUS=CLEAN
```

Commits do candidato do harness:

- `6cb49b96562f86530da6fe7e6991c18b471b6996` — implementação inicial,
  ADR/runbook, testes, target/attestation, capability e cleanup.
- `acbe8fb655c6bd459a8cf75e3271c58838da141c` — correções finais de
  ciphertext/payload/lease, bundle/junction/orphan, nome do banco e fence de
  convites contra revoke.

## 3. O que foi implementado

- `backend/src/security/qa-provisioning.cjs`: allowlist dos dois tenants e
  cinco identidades, target/DB/source attestation HMAC, backup/restore binding,
  lease PostgreSQL serializable com owner nonce, estados `ABSENT_SAFE`,
  `READY`, `REVOKED`, `INVALID` e `MIXED`, capability única
  `NEGOCIOS_KANBAN`, auditoria obrigatória e transações de apply/revoke.
- `backend/scripts/qa-prod-bootstrap.cjs`: `--dry-run`/`--apply`, target
  explícito, lock local + lease distribuído, credenciais bcrypt efêmeras em
  diretório direto e seguro do TEMP, cleanup fail-closed, no-op em `READY` e
  recuperação de sinal.
- `backend/scripts/qa-prod-status.cjs`: inspeção somente leitura com estado
  fail-closed.
- `backend/scripts/qa-prod-revoke.cjs`: revogação transacional, quarentena,
  limpeza de sessões/tokens/outbox/webhooks/automações/leases/ciphertexts,
  validação estrutural do bundle e `--emergency` com confirmação distinta e
  varredura completa dos bundles do alvo.
- `backend/src/user-security.js`: criação/reenvio de convite com fence CAS
  `Empresa.ativo=true`, serializando com a quarentena QA.
- ADR e runbook versionados em
  `docs/ADR_QA_PRODUCTION_HARNESS_V1.md` e
  `docs/QA_PRODUCTION_HARNESS_RUNBOOK_V1.md`.

## 4. Ledger de findings e retestes

| ID | Severidade | Finding | Correção | Causal retest | Estado |
|---|---|---|---|---|---|
| QA-01 | CRITICAL | Target/DB dependia de variáveis autoapresentadas | atestado externo, URL efetiva e IDs allowlisted | unit + PG | RETESTED |
| QA-02 | HIGH | Capability canônica não era provisionada | `NEGOCIOS_KANBAN` tenant-scoped com auditoria | unit + PG | RETESTED |
| QA-03 | HIGH | Retry podia trocar hashes/sessões | `READY` determinístico no-op | unit + PG | RETESTED |
| QA-04 | HIGH | Status podia parecer aprovado em estado inseguro | estados explícitos e inspeção estrita | unit + PG | RETESTED |
| QA-05 | HIGH | Auditoria podia omitir operador real | operador de plataforma ativo e auditorias obrigatórias | unit + PG | RETESTED |
| QA-06 | HIGH | Worker de staging sem ID fixo | worker staging incluído na allowlist | unit + PG | RETESTED |
| QA-07 | CRITICAL | Backup/restore não precedia toda escrita | gate HMAC e prewrite antes do lease | unit + PG | RETESTED |
| QA-08 | CRITICAL | Source parity era apenas textual | HEAD/tree/manifesto calculados localmente ou build manifest assinado | unit + PG | RETESTED |
| QA-09 | HIGH | Sinal podia deixar tenant pronto sem revoke | confirmação `--emergency`, cleanup verificável | unit + PG | RETESTED |
| QA-10 | HIGH | Resíduos de provider/payload/lease permaneciam | ciphertext/payload/leases anulados e contados | unit + PG | RETESTED |
| QA-11 | HIGH | Bundle podia escapar por caminho aninhado/junction ou run antigo | filho direto do TEMP, `lstat`/realpath, órfãos e todos os runs varridos | unit + PG | RETESTED |
| QA-12 | HIGH | Convite podia vencer revoke por corrida | fence CAS de `Empresa.ativo=true` em create/resend | user-security sandbox + regressão | RETESTED |

Não restou finding interno reproduzível no candidato congelado.

Os reviewers independentes anteriores produziram os findings do ledger acima,
e cada correção teve reteste causal. Uma nova instância final read-only foi
solicitada sobre `acbe8fb`, mas a ferramenta não devolveu resultado dentro da
janela; isso não foi convertido em PASS artificial. Portanto o relatório
mantém o veredito local e deixa a revisão externa de runtime explicitamente
pendente.

## 5. Evidência de testes

### Foco QA e runner

```text
COMMAND=node --test backend\\tests\\qa-prod-bootstrap.test.js backend\\tests\\test-postgres-real-command.test.js
PASS=27
FAIL=0
```

Inclui target/attestation, source manifest, DB-name binding, lease/nonce,
rollback, no-op, revoke, payload/ciphertext cleanup, emergency revoke,
bundle completo, caminho direto/orphan scan, authority de endpoint descartável
e sanitização.

### Segurança de usuários

```text
COMMAND=node backend\\scripts\\run-isolated-prisma-tests.cjs node-test tests\\auth-rate-limiter.test.js
PASS=6
FAIL=0

COMMAND=set CRM_TEST_START_AT=user-security.integration.test.js && npm --prefix backend test
RESULT=PASS
```

As transações de convite/reenvio continuam com tenant ativo e sem outbound.

### PostgreSQL descartável final

O Docker Desktop permaneceu indisponível. Foi usado PostgreSQL 18.3 no WSL,
cluster temporário `/tmp/crm-qa-pg-bootstrap-v9`, banco/usuário sintéticos e
porta local 5432 enquanto nenhum outro cluster estava ativo. O cluster foi parado e removido; `pg_lsclusters`
terminou sem clusters ativos.

```text
COMMAND=node backend\\scripts\\test-postgres-real.cjs
MODE=external-localhost-disposable
IMAGE=postgres:18.6
HARNESS_TESTS=25
STATUS=passed
PG_SUITE_SOURCE_MANIFEST_SHA256=190d27f647ebb2cdcfe15471776891bc20679e1ff6637fc4eaaa25e9e4559a9e
LOG_PATH=C:\\Users\\vande\\AppData\\Local\\Temp\\crm-postgres-real\\20260831190731800-8304-8b68e93f43cb.log
MANIFEST_PATH=C:\\Users\\vande\\AppData\\Local\\Temp\\crm-postgres-real\\20260831190731800-8304-8b68e93f43cb.json
LOG_SHA256=3b423030acbc1928ad74120e5d4a7c68b2200ea2bcb99dc71527b3125aed5c06
CLEANUP=PASS_MANUAL_WSL_CLUSTER_REMOVED
```

A suíte PostgreSQL inclui migrations, isolamento, concorrência, lifecycle,
propostas/catálogo, Venda Canônica e `qa-prod-bootstrap-postgres.test.js`.
Não foi usado banco oficial, staging ou URL desconhecida.

### Regressão backend

```text
COMMAND=npm --prefix backend test
RESULT=PASS
ISOLATED_SANDBOX_CLEANUP=PASS
PROTECTED_DEV_DB_CHANGED=false
```

Houve uma falha transitória anterior em `auth-rate-limiter.test.js`; o teste
isolado exato passou 6/6. A regressão global final, executada novamente no
estado congelado, terminou com exit 0.

## 6. Matriz de gates desta auditoria

```text
QA_HARNESS_IMPLEMENTATION=PASS
QA_BOOTSTRAP_UNIT=PASS
QA_BOOTSTRAP_POSTGRES_DISPOSABLE=PASS
BACKEND_GLOBAL_REGRESSION=PASS
LOCAL_SOURCE_IDENTITY=PASS
LOCAL_CLEANUP=PASS
PENDING_INTERNAL=0
UNTESTED_INTERNAL=0
FALSE_PASS=0

QA_STAGING_DEPLOY=NOT_STARTED
QA_STAGING_AUTHENTICATED_SMOKE=NOT_EXECUTED_EXTERNAL
QA_PROD_CONTROL_PLANE_ATTESTATION=NOT_EXECUTED_EXTERNAL
QA_PROD_PREWRITE_BACKUP=NOT_EXECUTED_EXTERNAL
QA_PROD_AUTHENTICATED_WRITE=NOT_EXECUTED_EXTERNAL
QA_PROD_CROSS_TENANT=NOT_EXECUTED_EXTERNAL
QA_PROD_RBAC=NOT_EXECUTED_EXTERNAL
QA_PROD_SOAK=NOT_EXECUTED_EXTERNAL
QA_PROD_TENANTS_CREATED=0
QA_PROD_USERS_CREATED=0
UNTESTED_EXTERNAL=1
FRESH_FINAL_REVIEWER=NOT_RETURNED_BY_TOOL
```

Esses `NOT_EXECUTED_EXTERNAL` não são falhas do produto: são a fronteira
deliberada desta rodada. O bootstrap exige atestado externo fresco, backup e
restore vinculados ao mesmo run, operador allowlisted e target inequívoco antes
de qualquer `--apply`. O backup anterior da promoção não foi reutilizado como
prova de prewrite.

## 7. Integridade e não-efeitos

```text
PRODUCTION_CHANGED=false
STAGING_CHANGED=false
REAL_CUSTOMERS_TOUCHED=0
GLOBAL_BLING_CHANGED=false
REAL_PROVIDER_CONNECTIONS_CREATED=0
REAL_PROVIDER_CREDENTIALS_USED=0
REAL_OUTBOUND=0
QA_CREDENTIALS_IN_REPORT=0
QA_CREDENTIALS_IN_GIT=0
QA_CREDENTIALS_IN_LOGS=0
```

A integração Bling existente de outro tenant permanece fora do escopo e
intocada. Nenhuma senha, token, cookie, URL de conexão ou dump real aparece
neste relatório.

## 8. Limitações honestas e próxima fase

- A documentação referenciada `docs/SOL_RCD_HARNESS_OPERATING_GUIDE.md` não
  existe neste worktree; isso foi registrado como limitação, não convertido em
  PASS. O ADR/runbook local são a especificação disponível.
- Ainda não houve deploy/HTTP autenticado em staging ou produção, criação dos
  tenants QA, smoke comercial real, cross-tenant/RBAC browser, soak externo ou
  cleanup de fixtures remotas.
- A próxima ação mínima segura é uma missão separada de staging: publicar o
  commit `acbe8fb...`, confirmar source/runtime parity e executar bootstrap
  sintético em staging. Só depois, com atestado e backup novos, avaliar produção.

## 9. Veredito

```text
QA_PRODUCTION_HARNESS_LOCAL=PASS
CANONICAL_SALE_PRODUCTION_RUNTIME=UNCHANGED
PRODUCTION_WRITE_AUTHORIZATION=NOT_GRANTED_BY_THIS_REPORT
READY_FOR_STAGING_REVIEW=YES
READY_FOR_PRODUCTION_QA_WRITE=NO_EXTERNAL_ATTESTATION
FINAL_LOCAL_VERDICT=PASS
FINAL_EXTERNAL_REVIEW=NOT_RETURNED
```

Este documento é a autoridade canônica desta rodada. Ele não declara que a
Venda Canônica QA foi executada em produção; declara que o caminho interno
necessário para fazê-lo com segurança foi implementado, auditado e provado em
sandboxes SQLite/PostgreSQL descartáveis.
