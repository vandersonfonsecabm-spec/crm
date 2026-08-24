# Canário E6A adaptado

O canário executado foi local, determinístico e sem PII/outbound. O Mock foi
validado nos cenários de roçadeira: pergunta de refinamento, filtros
profissional/gasolina/faixa, busca bounded, availability canônica, no-price,
stale, no-match e prompt injection.

Evidência: backend E6A 17/17; efeitos de interesse/OpportunityDraft/handoff
idempotentes e tenant-safe; `outbound=0` em todos os resultados.

Não foi ativado tenant real em produção, não houve upload/deploy e não foram
criados registros AI em banco oficial. O estado final local é:

`AI_COMMERCE_ENABLED=false`
`AI_COMMERCE_SHADOW_WORKER_ENABLED=false`
`AI_COMMERCE_MOCK_ENABLED=false`
`AI_COMMERCE_TENANT_ALLOWLIST=`
`AI_REAL_PROVIDER_CONNECTED=NO`
`AI_AUTO_REPLY_ENABLED=NO`
`AI_EXTERNAL_OUTBOUND=0`
