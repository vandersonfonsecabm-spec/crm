# Runbook futuro de ativacao de E-mail inbound

## Objetivo

Conectar uma caixa real somente depois de escolher um provider e implementar seu adaptador. Este runbook nao contem valores reais e nao autoriza outbound.

## Responsabilidades

### Acao humana

1. Escolher Gmail API, Microsoft Graph ou IMAP com base em seguranca, operacao e SLA.
2. Criar uma conta/aplicacao dedicada no provider.
3. Conceder apenas permissao de leitura da caixa necessaria.
4. Informar o endereco primario e aliases autorizados.
5. Aprovar janela, tenant piloto e plano de rollback.

### Acao do sistema

1. Implementar o adapter que normalize mensagens no contrato interno.
2. Resolver credenciais somente no backend e apenas em memoria.
3. Provar leitura, cursor/ack, retry e renovacao sem duplicidade.
4. Provisionar a caixa pela rota platform-only, ainda inativa.
5. Consultar `/status` e validar identidade mascarada.
6. Ativar com `reason` e `expectedUpdatedAt`.
7. Receber um E-mail textual controlado.
8. Confirmar Inbox, Cliente 360, timestamps, replay e isolamento.

## Dados secretos

Dependem do provider futuro e nunca devem entrar em payload, frontend, Git, logs ou documentacao. Exemplos possiveis: OAuth client secret, refresh token, senha de aplicativo ou segredo de webhook.

## Dados nao secretos

- tipo do provider;
- ambiente;
- endereco primario;
- aliases;
- nome de exibicao mascarado;
- identificador de conta mascarado.

## Validacao minima do adapter

- autenticacao e renovacao fechadas em falha;
- escopo somente leitura;
- cursor incremental duravel;
- redelivery idempotente;
- `Message-ID` ausente coberto preferencialmente por identificador imutavel do provider e, na ausencia dos dois, pelo fallback documentado de envelope normalizado;
- threading por referencias, sem agrupamento por assunto;
- MIME e anexos dentro dos limites;
- auto-reply e bounce terminais;
- nenhuma resposta ou envio;
- segredos removidos da memoria ao encerrar o processo.

## Sequencia do piloto

1. Registrar contagens e estado anterior do tenant.
2. Provisionar o endereco comprovado, sem ativar capabilities automaticamente.
3. Ativar gates do provider somente para a janela aprovada.
4. Executar `activate` platform-only.
5. Confirmar `WAITING_PROVIDER_AUTH` e timestamps nulos.
6. Autorizar o adapter no provider.
7. Enviar um texto externo para a caixa piloto.
8. Confirmar evento `PROCESSADO`, contato, Cliente, Lead, conversa e mensagem.
9. Confirmar `lastWebhookAt`, `verifiedAt` e `connectedAt`.
10. Reentregar o mesmo evento e confirmar delta zero.
11. Observar logs, banco e outros tenants por dois ciclos objetivos.

## Rollback

1. Executar `pause` imediatamente diante de divergencia.
2. Confirmar canal inativo e `EMAIL_INBOUND=false`.
3. Revogar a credencial no provider, quando aplicavel.
4. Preservar eventos e evidencias; nao apagar dados para mascarar falha.
5. Manter `EMAIL_INTEGRATION` somente se o contrato operacional exigir.

## Criterios para manter ativo

- tenant e caixa resolvidos unicamente;
- zero duplicacao;
- zero telefone inventado;
- Inbox e Cliente 360 coerentes;
- nenhum HTML inseguro;
- nenhum binario persistido;
- zero outbound;
- retries/cursor do adapter observaveis e recuperaveis;
- rollback por pausa comprovado.
