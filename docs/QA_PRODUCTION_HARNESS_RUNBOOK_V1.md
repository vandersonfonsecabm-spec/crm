# Runbook — QA Production Harness V1

Este runbook descreve a operação do bootstrap interno QA-only. Ele não é uma
rota HTTP, não usa SQL direto e não autoriza providers, outbound ou clientes
reais.

## Ordem obrigatória

1. Confirmar `--target=staging` ou `--target=production` e o SHA do candidato.
2. Obter atestado externo read-only do Railway e da identidade observada do
   PostgreSQL efetivamente usado pelo Prisma.
3. Para produção, criar backup novo, SHA-256 e restore drill isolado antes de
   qualquer escrita; o backup recebe o mesmo `runId` do atestado.
4. Executar `qa-prod-bootstrap.cjs --dry-run`.
5. Revisar a saída sanitizada; somente então usar `--apply` com a confirmação
   literal `QA-PROD-CANONICAL-V1-APPLY`.
6. Usar as credenciais somente no browser QA autorizado.
7. Encerrar com `qa-prod-revoke.cjs`, confirmação
   `QA-PROD-CANONICAL-V1-REVOKE` e o bundle de credenciais correspondente.
8. Confirmar estado `REVOKED`, arquivo/manifesto removidos e zero provider,
   outbox, webhook pendente, convite, reset, automação ou lease ativo.

## Gate do operador de plataforma no staging

O bootstrap QA não usa um ADMIN comum. Primeiro publique o candidato e gere
um atestado externo fresco para o staging. Depois execute o operador reservado
em modo somente leitura:

```cmd
node backend\\scripts\\qa-staging-platform-operator.cjs --status --expected-release=<sha> --run-id=<qa-platform-run-id> --attestation-file=<arquivo>
```

O estado inicial esperado é `ABSENT_SAFE`. O apply exige confirmação literal,
gera o hash bcrypt em memória e nunca imprime a senha:

```cmd
node backend\\scripts\\qa-staging-platform-operator.cjs --apply --expected-release=<sha> --run-id=<qa-platform-run-id> --attestation-file=<arquivo> --confirm=QA-PLATFORM-STAGING-OPERATOR-APPLY
```

Configure `PLATFORM_ADMIN_EMAILS` exclusivamente no ambiente de staging com
`qa-platform-operator-staging@example.invalid`, faça o redeploy controlado da
API para reler a variável e repita `--status`. O gate só passa quando retornar
`READY`, com usuário ativo, e-mail globalmente único, allowlist exata e zero
dados comerciais/providers no tenant reservado. Qualquer outra identidade na
allowlist, colisão de slug/e-mail ou divergência de target é hard stop.

Ao final da janela QA, revogue o operador; a operação é idempotente e preserva
auditoria:

```cmd
node backend\\scripts\\qa-staging-platform-operator.cjs --revoke --expected-release=<sha> --run-id=<qa-platform-run-id> --attestation-file=<arquivo> --confirm=QA-PLATFORM-STAGING-OPERATOR-REVOKE
```

O estado pós-revoke deve ser `REVOKED`, com sessões/tokens inexistentes ou
revogados. O endereço permanece reservado para reuso futuro, mas não fica em
`PLATFORM_ADMIN_EMAILS` fora da janela controlada.

## Atestado externo

O arquivo JSON é criado por um verificador separado do bootstrap. O campo
`signature` é HMAC-SHA256 do JSON canônico formado pelas demais chaves em ordem
lexicográfica, usando um segredo externo não registrado em Git/logs. O arquivo
deve conter, no mínimo:

```text
version=qa-prod-control-plane-attestation.v1
attestationType=RAILWAY_CONTROL_PLANE_AND_DATABASE_READONLY
issuedBy=<verificador externo>
controlPlaneEvidenceRef=<referência sanitizada>
attestedAt=<timestamp recente>
runId=<qa-run-id>
environment=staging|production
projectId, environmentId, apiServiceId, workerServiceId, databaseServiceId
releaseHead, baseProductionReleaseHead
databaseUrlSha256, databaseIdentityServiceId, databaseIdentityDatabaseName
harnessReleaseHead, harnessGitTree, sourceManifestSha256
apiStatus, workerStatus, databaseStatus
```

Em produção, o atestado também inclui `prewriteBackupSha256`,
`prewriteBackupRunId`, `prewriteBackupTargetDatabaseServiceId`,
`prewriteRestoreVerified=true` e `prewriteRestoreEvidenceRef`. O bootstrap
confere esses campos contra as variáveis de preflight antes de adquirir o
lease PostgreSQL.

## Identidade de fonte

O manifesto do harness é calculado no runtime a partir dos cinco arquivos
causais versionados. Se `.git` existir, `HEAD` e `HEAD^{tree}` são derivados
localmente e precisam coincidir com o atestado. Em uma imagem sem `.git`, a
imagem deve conter `qa-harness-build-manifest.json` assinado pelo mesmo
segredo, com `releaseHead`, `gitTree`, `sourceManifestSha256` e
`version=qa-prod-build-manifest.v1`.

## Falhas e recuperação

- Qualquer divergência de alvo, atestado, assinatura, source, backup, schema ou
  operador é `HARD_STOP` antes de escrita.
- O lease distribuído usa `WorkerCheckpoint` com owner nonce e TTL de 15 min;
  o lock local é apenas uma barreira adicional.
- Sinal recebido remove o bundle secreto, mantém o lock até o Prisma terminar e
  retorna código não zero; o próximo passo é status/revoke, nunca um novo apply
  concorrente. Se o bundle for removido antes da transação terminar, o revoke
  emergencial pode recuperar a quarentena sem senha, usando o `runId` original
  quando conhecido (ou um novo identificador de operação), atestado externo
  novo e confirmação distinta:

```cmd
node backend\\scripts\\qa-prod-revoke.cjs --emergency --target=production --run-id=<novo-run-qa> --operator-user-id=<id> --expected-release=<sha> --attestation-file=<arquivo-fora-do-repo> --confirm=QA-PROD-CANONICAL-V1-EMERGENCY-REVOKE
```

  O modo emergencial não aceita senha nem rota pública; ele executa a mesma
  quarentena transacional, varre todos os bundles QA do alvo e só encerra após
  remover/verificar todos, além da verificação final `REVOKED`/`ABSENT_SAFE`.
- `READY` repetido é no-op: não troca hashes, sessões nem auditorias.
- O revoke é transacional e preserva vendas/histórico append-only. Tenant,
  usuários e capabilities ficam inativos para a próxima missão.

## Comandos (somente após preflight)

```text
node backend/scripts/qa-prod-status.cjs --target=staging --expected-release=<sha> --run-id=<qa-run-id> --attestation-file=<arquivo>
node backend/scripts/qa-prod-bootstrap.cjs --dry-run --target=staging --expected-release=<sha> --run-id=<qa-run-id> --attestation-file=<arquivo>
node backend/scripts/qa-prod-bootstrap.cjs --apply --target=staging --expected-release=<sha> --run-id=<qa-run-id> --operator-user-id=<id> --attestation-file=<arquivo> --confirm=QA-PROD-CANONICAL-V1-APPLY
node backend/scripts/qa-prod-revoke.cjs --target=staging --expected-release=<sha> --run-id=<qa-run-id> --operator-user-id=<id> --attestation-file=<arquivo> --credentials-file=<temp>/credentials.json --confirm=QA-PROD-CANONICAL-V1-REVOKE
```

Os mesmos comandos de produção exigem, além do atestado, os campos de
backup/restore e uma janela explicitamente autorizada. Nenhum comando deste
runbook deve apontar para `crm-agro-demo-api`, staging quando o alvo é
produção, ou qualquer PostgreSQL diferente do ID oficial.
