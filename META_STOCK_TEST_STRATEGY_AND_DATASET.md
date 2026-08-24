# Estratégia de testes e dataset sintético

CURRENT_STATE_AS_OF=2026-08-23T17:51:15Z
BASELINE_SHA=a5a280c3ebc54741ced02a77d4da5ec51834d583
ARCHITECTURE_VERSION=E1-v1.0
DOCUMENT_STATUS=FINAL

## Unit e conformance

- parser/normalização, mapping, barcode/SKU, unidade/decimal, validade DATE/precisão, timezone/DST, freshness/confiança, thresholds, occurrence key, prioridade e predicates de resolução;
- adapter conformance obrigatório: manifesto truthful, schema version, redaction, tenant context, pagination/cursor, idempotência, retry/timeout, full/delta/webhook/file semantics, malformed record, no writeback e zero secret leakage;
- compatibility: adapter antigo com normalizador novo, versão futura rejeitada fail-closed, envelope migration explícita.

## Integration/concurrency/security

- adapter → normalized → observation/saldo → checkpoint/outbox → H8 projection/audit;
- full snapshot parcial, delta repetido/fora de ordem, webhook replay, import preview/confirm/cancel, retry após crash;
- dois workers no mesmo tenant/fonte, full+delta concorrentes, lease expiry, mapping/override/regra alterados durante avaliação;
- cross-tenant IDs, tenant spoof, webhook spoof/replay, SSRF, arquivo gigante/fórmula/path traversal, query SQL fora de template, payload XSS/secret.

## E2E futuro

1. configurar `FILE_IMPORT_CSV` sintético;
2. importar produto/lote/saldo;
3. lote entra na janela e gera H8;
4. badge/list/deep link; read não resolve;
5. snooze/unsnooze/read-all cutoff;
6. quantidade relevante zero resolve;
7. fonte stale gera alerta e não finge zero;
8. sync recupera e resolve falha/stale;
9. mapping ambíguo fica em quarantine;
10. tenant A não lê/edita B; mobile/a11y/console/no-outbound.

## Dataset de referência (não criado no runtime)

- 2 tenants (`A`, `B`), 2 fontes por tenant;
- produtos com SKU/barcode conflitantes, nome repetido, mapping MATCHED/UNMATCHED/AMBIGUOUS;
- locais depósito/loja/quarentena e localização desconhecida;
- lotes válidos, próximos, vencidos, sem validade, precisão mês/ano;
- quantidades zero, positiva, decimal, reservada, disponível desconhecida e quarentena;
- full snapshot, delta duplicado, evento fora de ordem, tombstone e partial failure;
- fonte stale, sync failed/recovered, credencial inválida simulada, 429/Retry-After;
- virada de dia `America/Sao_Paulo`, DST/fake clock e clock skew;
- ataques: ID do tenant B no payload A, external ID colidido, webhook replay, CSV formula e arquivo grande.

## Performance e migration

Testar snapshot grande em páginas bounded, fairness por tenant, memória, índices, backpressure, no N+1 e ausência de notification storm. Migration rehearsal em banco vazio/povoado, backfill, unique/FK precheck, backward compatibility e rollback lógico antes de qualquer produção.
