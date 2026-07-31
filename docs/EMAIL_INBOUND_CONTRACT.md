# Contrato de E-mail inbound

## Escopo

Esta fundacao recebe E-mail somente por adaptadores internos. Ela nao expoe webhook, polling, IMAP, SMTP, OAuth, API de provider nem envio de mensagens. O transporte real permanece desligado ate uma fase futura com provider autorizado.

## Identidade e isolamento

- Tipo do canal: `EMAIL`.
- Chave do canal real: `email-inbound-real`.
- Capabilities: `EMAIL_INTEGRATION` e `EMAIL_INBOUND`.
- Identidade canonica da caixa: local-part preservado, dominio convertido para IDNA ASCII e lowercase, com validacao integral de hostname.
- Aliases usam o mesmo namespace global da identidade primaria.
- Nao sao aplicadas regras especificas de Gmail para pontos ou `+tag`.
- Cada endereco e criado pelo servico no mesmo tenant do canal; o intake tambem rejeita qualquer relacao interna inconsistente.
- O remetente usa o endereco normalizado como `ContatoCanal.externalId`, sempre scoped pelo canal; telefone permanece nulo.
- `providerAccountId` e apenas metadata mascarada e nao participa de roteamento ou unicidade.

## Provider adapter

O contrato `createEmailProviderAdapter` oferece:

- `validateConfiguration`: valida o tipo de provider configurado;
- `normalizeMailboxIdentity`: normaliza a identidade da caixa;
- `normalizeInboundMessage`: converte MIME bruto em envelope interno deterministico;
- `acknowledge`: explicitamente indisponivel ate existir transporte real.

O core atual aceita somente `GENERIC`. Adaptadores futuros podem traduzir Gmail API, Microsoft Graph ou IMAP para o mesmo envelope, sem alterar o pipeline comercial.

## MIME e seguranca

- Parser: `mailparser@3.9.14`.
- Sanitizacao HTML: `sanitize-html@2.17.6`.
- Runtime: Node.js `>=22.12.0`.
- O MIME bruto nunca e persistido.
- HTML sanitizado e armazenado como metadata, mas a Inbox renderiza apenas texto.
- Anexos persistem somente nome, MIME type, disposition, content ID e tamanho; nenhum binario e salvo ou baixado.
- Limites iniciais: 10 MiB de raw, 64 KiB/200 linhas de headers, 100 destinatarios, 20 anexos, 50 partes MIME, 10 containers multipart e 512 KiB para texto ou HTML normalizado.
- Headers singleton ambiguos sao rejeitados antes do parser completo.
- O roteamento usa a caixa do envelope entregue pelo adapter confiavel; `To`, `Cc` e `Bcc` sao apenas metadata e BCC legitimo nao e rejeitado.
- `Message-ID`, IDs de provider e referencias sao tratados como strings opacas limitadas.
- BCC persiste apenas a quantidade, nunca a lista completa.

## Idempotencia e threading

- A chave de evento deriva da caixa e, nesta ordem, `providerMessageId`, `Message-ID` ou hash SHA-256 do envelope normalizado. O fallback inclui remetente, destinatarios, assunto, data declarada, corpos sanitizados e metadata/hash efemero dos anexos; o horario local de recebimento nao participa, para preservar replay.
- O fallback sem identificador pode colapsar duas entregas realmente distintas quando todo o envelope normalizado for identico; providers reais devem fornecer um ID imutavel sempre que possivel.
- Replay identico retorna idempotente e nao duplica entidades.
- Replay com a mesma identidade e conteudo divergente falha fechado.
- Threading usa `providerThreadId`, depois mensagens conhecidas por `In-Reply-To`/`References`, e por fim uma chave deterministica nova.
- Assunto isolado nunca une conversas.
- Uma thread nao pode trocar de remetente silenciosamente.
- Conversas encerradas podem ser reabertas pela mesma thread preservada.

## Pipeline comercial

Uma mensagem textual valida cria ou reutiliza, no tenant resolvido pela caixa:

1. `EventoWebhook` duravel;
2. `ContatoCanal` sem telefone inventado;
3. `Cliente` com E-mail;
4. `Lead` com origem `EMAIL`;
5. `ConversaCanal` com `emailThreadKey` e assunto;
6. `MensagemCanal` de entrada;
7. `EmailMessageMetadata` 1:1.

`lastWebhookAt` e atualizado no intake duravel. `verifiedAt` e `connectedAt` so sao preenchidos quando o primeiro texto termina `PROCESSADO`. Auto-reply, bounce e mensagem apenas com anexo sao terminais e nao criam cadeia comercial.

## Lifecycle

Rotas platform-only:

- `PUT /platform/tenants/:tenantId/integrations/email/inbound`
- `GET /platform/tenants/:tenantId/integrations/email/inbound/status`
- `POST /platform/tenants/:tenantId/integrations/email/inbound/activate`
- `POST /platform/tenants/:tenantId/integrations/email/inbound/pause`
- `POST /platform/tenants/:tenantId/integrations/email/inbound/reactivate`

Provisionamento cria o canal inativo e sem capability. Activate/pause/reactivate usam `expectedUpdatedAt`, `reason`, transacao e auditoria funcional. Nenhuma acao chama provider externo.

Estados derivados: `NOT_CONFIGURED`, `CONFIGURED_INACTIVE`, `WAITING_PROVIDER_AUTH`, `CONNECTED`, `PAUSED`, `ERROR` e `UNAVAILABLE`.

## Gates

- `EMAIL_INTEGRATION_ENABLED`
- `EMAIL_INBOUND_ENABLED`
- `EMAIL_PROVIDER_TYPE`
- `EMAIL_PROVIDER_ENVIRONMENT`

Os gates permanecem OFF por ausencia em producao. Nao existem credenciais nesta fundacao.

## Simulador

`emailTestSimulator.js` e um helper importavel, sem rota. Ele exige `NODE_ENV=test|development`, flag explicita, identidades `@example.test` e segredo efemero em memoria para IDs deterministas da sessao. Em `production`, falha como inexistente.

## Fora de escopo

- credenciais e secret resolver;
- polling, webhook de provider, IMAP IDLE ou ack remoto;
- retries duraveis e fila assincrona;
- download/antivirus de anexos;
- HTML ativo na interface;
- resposta, SMTP ou qualquer outbound.
