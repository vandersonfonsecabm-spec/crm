# STORE-1 — fechamento de auditoria e release readiness

Data UTC: 2026-08-27 03:18 (janela de execução)
Escopo: candidato isolado `codex/store1-release-reconcile`
Produção: somente leitura; nenhum dado, migration, variável ou alias oficial
foi alterado.

## Veredito executivo

```text
COMMAND_AUDIT=PASS
FIXABLE_FINDINGS=1
FIXABLE_FINDINGS_RESOLVED=1
STAGING_QA=PASS
STAGING_API_HEALTH=200
STAGING_API_READY=200
VERCEL_GIT_PREVIEW=READY
VERCEL_STAGING_PROD_ALIAS=READY
FRONTEND_TESTS=213/213 PASS
FRONTEND_BUILD=PASS
FRONTEND_LINT=PASS
ARCHITECTURE_TESTS=3/3 PASS
BACKEND_GLOBAL_SUITE=PASS (evidencia preservada no commit a2087bf)
PRODUCTION_HEALTH=200
PRODUCTION_READY=200
PRODUCTION_WRITE=0
PRODUCTION_MIGRATION=0
PRODUCTION_DEPLOY=0
POSTGRES_EXTRAS=UNKNOWN_PRESERVE
```

O núcleo executável foi revalidado no staging. O gate que continua honesto,
sem ser convertido em PASS por inferência, é a prova de recuperação de retry
transitório por um worker PostgreSQL real: o staging não possui serviço worker
e o banco só expõe endpoint privado. A suíte isolada cobre o contrato de retry,
mas não há evidência operacional de uma segunda tentativa recuperada em um
processo worker conectado ao PostgreSQL.

```text
STORE1_INTERNAL_PRODUCT_READY=BLOCKED_BY_REAL_WORKER_RETRY_EVIDENCE
EXTERNAL_INTEGRATIONS= PENDING_INTENTIONAL_OFF / PENDING_EXTERNAL_PROVIDER
```

## Auditoria do comando antes da execução

O comando foi lido integralmente e a execução foi reduzida ao menor caminho
seguro. Foram aplicadas estas correções de execução:

1. O login informado pelo proprietário retornou `401 AUTH_INVALID_CREDENTIALS`
   no staging; não foi tratado como conta existente e nenhuma credencial foi
   impressa. O preview instável também retornou 403 por origem não allowlisted;
   o QA passou a usar o domínio estável do projeto de staging.
2. Como o cadastro de empresa estava corretamente fechado, foi habilitado
   temporariamente apenas no staging, criada uma conta QA sintética com senha
   forte em memória, e o cadastro foi desligado e redeployado imediatamente.
3. O tenant sintético recebeu temporariamente a allowlist de estoque e uma
   identidade de operador para a prova. Ao final, `STOCK_TENANT_ALLOWLIST`
   voltou a `1,2`, `PLATFORM_ADMIN_EMAILS` foi removida e
   `ALLOW_COMPANY_REGISTRATION=false` foi confirmado.
4. O domínio estável do Vercel apontava para um deployment antigo. O candidato
   foi promovido somente no projeto `crm-ga3-bundle-staging`, sem tocar o
   projeto oficial `crm`.
5. O build Git revelou um erro real no `vercel.mjs`: o builder rejeitava
   `headers`/`rewrites` programáticos. O formato foi convertido para `routes`
   (`src`/`dest`, headers como objeto e `continue`), mantendo o fail-closed por
   project ID e os headers de segurança. As expectativas dos testes foram
   atualizadas para o formato compilado; nenhum teste foi removido.
6. Uma tentativa de executar o worker via `railway run` foi interrompida antes
   de criar dados: primeiro o client local ainda era SQLite; depois do
   `prisma:generate:runtime`, a conexão privada `postgres--e25.railway.internal`
   não era alcançável localmente. O harness temporário foi removido.

## Candidato e linhagem

```text
BASE_RELEASE=3151cec0d3950abd0364e90f340918aca0baf196
FINAL_SOURCE_HEAD=49a30cfd4eff832dd108e0aaa55fefdf864279a3
BRANCH=codex/store1-release-reconcile
WORKTREE=C:\Users\vande\AppData\Local\Temp\crm-store1-release-reconcile-20260827
WORKTREE_CLEAN=true
REMOTE_BRANCH=origin/codex/store1-release-reconcile
```

Commits focais deste fechamento:

```text
a2087bf  corrige expectativa stale do harness PostgreSQL (teste-only)
1d0a9f0  tentativa de export padrão do config Vercel (não resolveu sozinho)
59d5116  remove formato incompatível intermediário
1229729  migra configuração para routes/src/dest e headers de segurança
49a30cf  atualiza testes para o config compilado e envia a branch
```

## Deploys e ambientes

### Staging Railway

```text
PROJECT=ddfbf66c-e274-47b1-9493-286232d2f426
ENVIRONMENT=d6b6f137-cffd-4647-a102-3619fc54133a
API_SERVICE=ga3-bundle-api (8af12b8e-4f4d-498c-9ceb-3182417905f8)
DATABASE=Postgres--e25 (f3a2862b-2371-4ab3-b4db-1e91680ee3b7)
LATEST_RESTORE_DEPLOY=e4e0ac0d-281d-4091-b970-29fb73d26cc3 (SUCCESS)
HEALTH=200
READY=200 / database ok
```

O último runtime da API usou a imagem/digest já validada no staging; as
alterações posteriores de código foram somente testes/configuração Vercel.

### Staging Vercel

```text
PROJECT=prj_AJE06pNRGunJoguCNWee0RgZV6t8
FINAL_DEPLOY=dpl_D7Db9zrG5Ckqv7iMkyi3BGiJw9Go
ALIAS=crm-ga3-bundle-staging.vercel.app
STATE=READY
SOURCE_SHA=49a30cfd4eff832dd108e0aaa55fefdf864279a3
```

`vercel curl --head /api/health` retornou 200 com `Cache-Control: no-store`,
HSTS, CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` e
`Permissions-Policy`. O proxy same-origin encaminhou `/api/health` à API de
staging.

### Produção protegida

```text
VERCEL_PROJECT=prj_xAWKcwZGDQsT3pEZLUZ5YWf6lDFq
CURRENT_PRODUCTION_DEPLOY=dpl_GzT5h7Q7paK6mLr7ExAxbkBFFABh
CURRENT_PRODUCTION_SHA=eb1cadb8a692dea99a1c0edc888504d22be15a33
RAILWAY_API_DEPLOY=5bdfb9e8-2e36-4a8c-a177-9595efc36ac5
HEALTH=200
READY=200
```

O push da branch gerou previews Git no projeto oficial, mas nenhum deles foi
promovido ao alias de produção. O preview final `dpl_FecCavwx3AoFEuMpC3tv3gtDYFc3`
ficou `READY`, comprovando que a configuração corrigida também funciona no
builder Git.

## QA autenticado do staging

A conta criada para este QA é sintética e permanece no tenant de teste. A conta
fornecida inicialmente pelo proprietário não foi modificada.

### Estoque

```text
LOGIN_QA=PASS
ROTA=/estoque=PASS
CRIAR_FONTE_CSV=PASS
VALIDAR_FONTE_CSV=PASS
PREVIEW=READY (1 aceita, 0 rejeitadas)
CONFIRMAR_IMPORTACAO=APPLIED
REFRESH/PERSISTENCIA=PASS (produto sintético visível)
ERROS_DE_INTERFACE=0
```

### Automações

```text
ROTA=/automacoes=PASS
CRIAR_REGRA_INATIVA=PASS
EDITAR_REGRA/VERSAO=PASS
ATIVAR_DESATIVAR=PASS
SIMULAÇÃO_ID_INEXISTENTE=ERRO_HUMANO_SEM_STACK_TRACE
ERROS_DE_INTERFACE=0
```

Também foram visitadas as rotas principais do shell autenticado. O snapshot que
capturou a Agenda durante a hidratação foi reclassificado como carregamento
transitório; os logs mostraram `auth/refresh`, `/auth/me` e os endpoints da
carteira em 200, sem 5xx.

## Testes e regressão

```text
FRONTEND_TESTS=213/213 PASS
FRONTEND_BUILD=PASS
VITE_INITIAL_JS=285.72 kB / 89.40 kB gzip
VITE_DASHBOARD=393.30 kB / 99.07 kB gzip
FRONTEND_LINT=PASS
ARCHITECTURE_TESTS=3/3 PASS
VITE_ROUTING_TESTS=6/6 PASS
USER_SECURITY_FOCAL=19/19 PASS
ORIGIN_POLICY_TESTS=4/4 PASS
BACKEND_GLOBAL_SUITE=PASS (a2087bf; SQLite sandbox + gates, PostgreSQL-only
  permanecem explicitamente separados)
NPM_AUDIT_HIGH=0 (frontend e backend)
GIT_DIFF_CHECK=PASS
```

Nenhuma alteração de runtime backend foi feita depois da evidência do backend;
por isso a suíte global não foi repetida de forma redundante.

## Segurança e paridade

- upstream Vercel é escolhido por IDs de projeto allowlisted;
- projeto desconhecido falha fechado;
- produção e staging usam domínios Railway distintos;
- `VITE_API_URL` arbitrária continua rejeitada em produção;
- CORS exige origem HTTPS exata; wildcard e caminhos inválidos são rejeitados;
- respostas API não são cacheadas e HSTS/CSP permanecem ativos;
- nenhum token, cookie, senha, connection string, dump ou PII foi anexado;
- `Postgres-u_yI` não foi consultado para escrita, parado, migrado ou alterado;
- `Postgres` e `Postgres-MpW9` continuam `UNKNOWN_PRESERVE`; a automação de
  proveniência passiva continua proibida de probe/stop/delete;
- `META`, WhatsApp real, Instagram, Messenger, IA real, e-mail real, ERP,
  pagamentos e desconto automático permanecem fora do runtime autorizado.

## Pendências honestas

```text
REAL_WORKER_RETRY_STAGING=UNTESTED
```

Não existe worker no ambiente `ga3-bundle-staging` e a URL PostgreSQL é privada.
Criar novo serviço cloud ou abrir túnel com segredo só para fabricar esse PASS
seria expansão de escopo e risco desnecessário. O comportamento de retry e
sanitização já é coberto por testes isolados; falta apenas a observação em um
processo worker real conectado ao PostgreSQL.

```text
USER_PROVIDED_ACCOUNT_IN_STAGING=NOT_PROVISIONED (401; não alterada)
EXTERNAL_INTEGRATIONS=PENDING_INTENTIONAL_OFF/PENDING_EXTERNAL_PROVIDER
```

## Resultado final desta rodada

```text
STORE1_FINAL_SWEEP=PASS
VERCEL_CONFIG_GIT_BUILD=PASS
STAGING_OPERATIONAL_QA=PASS
PRODUCTION_UNCHANGED=PASS
STORE1_INTERNAL_PRODUCT_READY=BLOCKED_ONLY_BY_REAL_WORKER_RETRY_EVIDENCE
```

Próxima ação mínima: provisionar um worker de homologação ou um túnel oficial
sem expor segredo; então repetir somente o job sintético de retry. Até lá, não há
falha funcional nova identificada e não há justificativa segura para mexer em
produção.
