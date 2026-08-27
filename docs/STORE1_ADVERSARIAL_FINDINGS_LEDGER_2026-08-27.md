# STORE-1 — ledger de findings adversariais

| ID | Área | Severidade | Finding | Estado | Evidência/reteste |
|---|---|---:|---|---|---|
| ADV-001 | Integrações | HIGH | segredo aceitável em configuração plaintext/response | FIXED | integration security + hub PASS |
| ADV-002 | Segurança | HIGH | CORS de produção usava defaults fail-open | FIXED | origin policy 4/4 + global PASS |
| ADV-003 | Clientes | HIGH | frontend inventava valor monetário | FIXED | frontend causal + 215/215 |
| ADV-004 | Customer 360 | HIGH | Agenda ignorava acompanhamentoId | FIXED | frontend causal + 215/215 |
| ADV-005 | Importação | HIGH | processar/cancelar sem claim causal único | FIXED | CAS unit + import E2E PASS |
| ADV-006 | Identidade | HIGH | Site/e-mail podiam duplicar cliente concorrente | FIXED | Site PASS; e-mail PASS; PG-only explícito |
| ADV-007 | Bling | MEDIUM | 401 final mantinha integração ativa | FIXED | Bling hardening + integration PASS |
| ADV-008 | Bling | MEDIUM | expires_in inválido virava 6h | FIXED | casos 0/vazio/bool/negativo/NaN PASS |
| ADV-009 | UI Bling | MEDIUM | PENDENTE com credencial aparecia conectado | FIXED | frontend causal + 215/215 |
| ADV-010 | WhatsApp | MEDIUM | CONFIGURED_INACTIVE afirmava autorização Meta | FIXED | frontend causal + 215/215 |
| ADV-011 | IA | MEDIUM | normalizador forçava provider real desconectado | FIXED | frontend causal + 215/215 |
| ADV-012 | Instagram | MEDIUM | OAuth habilitado em estado conectado/erro | FIXED | frontend causal + lint/build |
| ADV-013 | Messenger | MEDIUM | 401 tinha handler no-op | FIXED | frontend causal + 215/215 |
| ADV-014 | Erros provider | MEDIUM | mensagens externas podiam persistir segredo | FIXED | sanitização causal PASS |
| ADV-015 | Simulador | MEDIUM | replay cross-conversation aceitava payload divergente | FIXED | channels PASS |
| ADV-016 | Frontend | MEDIUM | fetch de leitura sem deadline; timeout genérico em write seria ambíguo | FIXED | timeout só para método seguro + build/tests |
| ADV-017 | Dashboard | MEDIUM | resumo stale após mutação | FIXED | invalidation event + frontend PASS |
| ADV-018 | Automações UI | MEDIUM | load/toggle/retry concorrentes | FIXED | sequence/lock + lint/build |
| ADV-019 | Integrações UI | MEDIUM | cargas duplicadas/stale | FIXED | sequence + remoção reload duplicado |
| ADV-020 | Automações API | MEDIUM | update/activate sem CAS | FIXED | updateMany por versão + global PASS |
| ADV-021 | Notificações worker | MEDIUM | falha parcial era engolida | FIXED | worker observability 16/16 |
| ADV-022 | Notificações | MEDIUM | offset mutável permitia starvation | FIXED | keyset por ID + notifications 10/10 |
| ADV-023 | Catálogo | MEDIUM | local/disponível podiam vir de estoques distintos | FIXED | filter causal PASS |
| ADV-024 | Follow-up | MEDIUM | vínculo não exigia tenant/count | FIXED | backend global PASS |
| ADV-025 | Site URLs | LOW/MEDIUM | esquemas arbitrários eram aceitos | FIXED | Site PASS |
| ADV-026 | Polling | LOW | contador continuava em aba oculta | FIXED | visibility guard + frontend PASS |
| ADV-027 | Dashboard boot | MEDIUM | atraso artificial fixo | FIXED | removido + bundle/build PASS |
| EXT-001 | Meta webhooks | HIGH readiness | processamento síncrono antes do ACK | PENDING_EXTERNAL_PROVIDER | bloquear ativação real |
| EXT-002 | Bling | MEDIUM readiness | lock de refresh/sync somente em processo | PENDING_EXTERNAL_PROVIDER | exigir lock distribuído antes de escala/provider |
| ADV-028 | PostgreSQL | evidence | três provas concurrency-only não rodaram no SQLite | UNTESTED_POSTGRES_ONLY | SKIP explícito, não contado como PASS |
| ADV-029 | Browser | evidence | candidato local ainda não foi deployado | UNTESTED_FINAL_RUNTIME | produção/staging preservados |

## Reconciliação do inventário

As superfícies omitidas nas matrizes históricas foram reincluídas nesta
auditoria: Site Form, Import Hub, qualidade/consulta comercial, operador de
plataforma e capability, segurança de usuários/sessões/convites, qualidade e
regras de estoque, registro de empresa e separação entre Bling interno e
provider real. Todas possuem cobertura na suíte global ou estão classificadas
como provider externo; nenhuma foi convertida em PASS apenas por existir código.
