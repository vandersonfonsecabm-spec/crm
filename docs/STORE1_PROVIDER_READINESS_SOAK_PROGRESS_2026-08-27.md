# STORE-1 — Checkpoint do fechamento técnico e soak de staging

Data do checkpoint: 2026-08-27 19:48 BRT

Branch: `codex/store1-release-reconcile`

Commit funcional atual: `db59f37ee69c0ed2b4cb3c75b871dfb1ed5a0162`

## Estado executivo

O candidato de preparação para integrações foi implementado, revisado, corrigido e publicado somente no staging. Produção não foi alterada. Nenhum provider real foi conectado, nenhuma credencial real foi usada e nenhum outbound externo foi habilitado.

O soak real de staging, com duração canônica de 255 minutos (4h15), está em execução. Portanto, este documento é um checkpoint intermediário e não declara `SOAK=PASS`.

```text
STORE1_INTERNAL_PRODUCT_READY=PASS
FINAL_RUNTIME_READY=PASS
SOAK_4H15=IN_PROGRESS
SOAK_STARTED_AT_APPROX=2026-08-27T19:39:00-03:00
SOAK_EXPECTED_END_APPROX=2026-08-27T23:54:00-03:00
MONITORING_INTERVAL=30_MINUTES
PRODUCTION_CHANGED=false
REAL_PROVIDER_CONNECTIONS=0
REAL_PROVIDER_CREDENTIALS_USED=0
REAL_OUTBOUND=0
```

## Trabalho concluído neste lote

- Corrigido o runner de soak para autenticação real com `ADMIN`, `GERENTE` e `VENDEDOR`.
- Adicionada renovação automática de access token e rotação de refresh cookie somente em memória.
- Criado provisionamento staging-only de três identidades sintéticas `@example.test`.
- Adicionado cleanup obrigatório: revogação de sessões/tokens e desativação das identidades temporárias.
- Preservada integralmente a conta QA permanente do projeto.
- Adicionado lease distribuído tenant-scoped para impedir duas execuções simultâneas.
- Adicionada recuperação segura de identidades abandonadas por interrupção abrupta.
- Corrigidos gates que permitiam falso PASS com 401/403, redirect, snapshot inválido ou falhas por papel.
- Adicionada validação explícita de tenant, papel e status após login e refresh.
- Adicionada validação operacional dos jobs por baseline/final:
  - total;
  - pending;
  - running;
  - succeeded;
  - failed;
  - cancelled;
  - stuck;
  - retries;
  - duplicates.
- Adicionado bloqueio para fila não drenada, incoerência de contagens e novos failed/stuck/retry/duplicate.
- Corrigida execução da Railway CLI no Windows sem shell e sem imprimir variáveis.
- Adicionada construção segura da URL PostgreSQL pública usando somente metadata do proxy staging.
- Criado proxy TCP temporário exclusivamente para `Postgres--e25`.
- Publicada somente a API staging; frontend, worker e produção foram preservados quando não havia delta causal.

## Findings encontrados durante os pente-finos

Os reviews adversariais impediram múltiplos falsos PASS antes de qualquer execução real:

1. tokens estáticos expirariam após aproximadamente 15 minutos;
2. Prisma poderia validar uma URL e conectar em outra;
3. cleanup parcial não era idempotente;
4. redirects e 4xx podiam ser contabilizados incorretamente;
5. tokens não provavam tenant/papel;
6. duas execuções poderiam interferir entre si;
7. falha transitória de refresh podia inutilizar a identidade;
8. formato válido de jobs não garantia saúde operacional;
9. valores `null` ou string podiam virar zero por coerção;
10. o template Railway staging não possuía proxy TCP público;
11. o Prisma local estava inicialmente gerado para SQLite, não PostgreSQL;
12. o primeiro deploy foi corretamente rejeitado como `SKIPPED` e substituído por deployment forçado e verificável.

Todos os findings acima foram corrigidos e retestados antes do soak.

## Evidências atuais

```text
SOAK_HARNESS_TESTS=27/27_PASS
NODE_CHECK=PASS
GIT_DIFF_CHECK=PASS
FINAL_ADVERSARIAL_REVIEW=SHIP
GIT_REMOTE_PARITY=PASS
STAGING_API_DEPLOYMENT=SUCCESS
STAGING_HEALTH=200
STAGING_READY=200
STAGING_ALIAS=200
DEV_DB_SHA256=6116ca72110d8c4a6b5bc214a476993afdc155ec32b3b2431e4ce54254a42533
```

## Monitoramento em andamento

Uma automação acompanha a execução a cada 30 minutos. Ela não reinicia nem duplica o soak.

Ao término, deve:

1. validar o ledger sanitizado;
2. confirmar zero request para produção e zero provider egress;
3. confirmar health/ready e restart do staging;
4. confirmar cleanup das três identidades sintéticas;
5. remover o proxy TCP temporário;
6. remover o pacote temporário de deploy;
7. restaurar o Prisma local para SQLite;
8. executar a regressão proporcional final;
9. atualizar os relatórios canônicos;
10. enviar os arquivos finais reais na conversa fixada.

## Limitações honestas deste checkpoint

- `SOAK_4H15` ainda não pode receber `PASS`.
- E-mail e IA possuem fundação provider-neutral, mas o adapter real depende de futura seleção de provider.
- Meta, WhatsApp, Instagram, Messenger e Bling permanecem sem conta real conectada.
- Este checkpoint será substituído pelo relatório final após a conclusão e validação do soak.
