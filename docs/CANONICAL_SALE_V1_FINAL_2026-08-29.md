# Venda Canônica V1 — relatório canônico consolidado

Data de consolidação: 2026-08-30

Branch: `feature/canonical-sale-v1`

Estado deste documento: `PENDING_FINAL_ADVERSARIAL_RECONCILIATION`

Este documento substitui o relatório local anterior, que registrava staging
como não iniciado. Ele consolida somente fatos comprovados até o artefato de
release atual. O adversarial final e o secret sweep sobre os próprios artefatos
documentais ainda estão pendentes neste rascunho; portanto ele não declara
`COMPLETE`, `SHIP` nem prontidão para produção antes desses gates.

## 1. Veredito atual

```text
MISSION_COMMAND_AUDIT=PASS
MODEL_SELECTION_PRECONDITION=SATISFIED
RUNTIME_MODEL_ATTESTATION=NOT_REQUIRED
MODEL_IDENTITY_GATE=NOT_APPLICABLE

RELEASE_ARTIFACT_HEAD=3b2e462cfd9ef62848577694c31f1005e7bd23f3
RELEASE_GIT_TREE=80806ac71f039c7bc79bf2a1931c7afdaa9c9d58
REPORT_COMMIT=PENDING

IMPLEMENTATION_COMPLETE=PASS
LOCAL_GATES=PASS
GLOBAL_REGRESSION_LOCAL=PASS_WITH_PROPORTIONAL_RETEST
POSTGRES_CAUSAL_GATE=PASS

CONTROLLED_PUSH=PASS
STAGING_MIGRATION=PASS
STAGING_BACKEND_RUNTIME=PASS
STAGING_FRONTEND_RUNTIME=PASS
SOURCE_RUNTIME_PARITY=PASS
STABLE_ALIAS_PARITY=PASS

CANONICAL_SALE_STAGING_E2E=PASS
STAGING_IDEMPOTENCY=PASS_WITH_POST_FINDING_CAUSAL_RETEST
STAGING_CONCURRENCY=PASS
STAGING_REOPEN=PASS
STAGING_REVENUE_PROVENANCE=PASS
STAGING_TENANT_SECURITY=PASS
STAGING_SNAPSHOT_IMMUTABILITY=PASS
STAGING_BROWSER_QA=PASS
CONTINUOUS_USE_REVIEW=PASS
COMMERCIAL_TRANSACTION_SOAK=PASS_WITH_CAUSAL_SUPPLEMENT
STAGING_QA_CLEANUP=PASS

STAGING_AUDIT_SWEEP_1=PASS_AFTER_RETESTS
STAGING_AUDIT_SWEEP_2=PASS_AFTER_RETESTS
SECOND_REVIEW_FINDING_IDEMPOTENCY_RECOVERY=RETESTED
FINAL_SECRET_SWEEP=PENDING_RECONCILIATION
FINAL_ADVERSARIAL_VERDICT=PENDING_RECONCILIATION
FINAL_SOL_RECONCILIATION=PENDING_RECONCILIATION

CANONICAL_SALE_V1=NOT_YET_FINAL
READY_FOR_PRODUCTION=PENDING_RECONCILIATION
PRODUCTION_CHANGED=false
REAL_PRODUCT_PROVIDER_CONNECTIONS=0
REAL_PRODUCT_PROVIDER_CREDENTIALS_USED=0
REAL_OUTBOUND=0
HOSTING_CONTROL_PLANE=STAGING_ONLY
```

O limite máximo desta missão continua sendo prontidão futura para produção.
Nenhuma promoção para produção está autorizada ou foi realizada.

## 2. Estado inicial e evolução do candidato

- Baseline funcional: `79eed4f`.
- Código comercial inicialmente validado: `5d45ace`.
- Correção original do harness PostgreSQL: `3525651`.
- Candidato de UI estabilizado após `DRAWER-ASYNC-01`: `5d0e427`.
- Hardening aditivo de ledger/migration/runtime: `f8f4961`.
- Correção funcional encontrada no segundo sweep: `3b2e462`.
- HEAD remoto da branch após push controlado: exatamente `3b2e462`.
- Manifesto de fonte do release: Git tree
  `80806ac71f039c7bc79bf2a1931c7afdaa9c9d58`.
- `backend/prisma/dev.db` permaneceu imutável, SHA-256
  `6116ca72110d8c4a6b5bc214a476993afdc155ec32b3b2431e4ce54254a42533`.

O release atual não refaz o contrato comercial. Ele agrega correções causais
descobertas pelos reviewers, migrations forward-only, provas de runtime e
evidências de staging.

## 3. Contrato implementado

O contrato congelado em `docs/ADR_CANONICAL_SALE_CONTRACT_V1.md` permanece a
autoridade de domínio:

- Negócio é a entidade comercial central.
- Um Negócio possui zero ou uma proposta principal e zero ou uma proposta
  vencedora ativa.
- Proposta aceita não fecha automaticamente o Negócio nem cria receita.
- Fechamento por proposta e fechamento manual geram `VendaCanonica` em uma
  transação atômica.
- Venda ativa é a única fonte de receita realizada.
- `Cliente.valor`, `Negocio.valor` e proposta aceita isoladamente nunca são
  receita.
- Dinheiro canônico usa centavos, BRL e preserva `null != 0`.
- Snapshot monetário, itens, origem e revisão são históricos.
- Reopen invalida a venda anterior com motivo e preserva a fotografia.
- Retry, CAS, locks e idempotência convergem para uma operação lógica.
- Relações são sempre fechadas por tenant, Cliente, Negócio e papel.

## 4. Freeze, alvos e push controlado

O preflight confirmou worktree, branch, ancestry, status, arquivos não
rastreados, `dev.db`, ausência de segredo conhecido e HEAD exato. O push foi
feito somente para `feature/canonical-sale-v1`; não houve merge em `main`.

| Camada | Alvo canônico de staging |
| --- | --- |
| Railway project | `ddfbf66c-e274-47b1-9493-286232d2f426` |
| Railway environment | `d6b6f137-cffd-4647-a102-3619fc54133a` (`ga3-bundle-staging`) |
| API | `8af12b8e-4f4d-498c-9ceb-3182417905f8` (`ga3-bundle-api`) |
| Worker | `25dab463-52c0-4425-825e-c7dcf6a65332` (`store1-worker`) |
| PostgreSQL | `f3a2862b-2371-4ab3-b4db-1e91680ee3b7` (`Postgres--e25`) |
| Vercel project | `prj_AJE06pNRGunJoguCNWee0RgZV6t8` |
| Vercel alias | `crm-ga3-bundle-staging.vercel.app` |

Os alvos de produção são distintos. A API de produção permaneceu no deployment
`5bdfb9e8-2e36-4a8c-a177-9595efc36ac5`; o alias de frontend de produção
permaneceu no deployment `dpl_GzT5h7Q7paK6mLr7ExAxbkBFFABh`.

## 5. Migration, backup e rollback

As migrations canônicas são aditivas e forward-only:

| Migration | Plataforma | SHA-256 |
| --- | --- | --- |
| `20260828130000_add_canonical_sale_v1` | SQLite | `00d7064d74e167503280b625f6a5a076efedf1824c4c9bf8f284b8b0430b8d37` |
| `20260828130000_add_canonical_sale_v1` | PostgreSQL | `b9d6e0f3f56181f1a1fde44a7c454a2f525a8733eb9c065c1e900fdfa65971e1` |
| `20260830133500_harden_canonical_sale_delete_guard` | SQLite | `69aa03b4cd09c5e3f232a9d56e146ec8623c342bb42e451ee35a9274cc83b4dd` |
| `20260830133500_harden_canonical_sale_delete_guard` | PostgreSQL | `14349f98eda3b066c0abc8ce236387f90b2fe8c77f816601d3533932b9492be4` |

O banco de staging terminou com 20 migrations aplicadas e sem migration falha.
O verifier confirmou a última migration, oito triggers protegidos, bypass por
sessão bloqueado, `TRUNCATE` bloqueado e zero empresas QA após cleanup.

O backup pré-hardening `canonical-sale-staging-pre-delete-hardening.dump` tem
670217 bytes e SHA-256
`95fa106ec98a615528a5260b422174b3ae5eb8476b10f6d6f8d5d71a953f2a`.
Seu restore drill passou com 1330 entradas, 19 migrations no snapshot
pré-hardening, zero falhas, 91 tabelas e cinco tabelas-chave verificadas. Um
backup anterior à migration inicial também foi ensaiado; o índice sanitizado
ancora o backup mais recente cujo hash completo foi revalidado.

O rollback contratual permanece forward-fix ou pausa de escrita; não existe
`DROP`, reset ou reinterpretação silenciosa de legado.

## 6. Deploy e paridade source/runtime

Deploys atuais do release `3b2e462`:

- Railway API: `ecc3a785-b4a1-4b1f-93e2-539cf2de3fb8`, `SUCCESS`, image
  digest `sha256:26677c3939c82e6aa59d4ae568b8324c94d1d9b908dc4bc8e6b95ad380f57250`.
- Vercel frontend: `dpl_DJuYkeaS6w2xXoXYnkkSB355U9uH`, `READY`, vinculado ao
  alias estável de staging.
- Worker staging permaneceu saudável e não participa do caminho causal da
  Venda Canônica V1.

`/health` e `/ready` responderam 200; readiness confirmou banco acessível. O
runtime expôs:

```text
SOURCE_MANIFEST_VERSION=backend-runtime-v3-lf
SOURCE_MANIFEST_SHA256=bea0a256eb86fe2833258f28b7a1438b440a284762ce6784bee6d7776ffe8fab
TARGET_VERIFIED=true
DATABASE_VERIFIED=true
PROVIDERS_CONNECTED=false
OUTBOUND_ENABLED=false
```

Branch, Git tree, backend deployment, frontend deployment, migrations, banco
e alias estável convergiram para o mesmo release. `SOURCE_RUNTIME_PARITY=PASS`.

## 7. PostgreSQL causal final

O gate final foi executado em PostgreSQL 18.6 descartável no WSL, com
banco/usuário exclusivos e cleanup externo. Nenhum banco oficial foi usado.

- Harness tests: 24.
- Manifesto de fonte:
  `8a2f0bb816e338a8392a79bd72b42114f6a10532644efaabc2c0d7ed8327d25b`.
- Manifesto de evidência:
  `20260830142504707-8116-35dbe6dfdb7e.json`.
- SHA-256 do manifesto:
  `592b9301752514aee44d783429d32efe20af40bef958d0f835831cd8dda02197`.
- SHA-256 dos logs sanitizados:
  `176b975dfa34e9b381801935e86747ce878de6e87c55898235987ee2a29ab4e2`.

Migration, constraints, CAS, locks, close/accept/update concorrentes,
idempotência, replay divergente/invalidation, tenant, snapshots e cleanup
passaram no código atual.

## 8. E2E autenticado e fixtures sintéticas

O usuário confirmou que login e dados eram sintéticos. O fluxo autenticado em
staging cobriu:

```text
login → Cliente → Negócio → Propostas A/B → principal → aceita/vencedora
→ fechamento → Venda Canônica → Customer 360 → dashboard → relatório/exportação
```

Também foram exercitados fechamento manual com zero, `null != 0`, retry,
clique duplo, duas chaves, duas abas, concorrência close/accept/update, reopen,
nova revisão, paginação com 101 propostas, cross-client, cross-tenant e RBAC de
ADMIN/GERENTE/VENDEDOR.

- hash do run E2E: `c3e73463008d0d71f692`;
- fixture run ID: `ce200b1d298eea6d`;
- SHA-256 do manifesto de fixtures:
  `6ef4db8c0fe7ae4f91047debcb4d176d5c2fba0db216391f79c53daa9bd1480e`;
- fixtures: 2 empresas, 8 usuários, 5 clientes, 5 negócios, 104 propostas e
  4 vendas sintéticas.

DB, API e UI convergiram para a mesma venda ativa e proveniência de receita.

## 9. Idempotência e finding do segundo sweep

O segundo sweep encontrou um bug real no recovery dos erros transacionais
`P2002`, `P2028` e `P2034`: o fallback validava fingerprint, mas podia devolver
como replay uma venda já `INVALIDATED`. A correção `3b2e462` exige status
`ACTIVE`; caso contrário responde
`IDEMPOTENCY_KEY_REPLAY_INVALIDATED`.

Retestes após a correção:

- teste focal dos três códigos: 3/3 PASS;
- suíte canônica SQLite: PASS;
- suíte focal canônica PostgreSQL: PASS;
- gate PostgreSQL completo: PASS;
- branch remota e runtime staging atualizados para `3b2e462`;
- fingerprint novo confirmado.

O reviewer independente repetiu a revisão após os retestes e retornou `SHIP`,
sem finding remanescente em seu escopo. Logo:

```text
STAGING_AUDIT_SWEEP_2=PASS_AFTER_RETESTS
SECOND_REVIEW_FINDING_IDEMPOTENCY_RECOVERY=RETESTED
```

## 10. Segurança, tenant e imutabilidade

Requests reais tentaram acesso cross-tenant, proposal/sale/client forjados e
bypass direto para ADMIN, GERENTE e VENDEDOR. Os escopos falharam fechados.
Ataques tentaram update/delete de snapshot, item tardio, reativação de venda
invalidada, mudança de valor e efeito retroativo do catálogo; o histórico
permaneceu imutável.

O hardening `f8f4961` adicionou guardas permanentes de `DELETE` e `TRUNCATE`
para `NegocioContratoVenda` e o ledger canônico. O verifier provou que uma GUC
de sessão não libera o apagamento.

Limite operacional explícito: as provas cobrem o papel e o caminho normal da
aplicação. Um papel PostgreSQL proprietário/superusuário possui poderes fora
desse contrato; segregação de ownership é controle de infraestrutura, não uma
garantia inventada neste relatório.

## 11. Receita, Customer 360, dashboard e exportação

A mesma fixture foi comparada em banco, API, Customer 360, dashboard e
exportação. Foi provado que receita é somente `VendaCanonica ACTIVE`; venda
invalidada, `Cliente.valor`, `Negocio.valor` e proposta aceita isoladamente
ficam fora. Pipeline e estimativa permanecem separados; zero é conhecido e
`null` é desconhecido; BRL, centavos, subtotal, desconto e total convergem.

A captura do download pelo controlador de navegador expirou sem criar arquivo
local. A falha foi classificada `BROWSER_CONTROL_FAILURE`, não falha da SaaS:
o teste unitário do export frontend e a API `/vendas` com as mesmas fixtures
passaram. Nenhum PASS é atribuído a um download não capturado.

## 12. Browser QA e uso contínuo

O QA autenticado cobriu 900×768, 1366×768, 1440×900 e 1920×1080, board,
loading, empty, error, venda manual, proposta, vencedora, substituída, legado,
perdido e reopen.

- nenhum overflow relevante;
- zero erros de console no fluxo final;
- deep link e refresh direto preservaram autenticação/drawer;
- três refreshes consecutivos: 3/3 PASS;
- troca rápida de Negócio convergiu para o estado mais recente;
- duas abas, mutações repetidas, close/reopen e sessão renovada sem stuck state.

`DRAWER-ASYNC-01` foi corrigido em `a00b4c4`, `de4ebd8`, `186fb4b`, `478c70e`
e `5d0e427`. A regressão frontend passou 230/230, lint e build. `f8f4961` e
`3b2e462` não alteraram o frontend; a evidência foi preservada causalmente.

## 13. Soak comercial

| Métrica | Fase 1 | Fase 2 | Total |
| --- | ---: | ---: | ---: |
| Iterações | 15 | 15 | 30 |
| Requests | 156 | 156 | 312 |
| Duração ativa | 288 s | 287 s | 575 s |
| Falhas | 0 | 0 | 0 |
| HTTP 5xx | 0 | 0 | 0 |
| Timeouts | 0 | 0 | 0 |
| Vendas duplicadas | 0 | 0 | 0 |
| Operações travadas | 0 | 0 | 0 |
| Drift de valor | 0 | 0 | 0 |

- fase 1 SHA-256:
  `b2ef2c3678676298aebdcb59babe32537feb1cd162366e7c87761f699a15b51e`;
- fase 2 SHA-256:
  `702d681a25adc7e32dff84cd18b52e88dd9ce93f6cb79b80e87e6bb25c678676`;
- restart controlado: PASS;
- produção 0, providers reais 0, outbound real 0.

O soak rodou em `5d0e427`. `f8f4961` alterou migration/runtime/testes e
`3b2e462` alterou apenas o fallback de recovery, coberto depois por focal,
SQLite e PostgreSQL completo. O fluxo regular foi preservado e o delta recebeu
reteste causal; por isso o gate é `PASS_WITH_CAUSAL_SUPPLEMENT`, sem afirmar
que o soak inteiro foi repetido no novo SHA.

## 14. Cleanup

O cleanup removeu 95 históricos de venda, 62 itens, 33 contratos, 64 vendas,
130 históricos de proposta, 134 itens, 134 propostas, 95 históricos de
atribuição, 35 negócios, 35 clientes, 30 refresh tokens, 15 sessões, 30
security audits, 2 features, 8 usuários e 2 empresas QA.

O verifier final confirmou zero empresas QA. A credencial sintética temporária
foi removida. O redeploy limpou scripts/verifiers do `/tmp` da API e o
PostgreSQL WSL descartável foi encerrado/removido.

## 15. Ledger canônico de findings

| ID | Sev. | Finding | Correção | Estado |
| --- | --- | --- | --- | --- |
| CV1-R1–R4 | HIGH | cross-client, replay invalidado, reativação e escrita terminal | guards, lifecycle, CAS e testes | RETESTED |
| CV1-R5–R14 | MEDIUM | proveniência, UX, paginação, reopen e legado | serviço, API, UI e testes | RETESTED |
| DRAWER-ASYNC-01 | MEDIUM | resposta antiga sobrescrevia estado novo | sequência/sessão/unmount/loading | RETESTED |
| PG-IDEMPOTENCY-01 | HIGH | harness esperava erro errado após mudar fingerprint | `3525651` | RETESTED |
| STG-S1-DELETE-01 | HIGH | GUC liberava delete e faltava guard de truncate | `f8f4961` | RETESTED local/staging |
| STG-S1-CONTRACT-01 | HIGH | delete de contrato ocultava receita ativa | `f8f4961` | RETESTED |
| STG-S1-RUNTIME-01 | MEDIUM | manifesto omitia normalização `.toml` | runtime v3-lf | RETESTED |
| STG-S1-EVIDENCE-01 | MEDIUM | soak sem atribuição/cleanup consolidado | este relatório/índice | FIXED_DRAFT; secret check pendente |
| STG-S2-IDEMP-01 | HIGH | recovery aceitava venda invalidada | `3b2e462` | RETESTED; reviewer SHIP |

Não há finding de produto conhecido sem correção. Os gates ainda pendentes são
reconciliação documental/secret sweep e adversarial final, não uma ressalva
convertida em PASS.

## 16. Auditorias independentes

O primeiro sweep retornou `FIX_FIRST` para delete/truncate, contrato,
manifesto e deriva documental. As correções entraram em `f8f4961`, passaram
nos testes causais e na revisão independente de security/runtime.

O segundo sweep do zero encontrou `STG-S2-IDEMP-01`; após `3b2e462`, focal,
SQLite, PostgreSQL completo, redeploy e fingerprint, o reviewer repetiu a
revisão e retornou `SHIP` sem finding remanescente.

```text
STAGING_AUDIT_SWEEP_1=PASS_AFTER_RETESTS
STAGING_AUDIT_SWEEP_2=PASS_AFTER_RETESTS
FINAL_ADVERSARIAL_VERDICT=PENDING_RECONCILIATION
```

O adversarial final somente poderá retornar `SHIP` ou `FIX_FIRST` depois do
secret sweep, commit documental e rechecagem final de runtime.

## 17. Matriz de gates

| Gate | Estado | Evidência |
| --- | --- | --- |
| Contrato/state machines | PASS | ADR + suítes locais/PG |
| Migration aditiva | PASS | hashes, restore drill, verifier staging |
| Primary/winning proposal | PASS | E2E, 101 propostas, tenant/conflitos |
| Atomic/manual close | PASS | SQLite, PG e staging |
| Idempotência | PASS_WITH_POST_FINDING_CAUSAL_RETEST | 3/3 + SQLite + PG + redeploy |
| Concorrência/CAS/locks | PASS | PostgreSQL causal + staging |
| Reopen/histórico | PASS | E2E + snapshot attacks |
| Money/receita | PASS | DB/API/UI/360/dashboard/export |
| Tenant/RBAC | PASS | requests reais + constraints |
| Snapshot imutável | PASS | ataques update/delete/truncate/item tardio |
| Browser/continuous | PASS | 4 viewports, refresh, duas abas, 230/230 |
| Soak | PASS_WITH_CAUSAL_SUPPLEMENT | 30 iterações + reteste do delta |
| Cleanup | PASS | contagens e verifier zero QA |
| Runtime/parity | PASS | deployments, SHA, manifest, health |
| Sweep 1 | PASS_AFTER_RETESTS | findings corrigidos/revistos |
| Sweep 2 | PASS_AFTER_RETESTS | finding corrigido; reviewer SHIP |
| Secret sweep final | PENDING_RECONCILIATION | executar nos docs finais |
| Adversarial final | PENDING_RECONCILIATION | depende dos gates acima |

## 18. Produção, providers e segredos

```text
PRODUCTION_REQUESTS=0
PRODUCTION_CHANGED=false
REAL_PRODUCT_PROVIDER_CONNECTIONS=0
REAL_PRODUCT_PROVIDER_CREDENTIALS_USED=0
REAL_OUTBOUND=0
HOSTING_CONTROL_PLANE=STAGING_ONLY
```

Não houve migration, deploy, escrita, provider ou outbound em produção. Este
relatório usa “provider” para os conectores de produto (Meta, WhatsApp, Bling,
e-mail e IA); os planos de controle Railway/Vercel foram usados somente no
staging declarado. Ele não contém URL com credencial, token, cookie, senha,
private key ou dado real. `FINAL_SECRET_SWEEP` deve rodar novamente sobre o
commit documental.

## 19. Critério de encerramento

Este rascunho só pode mudar para estado final depois de:

1. secret sweep do relatório/índice;
2. commit documental separado, preservando `RELEASE_ARTIFACT_HEAD=3b2e462`;
3. adversarial final independente com veredito `SHIP`;
4. reconciliação do Sol e rechecagem runtime/alias/produção.

Até lá:

```text
OPEN_CRITICAL=0
OPEN_HIGH=0
OPEN_MEDIUM=0
UNTESTED_PRODUCT_SCOPE=0
FALSE_PASS=0
CANONICAL_SALE_V1=NOT_YET_FINAL
READY_FOR_PRODUCTION=PENDING_RECONCILIATION
```

Quando e somente quando esses gates passarem, a autoridade final poderá
registrar `CANONICAL_SALE_V1=COMPLETE` e `READY_FOR_PRODUCTION=YES`, mantendo
`PRODUCTION_CHANGED=false`.
