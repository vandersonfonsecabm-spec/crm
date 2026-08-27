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

A investigação também reconciliou as evidências de frontend/Vercel e encontrou
duas lacunas operacionais reais: o alias estável do staging ainda entrega um
deployment antigo que não renderiza a aplicação, e o deployment novo não
possui uma sessão autenticada reaproveitável naquele domínio. A API Railway de
staging permanece saudável.

Uma revisão adversarial identificou ainda que o parser OAuth do Bling aceitava
valores não string por coerção. A correção fail-closed foi implementada e
testada localmente no commit `b594c4c`. Esse commit não foi publicado.

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
DEPLOY=0
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

Foram testadas duas superfícies, sem escrita:

1. deployment único do runtime `4b0b6be`: frontend carregou, mas a validação
   de acesso não conseguiu concluir por ausência de sessão autenticada válida
   naquele domínio;
2. alias estável `crm-ga3-bundle-staging.vercel.app`: título e HTML base foram
   carregados, porém a aplicação permaneceu sem conteúdo renderizado e sem
   erro de console, consistente com o deployment antigo já registrado.

A API de staging respondeu 200 diretamente, portanto a falha não é indisponibilidade
do PostgreSQL ou da API Railway.

```text
AUTHENTICATED_BROWSER_QA_CURRENT_RUNTIME=UNTESTED
STABLE_STAGING_ALIAS_PARITY=FAIL
STAGING_BACKEND_AVAILABILITY=PASS
```

Não foi digitada nem transmitida credencial durante esta execução.

## Worker de automações

Os testes locais provaram retry, backoff, exaustão e recuperação do worker. A
prova operacional live continua ausente porque o ambiente de staging não possui
serviço worker. Criar/publicar esse serviço seria um novo deploy cloud, fora da
autorização deste lote.

```text
WORKER_RETRY_LOCAL=PASS
REAL_WORKER_RETRY_RECOVERY=UNTESTED
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
BLING_TOKEN_TYPE_HARDENING=PASS_LOCAL_NOT_DEPLOYED
AUTHENTICATED_BROWSER_QA_CURRENT_RUNTIME=UNTESTED
STABLE_STAGING_ALIAS_PARITY=FAIL
REAL_WORKER_RETRY_RECOVERY=UNTESTED
STORE1_INTERNAL_PRODUCT_READY=BLOCKED
STORE1_EXTERNAL_INTEGRATIONS_READY=PENDING_EXTERNAL_PROVIDER
PRODUCTION_WRITE=0
PRODUCTION_DEPLOY=0
```

## Pendências mínimas

1. autorizar promoção/redeploy somente no projeto Vercel de staging para que o
   alias estável aponte ao candidato atual;
2. executar login sintético e QA focal autenticado no alias corrigido;
3. em lote separado, autorizar criação/publicação de worker no staging para a
   prova real de retry transitório;
4. depois desses gates, atualizar a matriz STORE-1 para uma única contagem
   canônica e repetir somente os testes causalmente afetados.

## Otimizações de execução

- evidências frontend/build/lint foram reutilizadas porque nenhum arquivo
  causal mudou;
- a suíte backend foi repetida somente porque o exit code anterior se perdeu;
- após o hardening do Bling, apenas o teste focal foi repetido;
- nenhum deploy duplicado, push, migration, backup ou escrita de produção foi
  executado.
