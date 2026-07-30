# Contrato estrutural do Instagram Direct

## Escopo

Esta fundacao e exclusivamente aditiva. Ela permite que a proxima fase
implemente provisionamento, lifecycle e inbound sem reutilizar identidade do
WhatsApp. Esta fase nao cria canal, capability, webhook, simulador, segredo,
chamada Meta ou outbound.

## Identidade canonica

A identidade canonica do canal e `instagramBusinessAccountId`.

O envelope de webhook Instagram identifica a conta profissional destinataria
por esse ID. Por isso:

- `instagramBusinessAccountId` sera obrigatorio no futuro provisionador;
- o valor sera tratado como string opaca, sem conversao numerica;
- o lookup do intake usara esse campo;
- o campo e globalmente unico entre tenants;
- a identidade sera imutavel depois do provisionamento.

`pageId` nao faz parte desta fundacao. Ele nao e necessario para rotear o
webhook da Instagram API com Instagram Login. Uma integracao futura baseada em
Facebook Login pode adiciona-lo como metadata por uma migration separada,
depois de comprovar a necessidade.

Instagram Direct, Messenger e Facebook Page devem usar tipos e identidades
dedicados. Nenhum deles pode reutilizar `WHATSAPP_META`, `wabaId`,
`phoneNumberId` ou `configuracaoJson` como identidade.

## Tipo e capabilities

O tipo adicionado e:

- `INSTAGRAM_META`

As capabilities adicionadas sao:

- `INSTAGRAM_INTEGRATION`
- `INSTAGRAM_INBOUND`

`META_INTEGRATION` nao foi adicionada. Um pai comum exigiria refatorar a arvore
ja publicada do WhatsApp e ampliaria o escopo. As capabilities existentes do
WhatsApp permanecem inalteradas.

## Campos

`CanalIntegracao` recebe:

- `instagramBusinessAccountId String? @unique`
- `instagramUsernameMasked String?`

Os campos sao nullable para preservar todos os canais existentes. A
obrigatoriedade sera aplicada pelo futuro servico platform-only somente para
canal `INSTAGRAM_META` real.

`instagramUsernameMasked` e metadata nao sensivel. Username integral, token,
payload e segredo nao fazem parte do contrato estrutural.

## Constraints

As constraints portateis sao:

1. `instagramBusinessAccountId` possui unique global. A mesma identidade nao
   pode pertencer a tenants diferentes.
2. A unique existente `[empresaId, chaveInterna]` reserva o slot do canal real.
   O futuro provisionador deve usar exclusivamente
   `instagram-meta-inbound-real`.
3. Writers genericos bloqueiam todo canal `INSTAGRAM_META` com
   `modoTeste=false`, independentemente de `chaveInterna`.
4. Canal de teste usa chave distinta e identidade nula ou sintetica exclusiva.
5. Campos Instagram permanecem nulos em `WHATSAPP_META` e `SITE_FORM`.

Esse desenho evita indice parcial e usa o mesmo contrato em SQLite e
PostgreSQL. A garantia de um canal real por tenant resulta da chave canonica
protegida pela unique e do fechamento dos writers alternativos. Qualquer novo
writer devera preservar essas duas invariantes.

## Migrations

SQLite usa:

- `20260730160000_add_instagram_direct_schema_foundation`

PostgreSQL usa migrations versionadas em `backend/prisma-postgres/migrations`:

- `20260728090000_postgres_baseline`, congelada no estado do cutover;
- `20260730160000_add_instagram_direct_schema_foundation`, incremental.

A baseline PostgreSQL nao pode ser regenerada depois de aplicada. Novas
mudancas devem receber migration incremental, preservando o checksum registrado
em `_prisma_migrations`.

As duas colunas sao nullable e a migration nao reescreve dados existentes.
Enums recebem apenas novos valores. O rollback operacional e voltar o codigo e
manter a estrutura aditiva; remover enum, coluna ou indice seria destrutivo e
nao faz parte do rollback.

## Compatibilidade

- WhatsApp continua usando `wabaId` e `phoneNumberId`.
- As uniques e capabilities WhatsApp nao mudam.
- `SITE_FORM` nao muda.
- Inbox, EventoWebhook, ContatoCanal, ConversaCanal, MensagemCanal e Cliente
  360 permanecem estruturalmente reutilizaveis.
- Nenhum fluxo generico passa a criar ou ativar Instagram apenas pela inclusao
  do enum.

## Proximo passo

Implementar o provisionamento platform-only de um canal Instagram real por
tenant, usando a chave canonica, `instagramBusinessAccountId`, configuracao
global server-side, CAS, auditoria e estado inicial inativo. Lifecycle, webhook
e simulador continuam em fases posteriores.
