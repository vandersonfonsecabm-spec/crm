# Canário E6A adaptado

O canário executado foi local, determinístico e sem PII/outbound. O Mock foi
validado nos cenários de roçadeira: pergunta de refinamento, filtros
profissional/gasolina/faixa, busca bounded, availability canônica, no-price,
stale, no-match e prompt injection.

Evidência: backend E6A 17/17; efeitos de interesse/OpportunityDraft/handoff
idempotentes e tenant-safe; `outbound=0` em todos os resultados.

Não foi ativado tenant AI real em produção: a migration/deploy OFF foi
concluída, mas não houve sessão administrativa/tenant controlado disponível
para ligar o Mock com segurança. Não foram criados registros AI de canário no
banco oficial. O estado publicado permanece:

`AI_COMMERCE_ENABLED=false`
`AI_COMMERCE_SHADOW_WORKER_ENABLED=false`
`AI_COMMERCE_MOCK_ENABLED=false`
`AI_COMMERCE_TENANT_ALLOWLIST=`
`AI_REAL_PROVIDER_CONNECTED=NO`
`AI_AUTO_REPLY_ENABLED=NO`
`AI_EXTERNAL_OUTBOUND=0`

GATES:

`AI_COMMERCE_MOCK_CANARY=BLOCKED_SESSION`
`AI_COMMERCE_SHADOW_CANARY=BLOCKED_SESSION`
`AI_COMMERCE_SUGGESTION_CANARY=BLOCKED_SESSION`
`AI_COMMERCE_HUMAN_APPROVAL_CANARY=BLOCKED_SESSION`

O Mock local continua PASS (17/17 testes). O bloqueio é operacional de
autenticação/tenant, não uma conexão de provedor: `AI_REAL_PROVIDER_CONNECTED=NO`
e `AI_EXTERNAL_OUTBOUND=0` continuam verdadeiros.
