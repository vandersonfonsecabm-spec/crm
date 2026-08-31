# ADR — QA Production Harness V1

Status: APPROVED
Data: 2026-08-31

## Decisão

O teste autenticado de escrita, isolamento e imutabilidade da Venda Canônica
usará dois tenants sintéticos permanentes e identidades temporárias
provisionados por ferramenta interna. O caminho é executado fora do HTTP
público, com Prisma e bcryptjs, e não depende de convite/e-mail.

~~~text
QA_PRODUCTION_HARNESS_V1=APPROVED
PROVISIONING_METHOD=INTERNAL_TRANSACTIONAL_QA_BOOTSTRAP
DIRECT_SQL=FORBIDDEN
PUBLIC_HTTP_ENDPOINT=FORBIDDEN
EMAIL_INVITE_DEPENDENCY=REMOVED_FOR_QA_ONLY
GLOBAL_PROVIDER_CHANGES=FORBIDDEN
QA_CANONICAL_FEATURE=NEGOCIOS_KANBAN_ONLY
TARGET_ATTESTATION=EXTERNAL_CONTROL_PLANE_AND_DB_IDENTITY
TARGET_ATTESTATION_SIGNATURE=HMAC_SHA256_WITH_EXTERNAL_SECRET
QA_HARNESS_SOURCE_PARITY=REQUIRED_FOR_APPLY
PREWRITE_BACKUP_RESTORE=REQUIRED_FOR_PRODUCTION_APPLY
APPLY_RETRY=NOOP_WHEN_READY
AUDIT_ACTOR=ACTIVE_PLATFORM_OPERATOR_REQUIRED
STATE_ENUM=ABSENT_SAFE|READY|REVOKED|INVALID|MIXED
~~~

## Escopo reservado

Os únicos slugs aceitos são:

~~~text
qa-prod-canonical-a
qa-prod-canonical-b
~~~

O bootstrap cria/reutiliza somente os usuários sintéticos allowlisted:

~~~text
qa-prod-a-admin@example.invalid    ADMIN
qa-prod-a-manager@example.invalid GERENTE
qa-prod-a-seller@example.invalid   VENDEDOR
qa-prod-b-admin@example.invalid    ADMIN
qa-prod-b-seller@example.invalid   VENDEDOR
~~~

Slug existente com nome divergente, usuário inesperado, papel divergente ou
provider ativo no tenant falha fechado. O bootstrap nunca aceita IDs de tenant
livres, nunca altera integração global e nunca cria dados de clientes reais.

## Guardas de execução

O executor deve validar NODE_ENV=production,
CRM_DATABASE_PROVIDER=postgresql, projeto/ambiente/serviços Railway oficiais,
QA_PROD_DB_SERVICE_ID igual ao PostgreSQL oficial, o worker oficial e o SHA do release
QA aprovado. O SHA-base de produção é 2da896a; qualquer release que inclua o
bootstrap terá um QA_HARNESS_RELEASE_HEAD, Git tree e manifesto novos e
explícitos. Esses valores não são aceitos como autoatestado: o apply/revoke
exige um arquivo de atestado externo, produzido pelo control-plane e por uma
leitura read-only da identidade do banco, incluindo hash da URL efetivamente
usada pelo Prisma, API, worker, banco, release e manifesto. O arquivo deve
conter tipo de atestado, emissor externo, assinatura/referencia de evidência e
timestamp; o bootstrap não pode gerar nem substituir esse atestado.
Quando o runtime não tiver `.git`, ele também deve disponibilizar um
`qa-harness-build-manifest.json` assinado pelo mesmo segredo externo, com
release, Git tree e manifesto calculado; sem Git ou esse manifesto o apply
falha fechado.

O apply de produção também exige backup novo, SHA-256, restore drill aprovado,
target do banco e run ID coincidentes. Sem essa prova, nenhuma escrita é
permitida. O operador é uma identidade ativa, globalmente única e presente em
PLATFORM_ADMIN_EMAILS; auditorias de segurança e de plataforma são obrigatórias.

--target=staging|production é obrigatório. --dry-run é somente leitura.
--apply exige a confirmação literal
QA-PROD-CANONICAL-V1-APPLY. Revoke exige
QA-PROD-CANONICAL-V1-REVOKE. A operação usa transação serializable, índices
unique e allowlist; falha parcial faz rollback. Uma repetição em estado READY
é no-op determinístico e não troca hashes, sessões ou auditorias. Um tenant
reutilizado em estado REVOKED recebe somente nova senha efêmera e reativação
controlada; estado INVALID/MIXED falha fechado.

## Credenciais

Senhas são aleatórias, temporárias e hashadas com bcryptjs. Elas não entram em
stdout, logs, Git, relatório ou banco em texto. Quando necessário para o QA,
o arquivo fica em diretório privado de %TEMP%/tmp criado antes da escrita,
com ACL restritiva e marcador de run; falha/sinal remove o bundle e o revoke
normal exige o caminho para comprovar a remoção. Se o bundle for perdido após
um sinal, o revoke emergencial exige confirmação distinta, atestado fresco e
varre todos os bundles QA do alvo antes de declarar ausência. Ao finalizar, todos os cinco
usuários e os dois tenants ficam inativos; vendas e histórico canônico
permanecem append-only.

## Providers

O estado global de providers não é alterado. A verificação é tenant-scoped:
Meta, WhatsApp, Instagram, Messenger, e-mail, IA e Bling devem estar ausentes
nos dois tenants QA, inclusive resíduos de credenciais, canais, OAuth, caixas,
outbox, webhooks, convites, reset tokens, automações e leases. Uma integração
Bling ativa em outro tenant é preservada. Somente NEGOCIOS_KANBAN é habilitada
temporariamente em cada tenant e é desabilitada no revoke, com auditoria.

## Ferramentas internas

- backend/src/security/qa-provisioning.cjs: regras, allowlist, transações e
  estado sanitizado.
- backend/scripts/qa-prod-status.cjs: preflight somente leitura.
- backend/scripts/qa-prod-bootstrap.cjs: dry-run/apply e credenciais
  temporárias.
- backend/scripts/qa-prod-revoke.cjs: revogação, desativação e limpeza.
- docs/QA_PRODUCTION_HARNESS_RUNBOOK_V1.md: schema do atestado, ordem de
  prewrite, recuperação de sinal e operação dos comandos.

Nenhuma dessas ferramentas é montada como rota Express pública.
