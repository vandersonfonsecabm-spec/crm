# H8R3 — Descoberta do mecanismo de ativação do canário

Data: 2026-08-16

## Evidência por camada

### Backend/API

1. `backend/src/notifications/service.js:23-38` lê `H8_NOTIFICATIONS_ENABLED` como gate global e, em `assertEnabled(empresaId)`, exige a linha exata de `ConfiguracaoNotificacaoEmpresa` com `habilitada=true`.
2. `backend/src/notifications/service.js:150-185` (`processDue`) exige os gates globais e consulta somente configurações `habilitada=true`, ordenadas por `empresaId`, com cursor. A elegibilidade do worker é portanto tenant-scoped.
3. `backend/src/notifications/routes.js` expõe settings apenas por rotas autenticadas. O PATCH de configuração chama `updateSettings`, exige papel de gestor (`ADMIN`/`GERENTE`) e faz upsert somente para `context.empresaId`.
4. O frontend usa a mesma rota e apresenta “Central habilitada para a empresa”; quando o tenant está desabilitado, não mostra dados da Central.

### Schema/banco

`ConfiguracaoNotificacaoEmpresa` possui `empresaId @unique`, FK para `Empresa` e `habilitada Boolean @default(false)`. A leitura oficial confirmou duas empresas e zero linhas de configuração, portanto nenhum tenant está habilitado. Não foi criada tabela paralela nem schema novo.

### Worker/H7

`backend/src/automations/worker.js` mantém `AUTOMATION_WORKER_ENABLED` separado de `NOTIFICATIONS_WORKER_ENABLED`. O worker H8 só entra no ciclo quando o flag próprio está ativo e o serviço filtra configurações H8 habilitadas. A investigação não encontrou necessidade de ligar ou alterar o worker H7.

### Feature/capability existente

`EmpresaFuncionalidade`/`ChaveFuncionalidade` não possuem uma chave H8 de notificações. O mecanismo existente de capability é, portanto, não aplicável à ativação H8; não foi ampliado nem duplicado.

### Runtime

Os dois flags H8 estão ausentes/desligados nos serviços oficiais. Não foi encontrado mecanismo de preview/rollout adicional que substitua a configuração tenant-scoped. O mecanismo oficial disponível para a próxima etapa é alteração operacional de variáveis, seguida da habilitação da configuração no tenant QA pela UI/API autenticada.

## Matriz de candidatos

| Mecanismo | Escopo | Tenant-aware | Default off | Worker-aware | QA-only possível | Rollback lógico | Conclusão |
|---|---|---:|---:|---:|---:|---:|---|
| `H8_NOTIFICATIONS_ENABLED` | API global | NÃO | SIM (ausente) | NÃO | NÃO | SIM, desligar | insuficiente sozinho |
| `NOTIFICATIONS_WORKER_ENABLED` | processo worker | NÃO | SIM (ausente) | SIM | NÃO | SIM, desligar | insuficiente sozinho |
| `ConfiguracaoNotificacaoEmpresa.habilitada` | empresa/tenant | SIM | SIM (`false`) | SIM, via `processDue` | SIM | SIM, `false` | gate efetivo |
| `EmpresaFuncionalidade`/AUTOMATIONS | capability H7 | não para H8 | variável | H7 | não | sim | não aplicável à H8 |

## Classificação

`CANARY_ACTIVATION_DISCOVERY=PASS`

`CANARY_ACTIVATION_MECHANISM=EXISTING_SAFE`

A classificação refere-se à combinação explícita dos dois flags operacionais (que apenas disponibilizam o código) com a linha tenant-scoped `ConfiguracaoNotificacaoEmpresa.habilitada` (que decide elegibilidade). A flag global isolada não satisfaz o requisito. A prova de segurança operacional ainda depende de executar a ativação controlada e confirmar no runtime que somente o tenant QA tem a linha habilitada.

## Limitações honestas

- O modelo não registra um ator humano dedicado para cada alteração de settings; a alteração é limitada por autenticação/papel, tenant FK e `updatedAt`. Isso é uma limitação de auditoria detalhada, não motivo para criar outro mecanismo de ativação nesta fase.
- A descoberta não habilitou flags, tenant ou worker. `CANARY_RUNTIME_ACTIVATION` continua pendente da revisão Sol e da mutation controlada.

## Plano operacional proposto (ainda não executado)

1. Sol revisar esta descoberta e o rollback.
2. Habilitar `H8_NOTIFICATIONS_ENABLED=true` somente na API oficial (config-only operational restart/deploy, source inalterado).
3. Na sessão QA autenticada, salvar settings com `habilitada=true` para a empresa QA; confirmar que nenhum outro tenant ganhou linha habilitada.
4. Habilitar `H8_NOTIFICATIONS_ENABLED=true` e `NOTIFICATIONS_WORKER_ENABLED=true` somente no serviço worker oficial; não tocar `AUTOMATION_WORKER_ENABLED`.
5. Revalidar health, SHA, contagem de tenants elegíveis, uma réplica/escopo e ausência de outbound antes dos fluxos canário.
6. Rollback: desabilitar a empresa QA, desligar `NOTIFICATIONS_WORKER_ENABLED`, desligar `H8_NOTIFICATIONS_ENABLED`; não executar down migration.
