# Fechamento técnico da SaaS em teste e auditoria Vercel

Data: 2026-08-27

Branch: `codex/store1-release-reconcile`

Base auditada/deployada no staging: `4b0b6beeb1d7cc9fa33d072b6dd0eb5e4463329f`

HEAD funcional local final: `b594c4c`

## Resumo executivo

A execução anterior foi interrompida durante a suíte backend global e perdeu o
canal que entregaria o código de saída. Nenhuma falha funcional havia sido
observada, mas o resultado não podia ser classificado como PASS. A suíte foi
reexecutada uma única vez pelo runner canônico, em sandbox temporária, e
terminou com código `0`.

A investigação reconciliou as evidências de frontend/Vercel, corrigiu o alias
estável de staging e concluiu QA autenticado no domínio final. A API Railway de
staging recebeu o hardening do Bling e permaneceu saudável.

Uma revisão adversarial identificou ainda que o parser OAuth do Bling aceitava
valores não string por coerção. A correção fail-closed foi implementada,
testada e publicada somente no staging a partir do commit funcional
`b594c4c`. Produção permaneceu inalterada.

## Estado inicial recuperado

```text
BRANCH=codex/store1-release-reconcile
HEAD_RECOVERED=723866fdf566d9850e7cf01e1967d91d06b35fee
WORKTREE_CLEAN=true
RUNTIME_DIFF_4B0_TO_723=DOCUMENTATION_ONLY
BACKEND_GLOBAL_SUITE=INDETERMINATE
PROTECTED_DEV_DB_SHA256=6116ca72110d8c4a6b5bc214a476993afdc155ec32b3b2431e4ce54254a42533
PRODUCTION_WRITES=0
```

## Correções e reconciliações

### 1. Evidência backend global

- a primeira tentativa correta falhou antes dos testes porque a worktree
  isolada não possuía o fixture local ignorado pelo Git;
- uma cópia temporária, regular e verificada do fixture protegido foi criada
  somente na worktree;
- o runner manteve todos os bancos de teste em `%TEMP%/crm-prisma-tests`;
- a suíte global terminou com exit code `0` e cleanup concluído;
- casos PostgreSQL-only permaneceram `SKIP` por contrato;
- a cópia temporária foi removida;
- o banco protegido original preservou o SHA-256 esperado.

Resultado:

```text
BACKEND_GLOBAL_SUITE=PASS
TENANT_ISOLATION_GATE=PASS
SANDBOX_CLEANUP=PASS
PROTECTED_DEV_DB_CHANGED=false
```

### 2. Hardening do Bling

Problema: `normalizeTokenResponse` convertia objeto/array em texto por
`String(...)`, podendo aceitar `"[object Object]"` como token.

Correção: `access_token` e `refresh_token` agora aceitam somente valores
primitivos do tipo string; qualquer outro tipo falha fechado como
`BLING_TOKEN_RESPONSE_INVALID`.

```text
FIX_COMMIT=b594c4c
BLING_CONTRACT_HARDENING=2/2 PASS
GIT_DIFF_CHECK=PASS
PUSH=0
RAILWAY_STAGING_DEPLOY=PASS
PRODUCTION_DEPLOY=0
```

### 3. Frontend e Vercel

O diff entre o runtime `4b0b6be` e o checkpoint `723866f` era somente
documental. Portanto, as evidências de frontend continuam causalmente válidas:

```text
FRONTEND_TESTS=213/213 PASS
FRONTEND_BUILD=PASS
FRONTEND_LINT=PASS
VERCEL_CONFIG_TESTS=6/6 PASS
```

Revalidação live, somente leitura:

```text
VERCEL_STAGING_DEPLOYMENT=dpl_93YQPNrgEbSoPvDJFxRQFUhwxQVn
VERCEL_STAGING_SOURCE=4b0b6beeb1d7cc9fa33d072b6dd0eb5e4463329f
VERCEL_STAGING_STATE=READY
VERCEL_RUNTIME_ERRORS_24H=0
RAILWAY_STAGING_API=RUNNING
RAILWAY_STAGING_HEALTH=200
RAILWAY_STAGING_READY=200
PRODUCTION_CHANGED=false
```

## Browser QA focal

O deployment frontend já aprovado `dpl_93YQPNrgEbSoPvDJFxRQFUhwxQVn` foi
reutilizado porque não houve delta frontend desde `4b0b6be`. O alias
`crm-ga3-bundle-staging.vercel.app` foi movido para esse deployment depois de
validar index, JS, CSS e `/api/health`.

Uma conta ADMIN temporária, forte e sintética foi criada no tenant STORE-1
somente para o QA. As capabilities internas de Negócios e Estoque foram
configuradas para o tenant. O roteiro aprovou Painel Comercial, Estoque,
Automações, Integrações, refresh direto, console e rede. Ao final, a conta foi
desativada, uma sessão e três refresh tokens foram revogados, e o navegador
voltou para o login.

```text
AUTHENTICATED_BROWSER_QA_CURRENT_RUNTIME=PASS
STABLE_STAGING_ALIAS_PARITY=PASS
STAGING_BACKEND_AVAILABILITY=PASS
CONSOLE_ERRORS=0
CONSOLE_WARNINGS=0
PRODUCTION_REQUESTS=0
UNEXPECTED_CLIENTES_REQUESTS=0
TEMP_QA_ACCOUNT_ACTIVE=false
```

## Worker de automações

A prova AU-04 anterior executou um worker Railway real em staging e registrou
`ACTION_TIMEOUT` → `job_retry_scheduled` → tentativa 2 `SUCCEEDED`. A
comparação entre o source causal `c7889848` e `b594c4c` confirmou blobs
idênticos para worker, actions, service, observabilidade e testes de retry.
Nenhum worker novo foi criado.

```text
WORKER_RETRY_LOCAL=PASS
WORKER_RETRY_RELEVANT_DIFF=EMPTY
REAL_WORKER_RETRY_RECOVERY=PASS_REUSED
```

## Auditoria adversarial e documentação anterior

Os documentos anteriores continham estados incompatíveis para a suíte backend
e contagens que misturavam evidência local, browser e worker live. Este
relatório passa a ser o addendum operacional mais recente e não reclassifica
UNTESTED como PASS por inferência.

## Estado final honesto

```text
BACKEND_GLOBAL_SUITE=PASS
FRONTEND_TESTS=PASS
FRONTEND_BUILD=PASS
FRONTEND_LINT=PASS
VERCEL_STAGING_DEPLOYMENT=READY
VERCEL_RUNTIME_ERRORS_24H=0
STAGING_API_HEALTH=PASS
STAGING_API_READY=PASS
BLING_TOKEN_TYPE_HARDENING_STAGING=PASS
AUTHENTICATED_BROWSER_QA_CURRENT_RUNTIME=PASS
STABLE_STAGING_ALIAS_PARITY=PASS
REAL_WORKER_RETRY_RECOVERY=PASS_REUSED
STORE1_INTERNAL_PRODUCT_READY=PASS
STORE1_EXTERNAL_INTEGRATIONS_READY=PENDING_EXTERNAL_PROVIDER
PRODUCTION_WRITE=0
PRODUCTION_DEPLOY=0
```

## Pendências externas

Meta, WhatsApp, Instagram, Messenger, e-mail e IA com providers reais
continuam deliberadamente fora desta missão. Bling permanece sem conta real.
Esses itens não são falhas do núcleo interno.

## Otimizações de execução

- evidências frontend/build/lint foram reutilizadas porque nenhum arquivo
  causal mudou;
- a suíte backend foi repetida somente porque o exit code anterior se perdeu;
- após o hardening do Bling, apenas o teste focal foi repetido;
- um primeiro upload Railway sem o root `backend` falhou antes de ativar
  runtime; a correção causal foi aplicada uma vez e o serviço anterior
  permaneceu disponível;
- nenhum push, migration nova, backup ou escrita de produção foi executado.
