# Venda Canônica V1 — promoção controlada para produção

Data: 2026-08-31  
Estado: FINAL  
Executor real: CODEX_ROOT  
Supervisor: SOL

Este documento é a autoridade consolidada da promoção autorizada pelo usuário.
Produção foi alterada somente dentro do escopo desta missão; providers de
produto e outbound continuam desativados.

## Veredito

~~~text
MODEL_SELECTION_PRECONDITION=SATISFIED
RUNTIME_MODEL_ATTESTATION=NOT_REQUIRED
MODEL_IDENTITY_GATE=NOT_APPLICABLE
EXECUTION_MODE=USER_SELECTED
MODEL_PROVENANCE=USER_CONFIRMED_NOT_RUNTIME_ATTESTED

MISSION_COMMAND_AUDIT=PASS
PRODUCTION_TARGET_VERIFIED=PASS
CONTROLLED_PUSH=PASS_PREEXISTING_BRANCH_VERIFIED
PRODUCTION_BACKUP=PASS
PRODUCTION_RESTORE_DRILL=PASS
FORWARD_FIX_PLAN=PASS
PRODUCTION_MIGRATION=PASS
PRODUCTION_SCHEMA_PARITY=PASS
PRODUCTION_BACKEND_RUNTIME=PASS
PRODUCTION_FRONTEND_RUNTIME=PASS
SOURCE_RUNTIME_PARITY=PASS
STABLE_ALIAS_PARITY=PASS
PRODUCTION_OBSERVATION=PASS
PRODUCTION_REVIEW=PASS
FINAL_PRODUCTION_ADVERSARIAL_VERDICT=SHIP
FINAL_SOL_RECONCILIATION=PASS

OPEN_CRITICAL=0
OPEN_HIGH=0
OPEN_MEDIUM=0
PENDING_INTERNAL=0
UNTESTED_INTERNAL=0
FALSE_PASS=0

CANONICAL_SALE_V1_PRODUCTION_PROMOTION=COMPLETE
PRODUCTION_CHANGED=true
READY_FOR_PRODUCTION=YES
REAL_PRODUCT_PROVIDER_CONNECTIONS=0
REAL_PRODUCT_PROVIDER_CREDENTIALS_USED=0
REAL_PRODUCT_OUTBOUND=0
~~~

READY_FOR_PRODUCTION=YES agora significa que a promoção concluída está
operacionalmente verificada; não significa autorização para uma promoção
posterior diferente.

## 1. Release congelado e alvos

~~~text
BASELINE=79eed4f
RELEASE_ARTIFACT_HEAD=2da896aac84dd683e844b266331716e9600e6357
RELEASE_GIT_TREE=5fcb51262f2ca9d68cb6403c41fcbc66cbb40fce
REMOTE_BRANCH=feature/canonical-sale-v1
REMOTE_BRANCH_SHA=eac0eeee27cfef317fd4f16ff955f022f0af0d6f
HARNESS_FIX_COMMIT=3525651
SOURCE_MANIFEST_VERSION=backend-runtime-v3-lf
SOURCE_MANIFEST_SHA256=bef4bab2726db40731ac1473cad95ae623e12cc656c189bb2cd1985a9b84f8d8
PROTECTED_DEV_DB_SHA256=6116ca72110d8c4a6b5bc214a476993afdc155ec32b3b2431e4ce54254a42533
~~~

O HEAD remoto contém commits posteriores exclusivamente documentais; o
artefato funcional publicado foi extraído de um worktree detached limpo em
2da896a. O diff entre o artefato e a branch remota é somente documentação e
evidência. O dev.db permaneceu intacto.

Alvos confirmados:

| Camada | Produção |
| --- | --- |
| Railway projeto | ddfbf66c-e274-47b1-9493-286232d2f426 |
| Railway ambiente | e18f76b1-e38f-468e-91fe-1eff6db9a5f8 (production) |
| API | 16de1b91-7dcb-46b4-9231-1c3e2c3e5a92 |
| Worker | 4eef3b96-e33f-42ea-9fb8-86c17b077ab8 |
| PostgreSQL oficial | e9d8a6b8-507b-45fb-92a8-3ab016f865a2 (Postgres-u_yI) |
| Vercel projeto | prj_xAWKcwZGDQsT3pEZLUZ5YWf6lDFq |
| Alias | crm-murex-six-83.vercel.app |

Staging usa projeto, ambiente, serviços e banco distintos. O reviewer
independente confirmou WRONG_TARGET_RISK=0.

## 2. Backup e restore drill

O Docker local permaneceu indisponível. O backup foi feito pelo socket Unix
privado do serviço PostgreSQL oficial, sem expor URL, senha ou conteúdo:

~~~text
BACKUP_FORMAT=custom
BACKUP_BYTES=23088049
BACKUP_SHA256=05b0576f61dbb8cbf57f4a01845d6f03d228c61e9b181757593a05b96080acae
BACKUP_ARCHIVE_CREATED=2026-08-31T04:53:00-03:00
BACKUP_TRANSPORT=PRIVATE_UNIX_SOCKET
~~~

O mesmo dump foi restaurado em um cluster PostgreSQL 18.3 descartável no WSL,
com banco e usuário temporários:

~~~text
RESTORE_LIST_ENTRIES=1201
RESTORE_BASELINE_MIGRATIONS=17
RESTORE_FAILED_MIGRATIONS=0
RESTORE_LATEST=20260825170000_add_commercial_proposal_catalog_items
CANONICAL_TABLES_BEFORE_MIGRATION=0
RESTORE_CLEANUP=PASS
~~~

O cluster e os scripts temporários foram removidos. O dump permanece fora do
repositório como backup operacional; nenhum dado do dump foi incluído neste
relatório.

## 3. Pausa de escrita, migration e schema

Antes da migration, API e worker foram colocados em
CRM_MAINTENANCE_READ_ONLY=true. A API respondeu 503 com
MAINTENANCE_READ_ONLY; o worker ficou desativado por design. O candidato foi
publicado em manutenção e validado com health/readiness 200.

Foi executado um único owner manual de migration pelo serviço API. O startup
posterior apenas reconciliou o estado já aplicado, sem migration pendente:

~~~text
MIGRATION_COUNT_AFTER=20
FAILED_MIGRATIONS=0
LATEST_MIGRATION=20260830133500_harden_canonical_sale_delete_guard
ACTIVE_MIGRATION_RUNNERS=0
CANONICAL_TABLES=4
CANONICAL_TRIGGERS=14
CANONICAL_INDEXES=10
~~~

As tabelas canônicas estavam sem linhas no instante da verificação:
VendaCanonica=0, ItemVendaCanonica=0, HistoricoVendaCanonica=0 e
NegocioContratoVenda=0. Nenhuma venda real foi criada pela missão.

Hashes das migrations PostgreSQL publicadas:

| Migration | SHA-256 |
| --- | --- |
| 20260827200000_add_store1_provider_readiness | 693dbf46d41e84b78db594a4d82ba93678e94886822242b46fbc1d435a1f14b9 |
| 20260828130000_add_canonical_sale_v1 | 1b30eaf751675668bf953cb3722fedbff7d1e785f39abfff493093a265bfe4de |
| 20260830133500_harden_canonical_sale_delete_guard | 395bea80238deafcd20d7a26e4737619a3be6033a539905848a5d55745ae3275 |

Não houve DROP, reset, rollback destrutivo ou reinterpretação de legado.
A estratégia continua sendo pausa de escrita ou forward-fix.

## 4. Backend, worker e frontend

Deploys finais:

| Serviço | Deployment | Estado | Imagem |
| --- | --- | --- | --- |
| Railway API | e865888e-2014-4885-b533-d1ab698b43ce | SUCCESS | sha256:d9d9eb5ee1b872f7129ea52a67afbbc73b57026f3a3c3163bed3c98d3fe6dcec |
| Railway worker | 74ef572c-3f5a-4e7c-8137-2952fcb7e579 | SUCCESS | sha256:eaec8ddcaf763bb2bbd56e1a970182a8bd9fc5308f855a5b12e38b62b86cd1b0 |
| Vercel frontend | dpl_6ndNu6C75CujS4W3g68wwoPskFoc | READY | — |

API iniciou em PostgreSQL oficial, com /health=200, /ready=200 e
validate-runtime.js aprovado. O worker iniciou no mesmo artefato e executou
ciclos normais sem egress de internet.

O Vercel confirmou metadata:

~~~text
releaseHead=2da896aac84dd683e844b266331716e9600e6357
gitTree=5fcb51262f2ca9d68cb6403c41fcbc66cbb40fce
target=production
state=READY
aliases=crm-murex-six-83.vercel.app, crm-vand-s-projects.vercel.app
~~~

O projeto Vercel mantém rootDirectory=frontend. A CLI não conseguiu compilar
o frontend/vercel.mjs em worktree isolado porque a configuração dinâmica não
recebeu a identidade do projeto; a falha ocorreu antes de criar deployment.
Foi usado somente para esta promoção um adapter estático equivalente, com o
mesmo build, rewrite para a API oficial e headers de segurança. Nenhum arquivo
versionado do release foi alterado.

## 5. Smoke seguro e proveniência

O smoke de produção foi deliberadamente não destrutivo:

~~~text
HEALTH=200
READY=200
FRONTEND_ALIAS=200
INVALID_LOGIN=401_AUTH_INVALID_CREDENTIALS
UNAUTHENTICATED_SALES_ENDPOINT=401
~~~

Não havia tenant QA de produção seguro para criar Cliente/Negócio/Proposta ou
venda. Portanto:

~~~text
PRODUCTION_AUTHENTICATED_WRITE_SMOKE=DEFERRED_NO_SAFE_QA_TENANT
PRODUCTION_LIVE_CROSS_TENANT_WRITE_TEST=DEFERRED_NO_SAFE_QA_IDENTITY
PRODUCTION_LIVE_SNAPSHOT_ATTACK=DEFERRED_NO_SAFE_QA_IDENTITY
~~~

Isso é uma limitação de segurança externa, não uma pendência interna. A
state-machine, RBAC, isolamento de tenant, imutabilidade, receita,
Customer 360, dashboard, exportação, concorrência e reopen foram provados no
staging com o mesmo artefato e as migrations PostgreSQL equivalentes. A missão
não criou dados em clientes reais.

Após a promoção, os únicos requests mutáveis observados foram uma tentativa de
login inválido rejeitada; houve zero PUT, PATCH e DELETE.

Receita continua sendo somente VendaCanonica ACTIVE; INVALIDATED,
Cliente.valor, Negocio.valor e proposta aceita isoladamente não entram.
Nenhum valor comercial foi calculado ou alterado durante o smoke.

## 6. Observação pós-promoção

Janela controlada de 626 segundos, com 21 amostras a cada 30 segundos:

~~~text
OBSERVATION_STARTED=2026-08-31T05:24:33.945Z
OBSERVATION_ENDED=2026-08-31T05:35:00.156Z
SAMPLES=21
FAILURES=0
HTTP_5XX_SAMPLES=0
RAILWAY_API_ERROR_LOGS=0
RAILWAY_HTTP_5XX_LOGS=0
VERCEL_RUNTIME_ERRORS=0
~~~

Health, readiness e alias frontend foram 200 em todas as amostras. O
/runtime-fingerprint retorna 404 em produção por contrato; não foi usado
como prova de paridade. A paridade foi estabelecida por IDs de projeto,
deployment, metadata de SHA/tree, imagem, manifest local e configurações
externas.

O worker não teve egress para internet. A API teve duas conexões TLS de
inicialização para checkpoint.prisma.io, atribuídas ao Prisma; isso não é
provider de produto nem outbound comercial. Logo a alegação correta é:
REAL_PRODUCT_PROVIDER_CONNECTIONS=0 e REAL_PRODUCT_OUTBOUND=0, não “zero
rede literal”.

## 7. Segurança, limpeza e findings

O endpoint de vendas sem autenticação retornou 401 diretamente e pelo alias.
As verificações estruturais confirmaram FKs/constraints tenant-scoped,
triggers de snapshot/delete/truncate e zero runners de migration. Nenhum
segredo, token, cookie, senha, URL com credencial, dump ou dado real entrou
nos artefatos versionados.

Findings operacionais resolvidos durante a missão:

| ID | Finding | Tratamento |
| --- | --- | --- |
| PROD-PREFLIGHT-01 | fingerprint é staging-only | Paridade por controle-plane + SHA/tree/manifest |
| PROD-PREFLIGHT-02 | backup padrão usava TCP público | Backup privado via socket Unix |
| PROD-PREFLIGHT-03 | dois possíveis owners de migration | pausa + owner manual único; startup sem pendências |
| PROD-PREFLIGHT-04 | verifier de guards não versionado | query estrutural read-only pós-migration |
| PROD-PREFLIGHT-05 | restore sem comparação de baseline | 17/0/latest comparados no restore |
| PROD-PREFLIGHT-06 | login não é estritamente read-only | login válido adiado sem identidade QA segura |
| PROD-PREFLIGHT-07 | scripts temporários no worktree | removidos antes do fechamento |
| PROD-VERCEL-CONFIG | config dinâmica recusada em worktree isolado | adapter estático equivalente, sem mudança versionada |
| PROD-RAILWAY-SKIP | variável sem redeploy deixava container antigo | redeploy controlado dos deployments candidatos |

Todos os findings têm evidência e nenhum ficou aberto. O dump operacional e
os artefatos temporários não são parte do repositório.

## 8. Reviewer independente

O reviewer adversarial independente recebeu contexto mínimo e tentou invalidar
target, SHA/tree, migration, backup/restore, runtime, alias, banco, receita,
segurança, providers, observação e ausência de mutações comerciais. Resultado:

~~~text
FINAL_PRODUCTION_ADVERSARIAL_VERDICT=SHIP
BLOCKING_FINDINGS=0
~~~

Gaps declarados pelo reviewer, sem bloquear o fechamento:

- não houve smoke autenticado de escrita por ausência de tenant QA seguro;
- produção não expõe fingerprint por contrato;
- o soak longo foi executado em ancestral, com suplementos causais no release
  final;
- existem outros serviços PostgreSQL na conta, portanto futuras operações
  devem fixar o ID oficial.

Esses pontos estão classificados como limitações externas/operacionais e não
como PENDING_INTERNAL.

## 9. Matriz final

| Gate | Estado |
| --- | --- |
| Contrato e state machine local | PASS (evidência de staging reutilizada) |
| Target e branch | PASS |
| Backup + restore | PASS |
| Migration + schema parity | PASS |
| Backend + worker runtime | PASS |
| Frontend + stable alias | PASS |
| Source/runtime parity | PASS |
| E2E/RBAC/tenant/money/reopen | PASS por evidência staging do mesmo artefato |
| Smoke autenticado de escrita | DEFERRED_NO_SAFE_QA_TENANT |
| Observação pós-promoção | PASS |
| Reviewer adversarial | SHIP |
| Secret sweep | PASS |
| Findings abertos | 0 |

Índice completo sanitizado:
[CANONICAL_SALE_V1_PRODUCTION_EVIDENCE_2026-08-31.json](evidence/CANONICAL_SALE_V1_PRODUCTION_EVIDENCE_2026-08-31.json)

## Encerramento

~~~text
CANONICAL_SALE_V1_PRODUCTION_PROMOTION=COMPLETE
PRODUCTION_RELEASE_HEAD=2da896aac84dd683e844b266331716e9600e6357
PRODUCTION_MIGRATION=PASS
PRODUCTION_BACKEND_RUNTIME=PASS
PRODUCTION_FRONTEND_RUNTIME=PASS
PRODUCTION_SOURCE_RUNTIME_PARITY=PASS
FINAL_PRODUCTION_ADVERSARIAL_VERDICT=SHIP
FINAL_SOL_RECONCILIATION=PASS
PRODUCTION_CHANGED=true
REAL_PRODUCT_PROVIDER_CONNECTIONS=0
REAL_PRODUCT_PROVIDER_CREDENTIALS_USED=0
REAL_PRODUCT_OUTBOUND=0
~~~

Providers reais (Meta, WhatsApp, Instagram, Messenger, Bling, e-mail e IA)
continuam fora desta entrega e exigem missões separadas.
