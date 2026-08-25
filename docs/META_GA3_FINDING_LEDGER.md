# Ledger único de findings — GA3

CURRENT_STATE_AS_OF=2026-08-25 BRT
START_SOURCE_SHA=25b36e639612275abc826f36f8f89a66fd06701a
CURRENT_SOURCE_SHA=cf7e87f961b05996d4e806ab7bcfd657b2b111f0
FINAL_RUNTIME_SHA=cf7e87f961b05996d4e806ab7bcfd657b2b111f0
DOCUMENT_STATUS=GA3_LEDGER_WITH_EXTERNAL_GATES

| ID | Severidade | Domínio | Causa/evidência | Correção/estado |
|---|---|---|---|---|
| GA3-SEC-001 | HIGH | AI runs | idempotency lookup sem empresa/conversa permitia replay cross-tenant | Corrigido em `27714b8`; teste tenant/conversa-scoped PASS |
| GA3-SEC-002 | HIGH | AI offers | `input.offers` podia forjar preço/disponibilidade | Corrigido em `27714b8`; ProductOffer revalidado, teste PASS |
| GA3-SEC-003 | HIGH | HITL | `approvedActions` do body podia autorizar efeito em `/runs` | Corrigido em `27714b8`; run sempre passa `{}`, teste PASS |
| GA3-SEC-004 | HIGH | Contexto | latestMessage/messages/customer/revision eram spoofáveis | Corrigido em `27714b8`; resolver carrega registros do tenant e falha fechado |
| GA3-REL-005 | MEDIUM | Settings | SELECT→upsert não era CAS atômico | Corrigido em `a3c0600`; updateMany por revision, 409/503 seguro |
| GA3-SEC-006 | MEDIUM | Estoque/API | evidence expunha IDs internos de saldo/fonte/lote | Corrigido em `5de92d0`/`d6b665e`; externo recebe evidence vazio |
| GA3-SEC-007 | MEDIUM | Flags | allowlist AI aceitava token inválido e habilitava subconjunto | Corrigido em `5de92d0`; parser fail-closed compartilhado |
| GA3-PERF-008 | MEDIUM | Frontend | `/auth/me` era chamado duas vezes no bootstrap | Corrigido em `3307e18`; 19/19 auth e 195/195 frontend |
| GA3-PERF-009 | MEDIUM | Catálogo | busca fazia N+1 de disponibilidade e overfetch | Corrigido em `d6b665e`; disponibilidade opt-in, projeção bounded |
| GA3-DATA-010 | MEDIUM | Estoque | soma JS podia misturar unidades/fontes/duplicatas e perder precisão | Corrigido em `d6b665e`; autoridade, unidade, BigInt fixed-scale e overflow fail-closed |
| GA3-REL-011 | MEDIUM | ProductOffer | previews repetidos cresciam linhas ativas | Corrigido em `d6b665e`; reuse/in-flight lock/cap por conversa |
| GA3-SEC-012 | MEDIUM | Tools/audit | schemas eram declarativos, redaction não cobria apiKey/privateKey/accessKey | Corrigido em `cf5c999`; validação strict, redaction recursiva, payload cap |
| GA3-REL-013 | MEDIUM | Effects | corrida P2002 podia responder 500 apesar de efeito único | Corrigido em `cf5c999`; reconciliação idempotente e teste causal |
| GA3-SEC-019 | HIGH | Effects | replay sequencial de opportunity/handoff retornava linha anterior só por chave | Corrigido em `cf7e87f`; revalidação de conversa/ofertas/parents + testes |
| GA3-SEC-020 | HIGH | Redaction | profundidade >5 devolvia objeto original | Corrigido em `cf7e87f`; marcador `[truncated]` + teste profundo |
| GA3-OPS-014 | MEDIUM | PostgreSQL | checkpoint histórico de 247s (com outros outliers) | ABERTO_ADVISORY: monitorar/correlacionar; sem tuning especulativo |
| GA3-ENV-015 | BLOCKED_EXTERNAL | PostgreSQL | sem Docker/psql/initdb/URL descartável | Runner plug-and-play pronto; prova real não inventada |
| GA3-ENV-016 | BLOCKED_EXTERNAL | pg_stat_statements | extensão/cluster descartável não disponível | Script read-only pronto; sem CREATE/RESET |
| GA3-ARCH-017 | ACCEPTED_NON_ACTIONABLE | legado | Hub/ProdutoExterno/Bling ainda são rotas administrativas/TEST_ONLY | Mantidos por compatibilidade; fora do caminho AI canônico |
| GA3-ARCH-018 | ACCEPTED_NON_ACTIONABLE | dead code | `ai-commerce/mock.js` não é importado pelo backend | Classificado PROVEN_DEAD; não removido sem contrato de compatibilidade explícito |

Não há finding HIGH/CRITICAL acionável aberto no snapshot publicado. O checkpoint de 247s e os gates PostgreSQL continuam limitações explícitas, não PASS artificial.
