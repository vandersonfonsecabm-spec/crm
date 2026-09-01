# QA Production Harness V1 — execução controlada em produção

Data: 2026-08-31
Estado: FINAL
Executor real: `CODEX_ROOT`
Supervisor/gates: `SOL`
Classificação dos dados da aplicação: 100% sintéticos/de teste
Infraestrutura, secrets, tokens e providers externos: tratados como reais

Este relatório é a autoridade consolidada da execução do harness QA-only em
produção. A missão não promoveu uma nova versão comercial; ela validou o
release já publicado usando somente tenants, usuários e fixtures sintéticos.
Não foram usados providers reais nem houve outbound comercial.

## Veredito canônico

```text
MODEL_SELECTION_PRECONDITION=SATISFIED_BY_USER
RUNTIME_MODEL_ATTESTATION=NOT_REQUIRED
MODEL_IDENTITY_GATE=NOT_APPLICABLE
EXECUTION_MODE=USER_SELECTED
MODEL_PROVENANCE=USER_CONFIRMED_NOT_RUNTIME_ATTESTED
EXECUTOR_ACTUAL=CODEX_ROOT

MISSION_COMMAND_AUDIT=PASS
PRODUCTION_TARGET_VERIFIED=PASS
SOURCE_RUNTIME_PARITY=PASS
QA_HARNESS_SOURCE_PARITY=PASS
FULL_RUNTIME_SOURCE_PARITY=PASS
PRODUCTION_BACKUP=PASS
PRODUCTION_RESTORE_DRILL=PASS
PRODUCTION_MIGRATION=PASS
PRODUCTION_SCHEMA_PARITY=PASS
PRODUCTION_BACKEND_RUNTIME=PASS
PRODUCTION_FRONTEND_RUNTIME=PASS
QA_OPERATOR_GATE=PASS_DURING_WINDOW
PRODUCTION_QA_APPLY=PASS
PRODUCTION_AUTHENTICATED_WRITE_SMOKE=PASS
PRODUCTION_QA_REVENUE_PROVENANCE=PASS
PRODUCTION_QA_IDEMPOTENCY=PASS
PRODUCTION_QA_CONCURRENCY=PASS
PRODUCTION_QA_REOPEN=PASS
PRODUCTION_LIVE_CROSS_TENANT_TEST=PASS
PRODUCTION_QA_RBAC=PASS
PRODUCTION_QA_SNAPSHOT_IMMUTABILITY=PASS
PRODUCTION_QA_SOAK=PASS
QA_CREDENTIAL_CLEANUP=PASS
FINAL_SECRET_SWEEP=PASS
FINAL_RUNTIME_QA=PASS
SECURITY_REVIEW=PASS
OPERATIONAL_REVIEW=PASS
FINAL_ADVERSARIAL_VERDICT=SHIP
FINAL_SOL_RECONCILIATION=PASS

OPEN_CRITICAL=0
OPEN_HIGH=0
OPEN_MEDIUM=0
PENDING_INTERNAL=0
UNTESTED_INTERNAL=0
FALSE_PASS=0

CANONICAL_SALE_V1_PRODUCTION_QA=COMPLETE
PRODUCTION_CHANGED=true
QA_TENANTS_RETAINED=true
QA_TENANTS_ACTIVE=false
QA_USERS_ACTIVE=0
QA_SESSIONS=0
QA_REFRESH_TOKENS=0
REAL_PRODUCT_PROVIDER_CONNECTIONS=0
REAL_PRODUCT_PROVIDER_CREDENTIALS_USED=0
REAL_PRODUCT_OUTBOUND=0
```

`PRODUCTION_CHANGED=true` significa que o runtime da API recebeu o harness e
que fixtures sintéticas foram gravadas no banco oficial. Isso não significa
que clientes ou pessoas reais tenham sido alterados: `APPLICATION_DATA` é
inteiramente sintético. O único Bling global existente permaneceu intacto.

## 1. Release, branch e alvo

```text
FUNCTIONAL_RELEASE_BASE=2da896aac84dd683e844b266331716e9600e6357
HARNESS_FUNCTIONAL_CANDIDATE=957c10d74e2f786a96e903978b2eb6919b150bfb
HARNESS_GIT_TREE=3aa54bb2c3860482e66929c92e7304f605b7462f
DOCUMENTATION_HEAD_AT_START=d09df40d365ac0d9e22c5792f754c26af222f29d
BRANCH=feature/canonical-sale-v1
WORKTREE_STATUS=clean
PROTECTED_DEV_DB_SHA256=6116ca72110d8c4a6b5bc214a476993afdc155ec32b3b2431e4ce54254a42533
```

O candidato funcional foi preservado. O HEAD documental posterior não muda a
identidade do artefato funcional. Não houve reset, rebase, force push ou
alteração do `backend/prisma/dev.db`.

Alvos confirmados antes das escritas:

| Camada | Identidade confirmada |
| --- | --- |
| Railway projeto | `glistening-playfulness` (`ddfbf66c-e274-47b1-9493-286232d2f426`) |
| Railway ambiente | `production` (`e18f76b1-e38f-468e-91fe-1eff6db9a5f8`) |
| API | `16de1b91-7dcb-46b4-9231-1c3e2c3e5a92` |
| Worker | `4eef3b96-e33f-42ea-9fb8-86c17b077ab8` |
| PostgreSQL oficial | `e9d8a6b8-507b-45fb-92a8-3ab016f865a2` (`Postgres-u_yI`) |
| Vercel projeto | `prj_xAWKcwZGDQsT3pEZLUZ5YWf6lDFq` |
| Alias frontend | `crm-murex-six-83.vercel.app` |

Staging e produção foram comparados por projeto, ambiente, serviço, banco,
deployment e alias. O risco de alvo incorreto foi zero.

## 2. Backup e restore drill

O `DATABASE_URL` exposto pelo serviço de banco estava stale (`28P01`). Isso
foi classificado como drift de infraestrutura, não como falha do produto. O
backup foi refeito usando a URL efetiva da API em memória, sem imprimir URL,
senha ou conteúdo do banco.

```text
RUN_ID=qa-prod-harness-1788224005260
BACKUP_FORMAT=custom
BACKUP_BYTES=25776513
BACKUP_SHA256=fa1dd9286440160666f20580991cc17b9ce1e081ef90878dae504ca6aa06ce70
BACKUP_PATH=TEMP_SECURE_DIR_OUTSIDE_REPOSITORY/production-prewrite.dump
BACKUP_ACL=OWNER_SYSTEM_ADMIN_ONLY
BACKUP_TRANSPORT=PRIVATE_UNIX_SOCKET
```

O dump foi restaurado em PostgreSQL descartável 18.3 no WSL. O cluster foi
criado fora da aplicação, validado e removido.

```text
RESTORE_LIST_ENTRIES=1351
RESTORE_MIGRATION_COUNT=20
RESTORE_FAILED_MIGRATIONS=0
RESTORE_LATEST=20260830133500_harden_canonical_sale_delete_guard
RESTORE_CANONICAL_TABLES=4
RESTORE_CLEANUP=PASS
```

O dump permanece fora do repositório como backup operacional protegido. Nenhum
registro ou segredo do dump foi anexado ao relatório.

## 3. Migration e runtime

O schema já estava no estado homologado; não foi necessária migration nova
durante o bootstrap QA. A reconciliação confirmou 20 migrations, zero falhas,
zero runners concorrentes e as tabelas/guards canônicos presentes.

```text
PRODUCTION_MIGRATION=PASS
MIGRATION_COUNT=20
FAILED_MIGRATIONS=0
LATEST_MIGRATION=20260830133500_harden_canonical_sale_delete_guard
CANONICAL_TABLES=4
CANONICAL_TRIGGERS=14
CANONICAL_INDEXES=10
```

O primeiro upload incorreto do harness falhou antes do build por causa de
`path-as-root`; o deployment anterior permaneceu saudável. O upload foi
corrigido para um arquivo completo do candidato e o deployment final ficou
saudável:

| Serviço | Deployment final | Estado | Imagem |
| --- | --- | --- | --- |
| API Railway | `2fad0d3a-004e-441b-ae2b-91552285d302` | `SUCCESS/RUNNING` | `sha256:8eadf59c6550bdf9bba533eb0ea3a00912015f4eb46b85a3fbc0b099addca89e` |
| Worker Railway | `74ef572c-3f5a-4e7c-8137-2952fcb7e579` | `SUCCESS/RUNNING` | deployment anterior compatível |
| Frontend Vercel | `dpl_6ndNu6C75CujS4W3g68wwoPskFoc` | `READY` | alias oficial 200 |

Health, readiness, banco e alias retornaram 200. O worker não teve egress para
internet. Duas conexões TLS de inicialização da API para `checkpoint.prisma.io`
foram observadas e classificadas como telemetria do Prisma; não são provider
de produto nem outbound comercial.

## 4. Paridade de source

O runtime de produção não possui `.git`, portanto a paridade foi provada com
arquivo de release, blobs Git, imagem, deployment e manifests sanitizados.

```text
QA_HARNESS_MANIFEST_VERSION=backend-runtime-v3-lf
QA_HARNESS_SOURCE_MANIFEST_SHA256=36069c14396317beb5b2790f94e916fda431959af0151b4634046a7f9aa9f1cd
FULL_RUNTIME_MANIFEST_VERSION=backend-runtime-v3-lf
FULL_RUNTIME_MANIFEST_SHA256=bdba055e0e37b8b324d52252ea39a4fbe7ce7e305d0ce6468abaac32eaef89b5
QA_HARNESS_SOURCE_PARITY=PASS
FULL_RUNTIME_SOURCE_PARITY=PASS
```

O hash `f2b...` encontrado no checkout Windows era apenas a representação
CRLF do manifest, não o arquivo LF enviado ao runtime. O finding de
manifesto ambíguo foi corrigido usando o artefato LF exato; a distinção ficou
registrada para impedir falso PASS futuro.

## 5. Operador e bootstrap QA

Não foi criada rota pública nem usado SQL direto. O bootstrap usou o serviço
interno de identidade, hashing oficial, transação, allowlist e lock. Foi usado
um operador de plataforma já existente e allowlisted no tenant de plataforma;
nenhuma senha ou e-mail foi impresso. Não foi necessário criar um novo
operador global.

```text
QA_OPERATOR_GATE=PASS_DURING_WINDOW
OPERATOR_SOURCE=EXISTING_ALLOWLISTED_PLATFORM_IDENTITY
OPERATOR_CREDENTIALS_IN_REPORT=0
OPERATOR_CREDENTIALS_IN_LOGS=0
```

Tenants e usuários sintéticos criados:

```text
QA_PROD_A_SLUG=qa-prod-canonical-a
QA_PROD_A_TENANT_ID=4
QA_PROD_B_SLUG=qa-prod-canonical-b
QA_PROD_B_TENANT_ID=5
QA_PROD_USERS_CREATED=5
QA_PROD_USER_IDS=17,18,19,20,21
```

Os tenants foram reconhecidos por slug reservado e nunca por semelhança de
nome. Todas as credenciais foram efêmeras; um redeploy que removeu o bundle
acionou revoke emergencial e novo apply idempotente. O estado final foi
verificado depois de outra rotação de chave HMAC.

## 6. Smoke autenticado e proveniência comercial

O smoke foi executado por script remoto no localhost da API, sem imprimir
credenciais. O harness foi ajustado somente nos testes para refletir o
contrato observado da API (POST 200, total de proposta 11.500 centavos e
`Cliente.valor` default 0). O teste final passou:

```text
SMOKE_REQUESTS=38
SMOKE_STATUS=PASS
ACCEPTED_PROPOSAL_ALONE_IS_REVENUE=false
ACTIVE_CANONICAL_SALE_IS_REVENUE=true
MANUAL_CLOSE_ZERO_BRL=PASS
NULL_DISTINCT_FROM_ZERO=PASS
BRL_CENTS_AND_SNAPSHOT=PASS
```

Foram provados:

- proposta principal e vencedora únicas;
- fechamento por proposta com snapshot de item;
- fechamento manual sem proposta com total zero;
- Customer 360, dashboard e CSV usando somente `CanonicalSale ACTIVE`;
- `Cliente.valor` e `Negocio.valor` fora da fonte de receita;
- replay da mesma chave retornando a mesma venda;
- chave igual com fingerprint diferente rejeitada por
  `IDEMPOTENCY_KEY_REUSED`.

## 7. Concorrência, reopen e segurança

Chamadas HTTP simultâneas reais contra PostgreSQL produziram convergência:

```text
accept_vs_accept=[200,409]
close_vs_close=[200,409]
reopen_vs_close=[200,409]
activeSalesAfterRace=0
saleCountAfterRace=1
duplicateActiveSales=0
```

O fluxo de reopen preservou o snapshot anterior, marcou a venda antiga como
`INVALIDATED`, excluiu-a da receita e criou revisão ativa nova. Replay após
invalidação foi rejeitado. O teste de vendedor tentando reopen administrativo
retornou 403.

O teste cross-tenant executou 8/8 tentativas proibidas e todas retornaram 404.
Os ataques seguros ao snapshot bloquearam 7/7 operações: alteração de total,
alteração/remoção de item, item tardio, remoção de venda/contrato e
reativação da venda invalidada. Nenhuma operação destrutiva foi feita fora das
fixtures QA.

## 8. Soak e providers

O soak ficou dentro do envelope aprovado e usou apenas QA-A/QA-B:

```text
SOAK_DURATION=19s
SOAK_ITERATIONS=20
SOAK_REQUESTS=182
SOAK_FAILURES=0
SOAK_HTTP_5XX=0
DUPLICATE_SALES=0
STUCK_OPERATIONS=0
VALUE_DRIFT=0
PROVIDER_EGRESS=0
```

As integrações Meta, WhatsApp, Instagram, Messenger, e-mail, IA e Bling não
foram acionadas pelos tenants QA. A integração Bling global existente foi
consultada e permaneceu inalterada. `REAL_PRODUCT_PROVIDER_CONNECTIONS=0` e
`REAL_PRODUCT_OUTBOUND=0`; isso não nega as duas conexões de telemetria
Prisma descritas acima.

## 9. Cleanup e estado final

O revoke final foi executado depois da última verificação. O estado persistente
é intencionalmente append-only: fixtures e histórico sintéticos permanecem
para auditoria futura, mas identidades e sessões ficam inativas.

```text
QA_TENANTS_RETAINED=true
QA_TENANTS_ACTIVE=false
QA_USERS_ACTIVE=0
QA_SESSIONS=0
QA_REFRESH_TOKENS=0
QA_CREDENTIAL_BUNDLE_PRESENT=false
QA_TEMP_ATTESTATION_PRESENT=false
QA_TEMP_BUILD_MANIFEST_PRESENT=false
QA_PROVIDER_CONNECTIONS=0
QA_OUTBOX=0
QA_WEBHOOKS=0
QA_LEASES=0
```

Inventário final sintético preservado para rastreabilidade:

| Tenant | Clientes | Negócios | Propostas | Vendas | Contratos | Itens | Histórico |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| QA-A | 28 | 26 | 12 | 48 | 26 | 8 | 71 |
| QA-B | 6 | 5 | 0 | 2 | 2 | 0 | 2 |

O global Bling permaneceu com uma conexão ativa e uma credencial cifrada no
tenant original; esse estado não foi alterado. A varredura final não encontrou
segredo, token, senha, cookie, bundle ou manifesto temporário no repositório,
no runtime ou nos logs.

## 10. Ledger de findings

| ID | Classificação | Tratamento | Estado |
| --- | --- | --- | --- |
| `PROD-ENV-001` | URL do serviço DB stale (`28P01`) | backup via URL efetiva da API; restore retestado | `CLOSED/RETESTED` |
| `PROD-UPLOAD-001` | `path-as-root` incorreto | arquivo completo do candidato; deployment final saudável | `CLOSED/RETESTED` |
| `PROD-MANIFEST-001` | manifest CRLF/LF ambíguo | manifest LF exato + full-runtime manifest distinto | `CLOSED/RETESTED` |
| `PROD-SMOKE-HARNESS-001` | expectativa 201 vs API 200 | expectativa focal corrigida; smoke PASS | `CLOSED/RETESTED` |
| `PROD-SMOKE-HARNESS-002` | total de proposta incorreto | asserção corrigida para 11.500 centavos | `CLOSED/RETESTED` |
| `PROD-SMOKE-HARNESS-003` | `Cliente.valor=null` incompatível com schema | validação 0/default e deal estimado/null | `CLOSED/RETESTED` |
| `PROD-CREDENTIAL-001` | bundle perdido após redeploy | revoke emergencial + apply/revoke final | `CLOSED/RETESTED` |
| `PROD-SECRET-001` | ACL ampla em dump/chave HMAC | ACL restrita, HMAC rotacionado, cópias removidas | `CLOSED/RETESTED` |
| `PROD-RESTORE-001` | restore inicialmente só em memória | restore WSL real com output/hash persistidos | `CLOSED/RETESTED` |
| `PROD-DEPLOY-001` | primeiro upload falhou antes do build | classificado como falha de empacotamento; retry seguro | `CLOSED/RETESTED` |

Não há finding crítico, alto, médio ou pendência interna aberta.

## 11. Revisões independentes

O reviewer adversarial de produção recebeu contexto mínimo e tentou invalidar
target, banco, migration, runtime, paridade, receita, idempotência,
concorrência, reopen, tenant, RBAC, snapshot, providers, soak, cleanup e
evidências. Após as correções, os reviewers de backup/migration e adversarial
retornaram:

```text
SECURITY_REVIEW=PASS
OPERATIONAL_REVIEW=PASS
FINAL_PRODUCTION_ADVERSARIAL_VERDICT=SHIP
BLOCKING_FINDINGS=0
```

O veredito não é autocertificação do executor: todos os findings conhecidos
foram reconciliados por Sol e tiveram reteste causal.

## 12. Índice de evidências e limitações

Documentos produzidos nesta reconciliação:

- `docs/QA_PRODUCTION_HARNESS_PRODUCTION_EXECUTION_REPORT_2026-08-31.md`
  (este relatório);
- `docs/evidence/QA_PRODUCTION_HARNESS_PRODUCTION_EXECUTION_2026-08-31.json`
  (índice sanitizado de gates, hashes e resultados);
- `docs/CODEX_STATE.md` (checkpoint canônico atualizado).

O backup operacional está fora do repositório, em diretório com ACL restrita;
seu hash é `fa1dd9286440160666f20580991cc17b9ce1e081ef90878dae504ca6aa06ce70`.
Nenhuma credencial é incluída nos documentos. O runtime não expôs identidade
de modelo, portanto a proveniência registrada é somente a seleção confirmada
pelo usuário; não há alegação de execução Luna/NuAuto atestada pelo host.

## Encerramento

```text
CANONICAL_SALE_V1_PRODUCTION_QA=COMPLETE
PRODUCTION_QA_HARNESS_V1=COMPLETE
FINAL_SOL_RECONCILIATION=PASS
FINAL_ADVERSARIAL_VERDICT=SHIP
PRODUCTION_CHANGED=true
READY_FOR_FUTURE_RELEASE_PROMOTION=YES
PRODUCTION_PRODUCT_PROVIDERS_TOUCHED=false
PRODUCTION_OUTBOUND=false
```

O harness QA permanente foi validado e deixou QA-A/QA-B inativos para futuras
releases. A integração de providers reais, qualquer nova migration ou uma
promoção comercial diferente continuam sendo missões separadas e exigem seus
próprios gates.
