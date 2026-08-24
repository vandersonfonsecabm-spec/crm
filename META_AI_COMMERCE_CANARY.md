# Canário E6A adaptado

O canário executado foi controlado em produção, determinístico e sem PII/outbound. O Mock foi
validado nos cenários de roçadeira: pergunta de refinamento, filtros
profissional/gasolina/faixa, busca bounded, availability canônica, no-price,
stale, no-match e prompt injection.

Evidência: backend E6A 23/23; efeitos de interesse/OpportunityDraft/handoff
idempotentes e tenant-safe; `outbound=0` em todos os resultados.

O tenant controlado executou SHADOW, SUGGESTION_ONLY e HUMAN_APPROVAL com
aprovação granular. Nenhuma chamada de sender ou outbound ocorreu; os dados
sintéticos foram removidos e a auditoria/idempotência foi preservada. O estado
final publicado permanece:

`AI_COMMERCE_ENABLED=false`
`AI_COMMERCE_SHADOW_WORKER_ENABLED=false`
`AI_COMMERCE_MOCK_ENABLED=false`
`AI_COMMERCE_TENANT_ALLOWLIST=`
`AI_REAL_PROVIDER_CONNECTED=NO`
`AI_AUTO_REPLY_ENABLED=NO`
`AI_EXTERNAL_OUTBOUND=0`

GATES:

`AI_COMMERCE_MOCK_CANARY=PASS`
`AI_COMMERCE_SHADOW_CANARY=PASS`
`AI_COMMERCE_SUGGESTION_CANARY=PASS`
`AI_COMMERCE_HUMAN_APPROVAL_CANARY=PASS`

O Mock local e live continuam PASS. Não houve conexão de provedor:
`AI_REAL_PROVIDER_CONNECTED=NO` e `AI_EXTERNAL_OUTBOUND=0` continuam verdadeiros.
