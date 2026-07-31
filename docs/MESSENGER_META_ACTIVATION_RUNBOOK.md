# Ativacao futura do Facebook Messenger inbound

Este runbook comeca quando existir uma Page real, um App Meta autorizado e um tenant piloto real. Ele nao cobre outbound, OAuth, Graph API ativa ou Page Access Token funcional.

## Dados e responsabilidades

### Secretos

- `MESSENGER_APP_SECRET`;
- `MESSENGER_WEBHOOK_VERIFY_TOKEN`.

Secrets ficam somente no backend. Nunca entram no banco, frontend, tickets, logs ou respostas HTTP.

### Nao secretos

- `MESSENGER_META_APP_ID`;
- `MESSENGER_PROVIDER_ENVIRONMENT`;
- Page ID do tenant;
- nome da Page mascarado;
- callback HTTPS terminado em `/webhooks/messenger`.

Page ID deve ser tratado como string opaca. PSID vem somente de eventos assinados e nunca e usado antes de o Page ID resolver um canal e tenant unicos.

### Acoes humanas

- criar ou selecionar App Meta;
- vincular uma Facebook Page elegivel;
- obter App ID, App Secret e Page ID;
- definir Verify Token;
- configurar callback e subscriptions;
- enviar a primeira mensagem real;
- decidir se o piloto permanece ativo.

### Acoes do sistema

- provisionar canal real inativo;
- validar configuracao global;
- ativar capabilities por operacao platform-only;
- validar HMAC e rotear por Page ID;
- persistir evento e criar a cadeia comercial;
- deduplicar replay;
- pausar sem apagar identidade ou evidencias.

## Procedimento

1. **Preparar App e Page**
   - Confirme ownership e permissao administrativa do App e da Page.
   - Evidencia: App ID e Page ID conferidos por duas fontes autorizadas.

2. **Configurar backend**
   - Cadastre `MESSENGER_META_APP_ID` e `MESSENGER_PROVIDER_ENVIRONMENT`.
   - Cadastre App Secret e Verify Token no gerenciador de secrets.
   - Nunca copie secrets para arquivos locais.

3. **Habilitar gates**
   - `MESSENGER_INTEGRATION_ENABLED=true`.
   - `MESSENGER_INBOUND_ENABLED=true`.
   - Mantenha Graph API e outbound desabilitados.

4. **Configurar callback Meta**
   - Use a URL HTTPS publica com `/webhooks/messenger`.
   - Valide o challenge GET.
   - Configure apenas subscriptions inbound necessarias.
   - Evidencia: challenge aprovado e zero mutacao tenant-scoped.

5. **Provisionar tenant**
   - Use `PUT /platform/tenants/:tenantId/integrations/messenger/inbound`.
   - Informe Page ID, nome e metadata mascarada allowlisted.
   - Use `reason` sem PII ou credencial.
   - Repita o PUT para provar idempotencia.
   - Evidencia: um canal real `INATIVO`, sem capabilities e estado `CONFIGURED_INACTIVE`.

6. **Conferir status**
   - Use `GET .../status`.
   - Confirme identidade presente, configuracao global valida e timestamps nulos.
   - A resposta nao deve conter Page ID completo, token ou secret.

7. **Ativar**
   - Use `POST .../activate` com `reason` e `expectedUpdatedAt`.
   - Confirme canal `ATIVO` e as duas capabilities ativas.
   - Evidencia: `WAITING_META_AUTH`, sem timestamps de conexao.

8. **Enviar primeiro texto**
   - Um usuario autorizado envia uma mensagem externa para a Page piloto.
   - O CRM nao responde.
   - Evidencia: HMAC valido, EventoWebhook `PROCESSADO`, Inbox, conversa, cliente e lead no tenant correto.

9. **Validar Cliente 360 e timestamps**
   - `lastWebhookAt` registra intake duravel.
   - `verifiedAt` e `connectedAt` surgem somente apos texto processado.
   - Evidencia: estado `CONNECTED`, timeline visivel e zero efeito em outro tenant.

10. **Validar replay**
    - Reentregue o mesmo evento somente por mecanismo autorizado.
    - Evidencia: um evento, uma mensagem, uma conversa e uma cadeia comercial.

11. **Observar e decidir**
    - Observe API, worker, PostgreSQL e logs por dois ciclos objetivos.
    - Mantenha ativo somente sem duplicacao, retry orfao, PII ou secret em logs.

## Eventos nao textuais

- echo: terminal ignorado;
- attachment: terminal nao suportado, sem download;
- desconhecido valido: terminal ignorado;
- payload malformado ou HMAC invalido: rejeitado;
- Page ID ausente, ambiguo ou misto: request rejeitado antes de escrita.

## Rollback

1. Execute `POST .../pause` com `reason` e `expectedUpdatedAt`.
2. Confirme canal `INATIVO` e `MESSENGER_INBOUND=false`.
3. Preserve identidade, eventos e timestamps.
4. Confirme zero processamento novo e zero efeito em outros tenants.
5. Corrija a causa em tarefa separada antes de reativar.

## Criterios para manter ativo

- estado `CONNECTED`;
- Page ID mapeado para um unico tenant;
- HMAC valido;
- texto visivel na Inbox e Cliente 360;
- replay sem duplicacao;
- Messenger nao respondivel;
- zero Graph API, outbound ou token funcional;
- zero PII ou secret nos logs;
- API, worker e PostgreSQL saudaveis;
- pausa comprovadamente disponivel.
