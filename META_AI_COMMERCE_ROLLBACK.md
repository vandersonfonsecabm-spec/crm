# Rollback E6A

Rollback lógico, sem down migration:

1. `AI_COMMERCE_ENABLED=false`;
2. `AI_COMMERCE_SHADOW_WORKER_ENABLED=false`;
3. `AI_COMMERCE_MOCK_ENABLED=false`;
4. limpar allowlist tenant;
5. cancelar runs pendentes e rejeitar drafts por revisão/CAS;
6. preservar audit/idempotency;
7. voltar ao runtime anterior identificável `a1232a1`/tag stock;
8. manter schema aditivo e H7/H8/stock intactos.

Compatibilidade local foi verificada por startup do runtime com flags OFF e
rehearsal em cópia isolada. Rollback de deployment oficial e recovery de
backup não foram executados porque não houve migration/deploy oficial E6A.

`AI_COMMERCE_ROLLBACK_COMPATIBILITY=PASS_LOCAL`
`AI_COMMERCE_ROLLBACK_AVAILABLE=PASS_LOGICAL_NOT_DEPLOYED`
