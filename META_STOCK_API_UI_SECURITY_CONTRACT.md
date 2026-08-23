# Contrato de API, UI e segurança

CURRENT_STATE_AS_OF=2026-08-23T17:51:15Z
BASELINE_SHA=a5a280c3ebc54741ced02a77d4da5ec51834d583
ARCHITECTURE_VERSION=E1-v1.0
DOCUMENT_STATUS=FINAL

## API conceitual futura

Todas as rotas exigem autenticação, tenant do contexto server-side e role adequada; nenhuma aceita `empresaId` do cliente como autoridade.

| Método/rota proposta | Role | Idempotência/erro |
|---|---|---|
| `GET /estoque/fontes` | ADMIN/GERENTE | paginação; sem segredos |
| `POST /estoque/fontes` | ADMIN | idempotency key; DRAFT |
| `POST /estoque/fontes/:id/validar` | ADMIN | health redacted; 401/403/422 |
| `POST /estoque/fontes/:id/sincronizar` | ADMIN/GERENTE | run key; 409 se lease ativo |
| `GET /estoque/sincronizacoes/:id` | ADMIN/GERENTE | tenant-scoped |
| `POST /estoque/importacoes/preview` | ADMIN | batch id; limites de arquivo |
| `POST /estoque/importacoes/:id/confirmar` | ADMIN | CAS/revision |
| `GET /estoque/produtos`, `/lotes`, `/saldos` | ADMIN/GERENTE | keyset/paginação bounded |
| `POST /estoque/mapeamentos/:id/confirmar` | ADMIN/GERENTE | audit + CAS |
| `GET/PATCH /estoque/regras` | ADMIN | precedência e recálculo explícitos |
| `GET /estoque/freshness` | ADMIN/GERENTE | sem payload bruto |

Erros: 400 schema, 401 sessão, 403 role/tenant, 404 target seguro, 409 revision/lease, 413 arquivo, 422 capability/dado inválido, 429 quota, 503 fonte degradada. Stack trace, URL de banco e PII nunca aparecem.

## UI contratual futura

Sem implementação nesta missão, a interface deverá contemplar: visão geral, produtos, lotes, vencidos/próximos, fontes/status, freshness/confiança, mappings pendentes, histórico de sync e regras. Cada estado deve ter loading, empty, error, restricted, stale e partial. Exibir fonte, `observedAt`, confiança e capability ausente; nunca sugerir quantidade atual quando stale.

Acessibilidade: landmarks/headings, accessible names, foco/teclado/Escape, retorno de foco em drawers/dialogs, lista semântica, contraste, não depender só de cor, touch targets e rotas mobile. O domínio não deve criar novo padrão visual: reutilizar tokens/primitivos existentes.

## Segurança de adapters

- SSRF: endpoint allowlist/HTTPS, bloqueio de IP privado/redirects e timeout.
- Webhook: assinatura, timestamp/nonce, replay window, event ID e resolução server-side da conexão.
- CSV/XLSX: limite de bytes/linhas, parser seguro, fórmula neutralizada, encoding/delimiter explícitos, path traversal impossível.
- Database read-only: connection identity atestada, usuário sem escrita, query templates parametrizados, limite de rows/tempo; nunca SQL arbitrário.
- Payload: schema/version, size limit, sanitização de strings/HTML, quarantine para campos malformados.
- Credenciais: encrypted at rest pelo mecanismo aprovado, tenant-scoped, least privilege, health redacted, rotação futura; nunca log/report/UI.
- Retry/circuit: budgets, jitter, backpressure e kill switch por fonte.

## Tenant, autorização e cache

Toda entidade nova inclui `empresaId`; FKs compostas garantem parent/child do mesmo tenant; cache/idempotency keys incluem tenant+fonte; worker não confia em tenant do payload; mapping/manual override exige role e audit. Deep links e APIs com ID estrangeiro retornam 404/403 indistinguível sem vazamento.

## Observabilidade

Métricas: runs por estado, duração, accepted/rejected, freshness lag, retries, mapping pendente, rule matches, H8 projections, dedupe hits, storms, erros por classe e cardinalidade sanitizada. Correlation chain: `source event/import → syncRunId → normalized record → rule evaluation → occurrenceKey → H8`. Logs não contêm segredo/PII desnecessária.
