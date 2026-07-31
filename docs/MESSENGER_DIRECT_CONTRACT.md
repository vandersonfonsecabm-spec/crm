# Contrato do Facebook Messenger inbound

## Escopo

O Messenger e um canal independente de WhatsApp, Instagram e SITE_FORM. Esta fase cobre somente inbound textual, eventos terminais nao textuais, provisionamento platform-only, lifecycle, Inbox e Cliente 360.

Ficam fora do contrato:

- Graph API ativa;
- OAuth;
- envio de mensagens;
- Page Access Token funcional;
- `accessTokenRef` funcional;
- download de anexos;
- Meta real.

## Identidade

- tipo: `MESSENGER_META`;
- slot real por tenant: `messenger-meta-inbound-real`;
- identidade canonica do canal: Page ID em `messengerPageId`;
- metadata opcional mascarada: `messengerPageNameMasked`;
- identidade do remetente: PSID em `ContatoCanal.externalId`;
- PSID e sempre interpretado dentro do canal e do tenant resolvidos pelo Page ID;
- App ID e `providerEnvironment` sao configuracao global do backend, nao identidade de roteamento.

`messengerPageId` e globalmente unico. A unique `[empresaId, chaveInterna]` garante um slot real por tenant. Canais de teste usam chave distinta e nunca sao promovidos automaticamente.

## Capabilities e gates

Capabilities:

- `MESSENGER_INTEGRATION`;
- `MESSENGER_INBOUND`.

Gates globais:

- `MESSENGER_INTEGRATION_ENABLED`;
- `MESSENGER_INBOUND_ENABLED`;
- `MESSENGER_META_APP_ID`;
- `MESSENGER_PROVIDER_ENVIRONMENT`;
- `MESSENGER_APP_SECRET`;
- `MESSENGER_WEBHOOK_VERIFY_TOKEN`.

Gates ausentes ou desligados tornam o webhook indisponivel antes de parser, intake ou banco. Ativacao local exige a configuracao global completa, mas nao chama a Meta.

## Provisionamento e lifecycle

Rotas platform-only:

- `PUT /platform/tenants/:tenantId/integrations/messenger/inbound`;
- `GET /platform/tenants/:tenantId/integrations/messenger/inbound/status`;
- `POST .../activate`;
- `POST .../pause`;
- `POST .../reactivate`.

Provisionamento cria o canal `INATIVO`, sem capabilities e sem timestamps operacionais. Page ID e imutavel. Metadata mutavel usa `reason`, `expectedUpdatedAt` e compare-and-set. Replay exato retorna `changed=false`.

Lifecycle usa transacao para canal, capabilities e `AuditoriaFuncionalidade`. Ativacao produz `WAITING_META_AUTH`; pausa preserva identidade e timestamps; reativacao retorna `WAITING_META_AUTH` ou `CONNECTED`.

Estados derivados:

- `NOT_CONFIGURED`;
- `CONFIGURED_INACTIVE`;
- `WAITING_META_AUTH`;
- `CONNECTED`;
- `PAUSED`;
- `ERROR`;
- `UNAVAILABLE`.

## Webhook

Rotas:

- `GET /webhooks/messenger`;
- `POST /webhooks/messenger`.

O challenge GET e global e stateless. O POST exige:

- `Content-Type: application/json`;
- `Content-Encoding` ausente ou um unico `identity`;
- raw body preservado;
- `X-Hub-Signature-256`;
- HMAC SHA-256 com App Secret global;
- comparacao segura;
- body de ate 1 MiB.

Limites internos iniciais:

- ate 3 entries por request;
- ate 5 eventos por entry;
- ate 10 eventos no total.

Esses limites sao guardrails internos e devem ser reavaliados com payloads reais antes do primeiro piloto Meta.

## Lotes e roteamento

O envelope aceito usa `object=page`, `entry[].id` como Page ID e `entry[].messaging[]`.

Todos os eventos processaveis de um request devem ter o mesmo Page ID. Page IDs diferentes rejeitam o request inteiro antes de qualquer escrita. Nao existe fallback para a primeira entry nem roteamento pelo PSID.

Dentro de um unico Page ID:

- eventos sao deduplicados por identidade externa;
- replay equivalente e idempotente;
- colisao com payload diferente falha fechada;
- falha tardia nao sobrescreve sucesso confirmado.

## Pipeline comercial

Texto inbound valido cria ou reutiliza no tenant resolvido:

- `EventoWebhook`;
- `ContatoCanal`, com PSID e sem telefone ficticio;
- `Cliente`;
- `Lead` com origem `MESSENGER`;
- `ConversaCanal`;
- `MensagemCanal` de entrada;
- Inbox;
- timeline e resumo do Cliente 360.

O canal Messenger nao e respondivel diretamente. Echo e ignorado. Attachment e terminal nao suportado, sem download. Evento desconhecido valido e terminal ignorado. Nenhum desses eventos cria texto artificial ou marca o canal como conectado.

## Timestamps e falhas

- `lastWebhookAt`: apos intake duravel;
- `verifiedAt` e `connectedAt`: somente apos o primeiro texto `PROCESSADO`;
- replay nao duplica entidades nem altera os timestamps de conexao;
- falha pos-mapeamento grava somente codigo sanitizado;
- pausa concorrente nao vira falha operacional;
- rollback comercial ocorre na transacao do processador.

## Seguranca de writers

Writers genericos bloqueiam todo canal `MESSENGER_META` real. A Inbox usa allowlist de canais com resposta implementada; Messenger permanece somente leitura. Fixtures de teste continuam isoladas.

## Compatibilidade

Messenger usa campos, tipo, capabilities e chave proprios. Nao reutiliza WABA, Phone Number ID, Instagram Business Account ID ou `configuracaoJson` como identidade. WhatsApp, Instagram e SITE_FORM coexistem sem alteracao semantica.
