# Canário E6A adaptado

O canário final foi executado na API oficial, no tenant controlado 1, com
token administrativo curto e sem PII/outbound. O Mock passou os cenários de
roçadeira: pergunta de refinamento, filtros profissional/gasolina/faixa,
busca bounded, availability canônica, oferta, prompt injection e replay
idempotente.

Evidência: backend E6A 21/21; conexão Mock READY/network=false; SHADOW,
SUGGESTION_ONLY e HUMAN_APPROVAL passaram; efeitos de interesse/
OpportunityDraft/handoff foram aprovados separadamente e tenant-safe;
`autoSend=false` e `outbound=0` em todos os resultados. Foreign tenant retornou
403. A checagem PostgreSQL não encontrou MensagemCanal SAIDA desde o início do
canário.

O tenant foi desligado e o produto sintético foi arquivado após os testes. O
estado publicado final permanece:

`AI_COMMERCE_ENABLED=false`
`AI_COMMERCE_SHADOW_WORKER_ENABLED=false`
`AI_COMMERCE_MOCK_ENABLED=false`
`AI_COMMERCE_TENANT_ALLOWLIST=0`
`AI_REAL_PROVIDER_CONNECTED=NO`
`AI_AUTO_REPLY_ENABLED=NO`
`AI_EXTERNAL_OUTBOUND=0`

GATES PASS:

`AI_COMMERCE_MOCK_CANARY=PASS`
`AI_COMMERCE_SHADOW_CANARY=PASS`
`AI_COMMERCE_SUGGESTION_CANARY=PASS`
`AI_COMMERCE_HUMAN_APPROVAL_CANARY=PASS`
`AI_COMMERCE_CANARY_TENANT_ISOLATION=PASS`
`AI_COMMERCE_CANARY_OUTBOUND=0`
`AI_COMMERCE_CANARY_CLEANUP=PASS_RETENTION_POLICY_ACTIVE`

O Mock local e live passaram. A única pendência E6A é a QA visual autenticada
do frontend; o canário de API não foi confundido com prova visual.
