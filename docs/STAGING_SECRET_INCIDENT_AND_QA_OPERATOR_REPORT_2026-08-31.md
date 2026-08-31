# Relatório canônico — incidente de secrets e QA operator do staging

Data: 2026-08-31
Escopo: remediação do incidente de configuração do staging e execução
controlada do QA Production Harness. Produção não faz parte deste bloco.

## Classificação de dados

Todos os tenants, usuários, clientes, negócios, propostas, vendas e demais
registros da aplicação são sintéticos/de teste. Não há dados pessoais reais no
banco da SaaS. Railway, Vercel, PostgreSQL, credenciais de infraestrutura,
tokens de autenticação e contas de providers externos continuam tratados como
reais até prova contrária.

## Identidade do release

```text
BRANCH=feature/canonical-sale-v1
HARNESS_HEAD=957c10d74e2f786a96e903978b2eb6919b150bfb
GIT_TREE=3aa54bb2c3860482e66929c92e7304f605b7462f
HARNESS_SOURCE_MANIFEST=f2b0535fbd9b95dec385ab3bfc3e2a2b84bbc96e16bf13662c6fd899ea7df15d
EXECUTOR_ACTUAL=CODEX_ROOT
MODEL_SELECTION_PRECONDITION=SATISFIED
RUNTIME_MODEL_ATTESTATION=NOT_REQUIRED
MODEL_IDENTITY_GATE=NOT_APPLICABLE
```

## Incidente e diagnóstico

Uma listagem operacional anterior da Railway exibiu valores de variáveis do
staging em texto puro. Nenhum valor foi reproduzido neste relatório. O método
foi substituído por `backend/scripts/qa-staging-env-sanitized.cjs`, que só
retorna presença, classificação, contagem e fingerprint; `RAW_ENV_DUMP=FORBIDDEN`
é agora regra documentada e testada.

O inventário sanitizado comparou staging com produção sem imprimir valores e
não encontrou segredo compartilhado. Os candidatos rotacionados foram:

```text
DATABASE_URL / POSTGRES_DATABASE_URL = ROTATED
PGPASSWORD / POSTGRES_PASSWORD = ROTATED
JWT_SECRET = ROTATED
INTEGRATION_ENCRYPTION_KEY = ROTATED
STORE1_SOAK_PROBE_TOKEN = ROTATED
```

O domínio privado e flags não secretas foram apenas verificados. A janela
dual-key de integração foi executada com `currentOnlyVerified=true`, zero
linhas de credenciais armazenadas exigindo recriptografia e a variável
`INTEGRATION_ENCRYPTION_KEY_PREVIOUS` foi removida antes do redeploy final.

A senha antiga do papel PostgreSQL do staging foi rejeitada após a alteração;
API e worker foram atualizados para a nova URL e passaram readiness. Uma
transação revogou 10 sessões, 373 refresh tokens e zero resets ativos; a
verificação posterior confirmou zero ativos.

```text
STAGING_SECRET_INCIDENT=RESOLVED
EXPOSED_STAGING_SECRETS_ROTATED=PASS
OLD_DATABASE_VALUE_INVALIDATED=PASS
OLD_REFRESH_SESSIONS_INVALIDATED=PASS
INTEGRATION_CURRENT_ONLY=PASS
RAW_ENV_DUMP_PROHIBITED=PASS
STAGING_HEALTH=PASS
STAGING_READY=PASS
PRODUCTION_CHANGED=false
```

## Target e runtime do staging

```text
RAILWAY_PROJECT=ddfbf66c-e274-47b1-9493-286232d2f426
RAILWAY_ENVIRONMENT=d6b6f137-cffd-4647-a102-3619fc54133a
API_SERVICE=8af12b8e-4f4d-498c-9ceb-3182417905f8
WORKER_SERVICE=25dab463-52c0-4425-825e-c7dcf6a65332
DATABASE_SERVICE=f3a2862b-2371-4ab3-b4db-1e91680ee3b7
FINAL_API_DEPLOYMENT=75a94472-0a41-4053-ae81-b1ef0322b76d
FINAL_WORKER_DEPLOYMENT=9f6cf1d5-1933-490a-b91b-88de515bc33f
API_HEALTH=PASS
API_READINESS=PASS
WORKER_RUNTIME=PASS
SOURCE_RUNTIME_PARITY=PASS
```

Os dois runtimes carregaram o verificador sanitizado; a allowlist de plataforma
terminou ausente após o revoke final. Nenhum provider de produto ou outbound
foi ativado.

## Operador de plataforma

Foi criado um tenant reservado `qa-platform-operator-staging` com uma única
identidade sintética allowlisted durante a janela de execução. O operador não
foi reutilizado de nenhum tenant comercial. O gate passou com target/atestado,
unicidade global, usuário ativo, allowlist exata, inventário comercial zero e
provider isolation zero. O operador foi então revogado e a allowlist removida.

```text
QA_OPERATOR_GATE=PASS_DURING_WINDOW
OPERATOR_PROVISION=PASS
OPERATOR_REVOKE=PASS
OPERATOR_FINAL_STATE=REVOKED
PLATFORM_ADMIN_ALLOWLIST_FINAL=ABSENT
OPERATOR_SESSIONS_FINAL=0
OPERATOR_REFRESH_TOKENS_FINAL=0
```

## QA A/B autenticado

O bootstrap criou exatamente dois tenants e cinco identidades sintéticas. O
smoke autenticado percorreu cliente, negócio, duas propostas, principal,
vencedora, venda por proposta, Customer 360, dashboard e listagem canônica.
Também foram provados:

```text
SALE_SNAPSHOT=PASS
SALE_IDEMPOTENCY=PASS
DIVERGENT_REPLAY=BLOCKED
SALE_REOPEN=PASS
SALE_REVISION=PASS
MANUAL_CLOSE_ZERO=PASS
NULL_DISTINCT_FROM_ZERO=PASS
CROSS_TENANT_A_TO_B=PASS
CROSS_TENANT_B_TO_A=PASS
RBAC_SELLER_REOPEN_BYPASS=BLOCKED
SNAPSHOT_UPDATE_DELETE=BLOCKED
```

O caminho manual gerou uma venda `MANUAL_CLOSE` de zero centavos sem itens;
o caminho por proposta preservou BRL, centavos e itens snapshot.

## Soak e reuso

O soak limitado executou 20 iterações e 220 requests, com zero falhas, HTTP
5xx, duplicidade, value drift, operação travada ou egress de provider. Depois
do primeiro revoke, o bootstrap foi executado novamente: os mesmos IDs foram
reutilizados sem duplicação, novas credenciais foram geradas, o histórico foi
preservado e o segundo revoke/remove de bundle passou.

```text
BOUNDED_SOAK=PASS
SOAK_ITERATIONS=20
SOAK_REQUESTS=220
DUPLICATE_SALES=0
VALUE_DRIFT=0
STUCK_OPERATIONS=0
QA_REUSE=PASS
CREDENTIAL_BUNDLE_FINAL=ABSENT
LEASE_FINAL=ABSENT
```

## Estado final do bloco

```text
QA_TENANTS_RETAINED=true
QA_TENANTS_ACTIVE=false
QA_USERS_ACTIVE=0
QA_SESSIONS=0
QA_REFRESH_TOKENS=0
QA_PROVIDER_CONNECTIONS=0
QA_OUTBOUND=0
REAL_CUSTOMERS_TOUCHED=0
PRODUCTION_CHANGED=false
```

O histórico sintético permaneceu append-only: QA-A reteve 2 vendas e QA-B
reteve 1 venda, todas com snapshots preservados; não houve exclusão destrutiva.

## Revisões

As revisões finais read-only de segurança e operação devem ser registradas
abaixo antes de considerar este checkpoint encerrado:

```text
SECURITY_REVIEW_FINAL=PASS_AFTER_LEASE_RETEST
OPERATIONAL_REVIEW_FINAL=PASS
FINAL_SOL_RECONCILIATION=PASS
```

Este relatório não declara promoção para produção, não usa providers reais e
não contém secrets, tokens, cookies, senhas ou URLs de conexão.
