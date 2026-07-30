# Ativacao futura do WhatsApp Meta inbound

Este runbook começa quando existir uma empresa piloto real, uma conta Meta autorizada e uma identidade WhatsApp comprovada. Ele não cobre envio outbound, templates, mídia ou rotação de access token.

## Responsabilidades e dados

### Dados secretos

- `WHATSAPP_APP_SECRET`: App Secret do App Meta.
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN`: valor aleatório definido pelo operador para a verificação do callback.

Esses valores ficam somente no gerenciador de variáveis do backend. Não devem entrar no banco, frontend, tickets, logs ou respostas HTTP.

### Dados não secretos

- `WHATSAPP_META_APP_ID`: App ID do App Meta global usado pelo backend.
- `WHATSAPP_PROVIDER_ENVIRONMENT`: ambiente global aceito pelo backend.
- WABA ID do tenant piloto.
- Phone Number ID do tenant piloto.
- nome do canal, nome verificado e telefone mascarado.
- callback público HTTPS terminado em `/webhooks/whatsapp`.

WABA ID e Phone Number ID devem ser copiados como strings opacas. Não converter para número, remover zeros ou reutilizar dados de outro tenant.

### Ações humanas

- criar ou selecionar o App Meta;
- adicionar o produto WhatsApp;
- obter e conferir os identificadores;
- cadastrar os secrets no backend;
- configurar e validar o callback na Meta;
- enviar a primeira mensagem inbound a partir de um número autorizado;
- decidir se o piloto permanece ativo.

### Ações do sistema

- provisionar um canal real, inativo e sem capabilities;
- validar configuração global e identidade;
- ativar capabilities e canal por operação platform-only;
- validar HMAC, mapear o tenant e persistir o evento;
- criar a cadeia comercial apenas para texto;
- atualizar timestamps operacionais;
- deduplicar reentregas;
- pausar sem apagar identidade nem evidências.

## Procedimento

1. **Selecionar o App Meta**
   - Use um único App Meta compatível com a configuração global do backend.
   - Confirme acesso administrativo e o produto WhatsApp habilitado.
   - Evidência: App ID conferido por duas fontes autorizadas.

2. **Obter App ID e App Secret**
   - Cadastre o App ID em `WHATSAPP_META_APP_ID`.
   - Cadastre o App Secret em `WHATSAPP_APP_SECRET`.
   - Não copie o App Secret para arquivos locais.
   - Evidência: presença das variáveis, sem exibir valores.

3. **Definir o Verify Token**
   - Gere um valor forte e exclusivo.
   - Cadastre-o em `WHATSAPP_WEBHOOK_VERIFY_TOKEN` e no callback Meta.
   - Evidência: challenge GET aprovado sem mutação no banco.

4. **Obter a identidade do número**
   - Registre WABA ID e Phone Number ID como strings.
   - Confirme que ambos pertencem ao mesmo tenant e ao App global esperado.
   - Registre somente o telefone mascarado em evidências operacionais.

5. **Habilitar os gates globais**
   - `WHATSAPP_INTEGRATION_ENABLED=true`.
   - `WHATSAPP_INBOUND_ENABLED=true`.
   - Mantenha outbound desabilitado.
   - Evidência: status global pronto sem revelar secrets.

6. **Configurar o callback**
   - Use a URL HTTPS pública do backend com `/webhooks/whatsapp`.
   - Assine o campo `messages`.
   - Não habilite ações outbound, templates ou download de mídia.
   - Evidência: challenge GET aprovado e zero escrita tenant-scoped.

7. **Provisionar o tenant**
   - Use `PUT /platform/tenants/:tenantId/integrations/whatsapp/inbound`.
   - Informe somente metadata allowlisted, WABA ID e Phone Number ID.
   - Use `reason` operacional sem PII ou credencial.
   - Repita o PUT para provar idempotência.
   - Evidência: um canal real, `INATIVO`, sem capabilities e estado `CONFIGURED_INACTIVE`.

8. **Conferir o status**
   - Use `GET /platform/tenants/:tenantId/integrations/whatsapp/inbound/status`.
   - Confirme identidade presente, configuração global válida e timestamps nulos.
   - Evidência: nenhum ID completo ou secret na resposta.

9. **Ativar**
   - Use `POST .../activate` com `reason` e `expectedUpdatedAt`.
   - Confirme canal `ATIVO`, capability pai e capability inbound ativas.
   - Evidência: estado `WAITING_META_AUTH`; `verifiedAt` e `connectedAt` ainda nulos.

10. **Enviar o primeiro texto inbound**
    - Envie uma única mensagem textual de um número autorizado para o número piloto.
    - Não use o CRM para enviar mensagem.
    - Evidência: HMAC válido, evento `PROCESSADO`, Inbox com uma mensagem, conversa e cliente no tenant correto.

11. **Validar timestamps e Customer 360**
    - `lastWebhookAt` deve registrar o recebimento durável.
    - `verifiedAt` e `connectedAt` devem ser preenchidos apenas após o texto processado.
    - Evidência: estado `CONNECTED`, timeline do Customer 360 com a mensagem e nenhum efeito em outro tenant.

12. **Validar replay**
    - Reentregue o mesmo evento somente por mecanismo autorizado.
    - Evidência: um EventoWebhook, uma mensagem, uma conversa e timestamps coerentes.

13. **Decidir pela manutenção do piloto**
    - Mantenha ativo apenas se logs, filas e banco permanecerem saudáveis.
    - Observe ao menos dois ciclos operacionais.

## Eventos não textuais

- status de entrega: terminal e idempotente, sem mensagem inbound;
- mídia: terminal não suportado, sem download e sem mensagem textual artificial;
- tipo desconhecido válido: terminal ignorado;
- payload malformado ou HMAC inválido: rejeitado;
- identidade ausente ou ambígua: falha fechada, sem escrita comercial.

## Rollback

1. Execute `POST .../pause` com `reason` e `expectedUpdatedAt`.
2. Confirme canal `INATIVO` e capability `WHATSAPP_INBOUND=false`.
3. Preserve canal, identidade, EventoWebhook e timestamps como evidência.
4. Confirme ausência de retries, loops e efeitos em outros tenants.
5. Corrija a causa em tarefa separada antes de reativar.

## Critérios para manter ativo

- estado `CONNECTED`;
- canal e capabilities limitados ao tenant piloto;
- HMAC e mapeamento únicos;
- primeiro texto visível na Inbox e Customer 360;
- replay sem duplicação;
- zero outbound e zero Graph API;
- zero PII ou secret nos logs;
- API, worker e PostgreSQL saudáveis;
- rollback por pausa comprovadamente disponível.
