# Gestão de Usuários e Segurança

## Escopo entregue

O fluxo ativo permanece no backend Express em `backend/src`. O login existente continua usando JWT de acesso curto, agora com `sid` vinculado a uma sessão persistida. O refresh é um token aleatório, opaco e rotacionado a cada uso; somente o hash é armazenado em `SessaoRefreshToken`.

Operações administrativas são tenant-scoped e protegidas por `ADMIN`. A conta não pode remover o último ADMIN ativo nem desativar a própria conta. A criação real de usuário ocorre por convite: o administrador informa identidade e papel, e o convidado define a própria senha.

## Rotas principais

- `POST /auth/login`
- `GET /auth/me`
- `POST /auth/refresh`
- `POST /auth/logout`
- `POST /auth/logout-all`
- `GET /auth/sessions`
- `POST /auth/sessions/:id/revoke`
- `GET /perfil`
- `PATCH /perfil`
- `POST /auth/change-password`
- `POST /auth/forgot-password`
- `POST /auth/reset-password`
- `POST /auth/accept-invite`
- `GET /usuarios`
- `GET /seguranca/auditoria`
- `POST /usuarios`
- `PATCH /usuarios/:id`
- `POST /usuarios/:id/desativar`
- `POST /usuarios/:id/reativar`
- `POST /usuarios/:id/iniciar-reset-senha`
- `GET /usuarios/:id/sessoes`
- `POST /usuarios/:id/revogar-sessoes`
- `GET /usuarios/convites`
- `POST /usuarios/convites/:id/reenvia`
- `POST /usuarios/convites/:id/revoga`

As respostas públicas de recuperação não revelam se o e-mail existe. Tokens de recuperação e convite são de uso único, expiram e são persistidos somente por hash.

## Entrega de segurança

Não há SMTP, Gmail, Microsoft Graph ou outro provedor externo nesta fase. Em `NODE_ENV=test`, o capturador é injetado em memória pelos testes. Fora desse ambiente, a entrega fica `PENDING_DELIVERY`; o sistema não afirma que um e-mail foi enviado e não imprime o token.

O próximo adapter de entrega deve receber apenas o token efêmero em memória, nunca um hash ou segredo persistido. A configuração do provedor deve ser adicionada em uma fase separada, com secret manager e smoke sem conteúdo sensível.

O refresh exige uma origem ou referer compatível com a allowlist de origens do backend quando esses headers estiverem presentes. Isso funciona como proteção CSRF de defesa em profundidade para o cookie HttpOnly, sem introduzir autenticação por cookie nesta fase. E-mails reservados de operadores de plataforma não podem ser usados em convites ou fixtures de usuário.

## Sessões

- access token JWT: padrão de 15 minutos, configurável somente pela configuração oficial;
- refresh token: cookie HttpOnly, Secure em produção, SameSite coerente com o CORS e validade padrão de 30 dias;
- rotação: o token anterior é marcado como usado antes do próximo ser criado;
- replay: reutilização revoga a família da sessão;
- logout: revoga a sessão atual;
- sair de todos: revoga as sessões do usuário;
- troca, recuperação ou reset de senha: revoga as demais sessões;
- usuário ou empresa inativos não recebem novo access token por refresh.
- a desativação do usuário revoga sessões e refresh tokens na mesma transação da mudança de estado;
- a criação de sessão confirma novamente que usuário e empresa continuam ativos, evitando emitir sessão após uma desativação concorrente.

O access token ainda é mantido no `localStorage` pelo contrato frontend existente. Isso preserva compatibilidade, mas mantém risco residual de exposição em caso de XSS. O refresh não é armazenado no `localStorage`.

## Migration e isolamento

A migration `20260801150000_add_user_security_foundation` é aditiva. Ela adiciona sessões, tokens, convites e auditoria de segurança com relações compostas tenant-safe. O gate multi-tenant reconhece 87 relações e deve passar nos modos `architecture`, `pre-migration` e `post-migration` antes de qualquer aplicação oficial.

Não há backfill, remoção, rename destrutivo ou alteração de dados existentes. O SQLite de desenvolvimento permanece protegido; a validação PostgreSQL deve usar somente o runner descartável oficial quando houver uma instância de teste disponível.

## Auditoria

São registrados eventos de login, logout, refresh, revogação, alteração de senha, recuperação, reset, convite, alteração de usuário e tentativas relevantes de lockout. O registro contém ator, alvo, tenant, ação, resultado, correlationId, motivo sanitizado e timestamp.

Nunca registrar senha, hash de senha, token, hash de token, Authorization, cookie, payload integral ou IP bruto.

## Rollout seguro

1. validar Prisma, migration e gate multi-tenant em SQLite temporário;
2. validar fluxos focais de login, sessão, convite, senha e isolamento;
3. validar a migration e os casos de concorrência no PostgreSQL descartável, se a infraestrutura oficial estiver disponível;
4. publicar commits separados por backend, frontend, testes e documentação;
5. aplicar migration somente pelo pipeline oficial;
6. observar API, worker e frontend sem mutation manual em produção;
7. configurar entrega externa somente depois da aprovação operacional.

## Rollback operacional

- se build ou gate falhar antes da migration, interromper a release sem alterar o banco;
- se a migration falhar, o startup permanece fechado e o artefato anterior continua sendo a referência de rollback;
- se API ou worker falharem depois da migration, redeployar o artefato anterior pelo pipeline oficial;
- a migration é somente aditiva, portanto o código anterior ignora as novas tabelas e colunas;
- não remover tabelas, não executar downgrade SQL, não marcar migration manualmente e não restaurar banco sem um procedimento separado e autorizado.

## Limitações atuais

- não há entrega real de convite ou recuperação;
- rate limit é local ao processo e não distribuído entre réplicas;
- o access token continua no `localStorage` por compatibilidade;
- logout server-side depende do access token ainda válido para revogar a sessão atual;
- sessões antigas emitidas antes da migration permanecem aceitas como JWT legado até expirarem, sem refresh associado;
- não há histórico de senhas para impedir reutilização imediata; essa política depende de uma decisão e modelo próprios;
- o fluxo público de recuperação permanece genericamente indistinguível, mas a resolução de identidade continua limitada ao contrato atual quando o mesmo e-mail aparece em mais de um tenant.
