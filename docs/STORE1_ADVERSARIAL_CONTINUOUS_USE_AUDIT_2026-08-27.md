# STORE-1 — auditoria adversarial de uso contínuo

Data: 2026-08-27
Worktree: `codex/store1-release-reconcile`
Baseline Git: `c328ecb627c1d0d68bd9ef90d2472f7ace26b979`
Produção alterada: `false`
Staging alterado por este lote: `false`

## Resumo executivo

Nove frentes independentes revisaram backend, frontend/browser, segurança,
concorrência, workers, performance, release/infra, integrações desligadas e
ausências do inventário. A primeira passagem encontrou falhas reais de
segurança, verdade de estado, concorrência, consistência de dados e UX. As
correções foram feitas apenas no candidato isolado e cobertas por testes
causais.

O backend global terminou com código `0` no runner Prisma isolado; o frontend
terminou com `216/216`, lint e build com código `0`. O banco protegido manteve o
SHA-256 `6116ca72110d8c4a6b5bc214a476993afdc155ec32b3b2431e4ce54254a42533`.

Este documento não declara o candidato como publicado. Não houve commit,
push, deploy, migration ou alteração de variável neste lote.

## Correções implementadas

1. Configurações de integrações agora rejeitam chaves sensíveis recursivamente,
   limitam profundidade/tamanho e redigem registros legados na resposta.
2. Mensagens de erro de providers são reduzidas a códigos/mensagens seguras
   antes de persistência ou resposta.
3. CORS em produção passou a exigir allowlist explícita e falha fechado.
4. URLs de origem/referrer do Site aceitam somente HTTP(S), sem credenciais.
5. Bling rejeita expiração inválida, marca 401 definitivo como erro e sanitiza
   falhas externas.
6. A UI do Bling só chama `ATIVA` de conectada; estados Meta/WhatsApp,
   Instagram, Messenger e IA passaram a refletir a verdade retornada.
7. O simulador rejeita replay material do mesmo `externalId` em outra conversa.
8. Cliente 360 abre o acompanhamento exato na Agenda e preserva deep link.
9. O frontend deixou de inventar valor monetário de cliente.
10. Leituras do CRM possuem timeout central; mutações não são abortadas por
    deadline genérico porque um commit tardio tornaria o resultado ambíguo.
11. Mutações internas invalidam o resumo do dashboard; polling para em aba
    oculta e o atraso artificial de bootstrap foi removido.
12. Automações e Integrações descartam respostas antigas e bloqueiam ações
    concorrentes na UI.
13. Regras de automação usam CAS no update/activate/deactivate.
14. Importação usa claim tenant-scoped condicionado a `PRONTO`; cancelamento e
    finalização permanecem condicionais ao estado esperado.
15. Site e e-mail serializam identidade do cliente no PostgreSQL; e-mail
    reutiliza cliente único por endereço normalizado.
16. Catálogo combina local e disponibilidade na mesma relação de estoque.
17. Vínculo do follow-up comercial exige tenant, ausência de negócio e uma
    única linha alterada.
18. O worker registra falhas parciais de notificações e só fica unhealthy por
    falha total persistente.
19. A paginação de fontes de notificação deixou de usar offset mutável e passou
    a cursor monotônico por ID.

## Regressão e evidências

```text
BACKEND_GLOBAL_SUITE=PASS_EXIT_0
FRONTEND_TESTS=216/216_PASS
FRONTEND_LINT=PASS
FRONTEND_BUILD=PASS
GIT_DIFF_CHECK=PASS
TENANT_ISOLATION_GATE=PASS_161_RELATIONS
PROTECTED_DEV_DB_HASH=PASS
INITIAL_JS=286.35_KB_MINIFIED/89.70_KB_GZIP
DASHBOARD_CHUNK=394.07_KB_MINIFIED/99.32_KB_GZIP
CONSOLE_ERRORS_OBSERVED=0
PRODUCTION_CHANGED=false
STAGING_CHANGED=false
```

Testes focais adicionais:

- integração/configuração sensível: `PASS`;
- CORS/origin policy: `PASS`;
- Bling contract hardening: `PASS`;
- import claim CAS: `PASS`;
- importação manual E2E: `PASS`;
- Site Lead Capture: `PASS`;
- e-mail inbound: `PASS` com um cenário concorrente PostgreSQL-only marcado
  explicitamente como `SKIP` no runner SQLite;
- canais/simulador: `PASS`;
- worker/observabilidade: `16/16 PASS`;
- notificações: `10/10 PASS`;
- catálogo comercial: `PASS`.

## Segunda passagem

A segunda passagem incluiu a suíte global completa, build/lint repetidos e
inspeção autenticada inicial do alias estável de staging. A Visão Geral abriu
com sessão sintética, menus internos e console sem erro. Durante a navegação a
sessão temporária expirou e a aplicação voltou corretamente ao login. Não foi
digitada senha novamente, pois a política de controle do navegador exige
confirmação no momento da transmissão de credencial.

Por isso, o browser não é usado para alegar que o código local corrigido foi
validado em staging: o candidato deste documento não foi deployado.

## Limitações e gates externos

1. Três provas PostgreSQL-only continuam explicitamente `SKIP` no runner
   SQLite: concorrência de lifecycle lock, provisionamento/CAS de e-mail e
   convergência de duas threads raiz de e-mail. O código PostgreSQL usa
   advisory transaction lock, mas nenhuma nova execução PostgreSQL foi
   fabricada neste lote.
2. Webhooks Meta ainda processam o lote antes do ACK. Antes de conectar provider
   real deve existir fila/outbox assíncrona ou orçamento de latência comprovado.
3. O refresh/sync do Bling usa lock em processo. Antes de habilitar múltiplas
   instâncias/provider real deve existir lock distribuído.
4. Scanners temporais mantêm cursor em memória e o supervisor não possui
   watchdog externo de shutdown. São advisories operacionais, não falhas
   observadas no núcleo atual.
5. Integrações reais continuam desligadas. Nenhum mock foi chamado de provider
   real e nenhum outbound foi executado.

## Estado das integrações externas

```text
META_REAL=PENDING_EXTERNAL_PROVIDER
WHATSAPP_REAL=PENDING_EXTERNAL_PROVIDER
INSTAGRAM_REAL=PENDING_EXTERNAL_PROVIDER
MESSENGER_REAL=PENDING_EXTERNAL_PROVIDER
AI_REAL=PENDING_EXTERNAL_PROVIDER
EMAIL_DELIVERY_REAL=PENDING_EXTERNAL_PROVIDER
BLING_PROVIDER_REAL=PENDING_EXTERNAL_PROVIDER
OUTBOUND_REAL=OFF
```

## Veredito

```text
LOCAL_CORRECTED_CANDIDATE=PASS
REGRESSION_AFTER_FIXES=PASS
SECOND_SWEEP=PASS_WITH_EXPLICIT_BROWSER_LIMIT
ADVERSARIAL_FINAL_REVIEW=SHIP
INTERNAL_ACTIVE_FAIL=0
INTERNAL_ACTIVE_BROKEN=0
PRODUCTION_CHANGED=false
STORE1_EXTERNAL_INTEGRATIONS_READY=PENDING
STORE1_FINAL_RUNTIME_RELEASE_READINESS=BLOCKED_NOT_DEPLOYED
```

O bloqueio final não representa bug interno conhecido no candidato local. Ele
impede apenas afirmar que um artefato ainda não publicado já está validado no
runtime. Promoção e QA autenticado do SHA final são uma missão de release
separada e exigem autorização própria.

O revisor adversarial inicialmente devolveu `FIX_FIRST` e encontrou sete
regressões nos próprios hardenings. Todas foram corrigidas e retestadas. A
segunda revisão, restrita ao delta corrigido, terminou em `SHIP` sem blocker
interno restante.

## Otimizações de execução

- Evidências causais anteriores foram reutilizadas apenas onde o código não
  mudou.
- A tentativa de fault injection de importação que não atravessava o processo
  do servidor foi substituída por teste determinístico do helper CAS, evitando
  loop de retries sem relaxar o contrato.
- Suítes integrais não foram repetidas depois de nenhuma mudança relacionada.
- Nenhum deploy, backup, migration ou recurso cloud duplicado foi criado.
