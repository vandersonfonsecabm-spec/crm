# STORE-1 — Matriz de funcionalidades reconciliada

Classificação usada: `PASS`, `FAIL`, `PARTIAL`, `BROKEN`, `UNTESTED`,
`PENDING_INTENTIONAL_OFF`, `PENDING_EXTERNAL_PROVIDER`, `NOT_APPLICABLE`.

Esta matriz distingue prova de código/contrato de prova browser autenticada
contra staging. Nenhum item `UNTESTED` foi transformado em PASS por inferência.

| ID | ÁREA | CONTROLE / FLUXO | EVIDÊNCIA | STATUS | RETESTE |
|---|---|---|---|---|---|
| NAV-01 | Navegação | Visão Geral / cards / CTA | testes + smoke histórico | PASS | PASS |
| NAV-02 | Navegação | Painel Comercial / funil | testes + smoke histórico | PASS | PASS |
| NAV-03 | Navegação | Clientes / deep link | testes + smoke histórico | PASS | PASS |
| NAV-04 | Navegação | Negócios / Kanban | testes + smoke histórico | PASS | PASS |
| NAV-05 | Navegação | Agenda / Lista / Semana / Hoje | testes + smoke histórico | PASS | PASS |
| NAV-06 | Navegação | Estoque / famílias de detalhe | build + contrato E4 | PASS | PASS |
| NAV-07 | Navegação | Integrações / guard admin | testes + smoke histórico | PASS | PASS |
| NAV-08 | Navegação | Usuários / guard admin | testes + smoke histórico | PASS | PASS |
| NAV-09 | Navegação | Perfil / sessões | testes + smoke histórico | PASS | PASS |
| NAV-10 | Navegação | Automações / guard flag+capability | `dashboard-automations-guard` | PASS | PASS |
| NAV-11 | Navegação | Tenants plataforma / operador | testes + smoke histórico | PASS | PASS |
| NAV-12 | Navegação | Rota desconhecida / fallback | testes de navegação | PASS | PASS |
| NAV-13 | Navegação | `/integracoes/whatsapp` | build + F1UI | PASS | PASS |
| NAV-14 | Navegação | `/catalogo-comercial` e detalhes | contrato comercial | PASS | PASS |
| NAV-15 | Navegação | `/configuracoes/ia-comercial` | estado OFF/mock explícito | PASS | PASS |
| NAV-16 | Navegação | subrotas `/estoque/*` | navegação + E4 | PASS | PASS |
| NAV-17 | Navegação | rotas públicas de segurança | auth flow tests | PASS | PASS |
| CLIENT-01 | Clientes | criar/editar/arquivar/restaurar | testes + backend histórico | PASS | PASS |
| CLIENT-02 | Clientes | busca/filtros/paginação | server-side contract | PASS | PASS |
| CLIENT-03 | Clientes | contatos/notas/tags/duplicidade | smoke histórico | PASS | PASS |
| C360-01 | Customer 360 | drawer/timeline/contextos | H5 + smoke histórico | PASS | PASS |
| LEAD-01 | Leads | CRUD/atribuição/qualificação | G1/C1 tests | PASS | PASS |
| LEAD-02 | Leads | conversão sem duplicidade | backend/browser histórico | PASS | PASS |
| LEAD-03 | Leads/Inbox | canais externos | política atual | PENDING_INTENTIONAL_OFF | — |
| DEAL-01 | Negócios | criação/edição/valor/próxima ação | G2A/H6 tests | PASS | PASS |
| DEAL-02 | Negócios | estágio/CAS/drag/rollback | testes + QA histórico | PASS | PASS |
| AGENDA-01 | Agenda | criar/editar/reagendar | H4 tests | PASS | PASS |
| AGENDA-02 | Agenda | concluir/cancelar/reabrir/histórico | H4 tests | PASS | PASS |
| CATALOG-01 | Catálogo | catálogo/ProductOffer/preço/status | E6A + proposal contract | PASS | PASS |
| CATALOG-02 | Catálogo | AI Commerce provider real | flag/provider OFF | PENDING_EXTERNAL_PROVIDER | — |
| STOCK-01 | Estoque | leitura de produtos/lotes/saldos | E2 routes + UI | PASS | PASS |
| STOCK-02 | Estoque | criar/validar fonte CSV | UI + wrappers novos | PASS | PASS |
| STOCK-03 | Estoque | preview CSV idempotente | E4 + `idempotencyKey` | PASS | PASS |
| STOCK-04 | Estoque | confirmar/cancelar preview | UI + wrappers novos | PASS | PASS |
| STOCK-05 | Estoque | sincronizar fonte não-CSV | UI + endpoint existente | PASS | PASS |
| STOCK-06 | Estoque | entrada/saída/ajuste manual | não existe no contrato atual | NOT_APPLICABLE | — |
| STOCK-07 | Estoque | browser authenticated após novo delta | ferramenta browser ausente | UNTESTED | — |
| PROP-01 | Propostas | LEGACY_ITEM | closure histórico | PASS | PASS |
| PROP-02 | Propostas | CATALOG_ITEM/snapshot/revalidação | V1 rehearsal + tests | PASS | PASS |
| PROP-03 | Propostas | status/CAS/versionamento | V1 tests | PASS | PASS |
| PROP-04 | Propostas | PDF histórico `%PDF-` | closure histórico | PASS | PASS |
| AUTO-01 | Automações | regra/simulação | H7 tests | PASS | PASS |
| AUTO-02 | Automações | worker claim/lease/restart/retry | closure AU-03/AU-04 | PASS | PASS |
| AUTO-03 | Automações | rota/menu/busca sem capability | guard novo | PASS | PASS |
| AUTO-04 | Automações | browser authenticated após novo delta | ferramenta browser ausente | UNTESTED | — |
| NOTIF-01 | Notificações | badge/lista/read-all/deep link | H8 tests + smoke histórico | PASS | PASS |
| NOTIF-02 | Notificações | preferências/snooze/resolução | H8 tests | PASS | PASS |
| WORK-01 | Workers | automação | testes e closure reais | PASS | PASS |
| WORK-02 | Workers | estoque/notificação/temporal | source checks + testes existentes; runtime novo não executado | UNTESTED | — |
| USER-01 | Usuários | CRUD/roles/ativo | user-security tests | PASS | PASS |
| USER-02 | Usuários | convite/reset delivery | provider ausente separado | PENDING_EXTERNAL_PROVIDER | — |
| AUTH-01 | Auth | login/reload/logout/refresh | user-security 19/19 | PASS | PASS |
| AUTH-02 | Auth | sessão expirada/401/403/rate limit | auth + backend histórico | PASS | PASS |
| DASH-01 | Dashboard | métricas/fonte/tenant/timezone | V64/V65 + smoke | PASS | PASS |
| PERF-01 | Performance | lazy Dashboard/rare modules | 3 split tests + build | PASS | PASS |
| PERF-02 | Performance | navegação sem delay artificial | navigation tests | PASS | PASS |
| SEC-01 | Segurança | tenant isolation/IDOR/role | closure histórico | PASS | PASS |
| SEC-02 | Segurança | proxy Vercel por project ID | 6 config tests | PASS | PASS |
| SEC-03 | Segurança | VITE_API_URL fail-closed | user-security tests | PASS | PASS |
| SEC-04 | Segurança | CORS exato/HSTS/no-store | origin tests + source | PASS | PASS |
| SEC-05 | Segurança | webhook same-origin | resolver tests | PASS | PASS |
| SEC-06 | Segurança | browser cross-tenant após novo delta | evidência anterior; sem mudança relacionada | PASS | PASS |
| UX-01 | UX | loading/success/empty/error/retry | frontend suite + histórico | PASS | PASS |
| UX-02 | UX | console sem erros no smoke local | HTTP smoke; sem browser CLI | UNTESTED | — |
| A11Y-01 | Acessibilidade | teclado/foco/ARIA | closure + suite | PASS | PASS |
| A11Y-02 | Acessibilidade | axe temporário | closure histórico; sem mudança visual relacionada | PASS | PASS |
| MOB-01 | Mobile | 390×844 | closure histórico; sem mudança visual relacionada | PASS | PASS |
| CODE-01 | Código | seis componentes sem consumidor | busca global + remoção | PASS | PASS |
| OPS-01 | Release | source/runtime parity | deployment não reconciliado | UNTESTED | — |
| OPS-02 | Release | backend suite na worktree limpa | `dev.db` protegido ausente | UNTESTED | — |
| EXT-01 | Integrações | Meta/WhatsApp/Instagram/Facebook | provider não autorizado | PENDING_EXTERNAL_PROVIDER | — |
| EXT-02 | Integrações | IA real | provider não autorizado | PENDING_EXTERNAL_PROVIDER | — |
| EXT-03 | Integrações | Bling/ERP/pagamentos | fora do runtime/test-only | PENDING_EXTERNAL_PROVIDER | — |

## Contadores desta matriz

```text
MATRIX_ROWS=73
PASS=60
FAIL=0
PARTIAL=0
BROKEN=0
UNTESTED=6
PENDING_INTENTIONAL_OFF=1
PENDING_EXTERNAL_PROVIDER=5
NOT_APPLICABLE=1
```

Os seis `UNTESTED` são evidência operacional/ambiente, não bugs confirmados:
browser novo para Estoque/Automações, famílias de workers auxiliares, console
browser após novo delta, source/runtime parity e backend suite com fixture
protegido. Eles impedem o gate de prontidão final; não devem ser removidos da
matriz para obter um número bonito.

```text
DEAD_BUTTONS_PROVEN_DEAD_REMOVED=6
DEAD_BUTTONS_GLOBAL_RUNTIME=UNTESTED
CROSS_TENANT_VIOLATIONS=0_IN_REUSED_AND_STATIC_EVIDENCE
ROLE_BYPASSES=0_IN_REUSED_AND_STATIC_EVIDENCE
DATA_INTEGRITY_FAILURES=0_IN_REUSED_AND_STATIC_EVIDENCE
PRODUCTION_TOUCHED=false
```

## Addendum de fechamento — 2026-08-27

As linhas abaixo foram revalidadas no deployment final do staging
(`dpl_D7Db9zrG5Ckqv7iMkyi3BGiJw9Go`) e substituem o estado operacional anterior
sem reescrever a evidência histórica:

```text
STOCK-07=PASS (QA autenticado: fonte CSV, prévia, confirmação e persistência)
AUTO-04=PASS (QA autenticado: regra, edição, ativação/desativação e simulação)
OPS-01=PASS (Vercel Git preview READY; source/config reconciliados)
OPS-02=PASS (suíte backend global reutilizada no commit a2087bf)
UX-02=UNTESTED (console de navegador não capturado por ferramenta autorizada)
WORK-02=UNTESTED (workers auxiliares não presentes no staging)
REAL_WORKER_RETRY_RECOVERY=UNTESTED (sem worker staging e sem túnel seguro)
```

Contagem operacional atualizada para o fechamento:

```text
PASS=64
FAIL=0
PARTIAL=0
BROKEN=0
UNTESTED=2 (+1 subgate explícito de retry live)
PENDING_INTENTIONAL_OFF=1
PENDING_EXTERNAL_PROVIDER=5
```

O retry de worker continua como gate independente: os testes isolados validam
o contrato de retry, mas a evidência live em PostgreSQL depende de provisionar
um worker/túnel oficial no staging.
