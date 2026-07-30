-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ChaveFuncionalidade" AS ENUM ('LEADS_COMMUNICATION', 'SITE_LEAD_CAPTURE', 'NEGOCIOS_KANBAN', 'AUTOMATIONS', 'WHATSAPP_INTEGRATION', 'WHATSAPP_INBOUND', 'WHATSAPP_OUTBOUND');

-- CreateEnum
CREATE TYPE "GatilhoAutomacao" AS ENUM ('LEAD_CREATED', 'LEAD_WITHOUT_FOLLOW_UP', 'DEAL_STALLED');

-- CreateEnum
CREATE TYPE "EntidadeAutomacao" AS ENUM ('LEAD', 'NEGOCIO');

-- CreateEnum
CREATE TYPE "AcaoAutomacao" AS ENUM ('ASSIGN_OWNER', 'ASSIGN_ROUND_ROBIN', 'CREATE_FOLLOW_UP', 'CREATE_INTERNAL_EVENT', 'UPDATE_NEXT_FOLLOW_UP_PROJECTION');

-- CreateEnum
CREATE TYPE "StatusExecucaoAutomacao" AS ENUM ('PENDENTE', 'PROCESSANDO', 'CONCLUIDA', 'FALHOU', 'FALHA_DEFINITIVA', 'CANCELADA', 'SIMULADA');

-- CreateEnum
CREATE TYPE "StatusJobAutomacao" AS ENUM ('PENDENTE', 'PROCESSANDO', 'CONCLUIDO', 'FALHOU', 'FALHA_DEFINITIVA', 'CANCELADO');

-- CreateEnum
CREATE TYPE "TipoCanal" AS ENUM ('WHATSAPP_META', 'SITE_FORM');

-- CreateEnum
CREATE TYPE "StatusCanal" AS ENUM ('MODO_TESTE', 'ATIVO', 'INATIVO');

-- CreateEnum
CREATE TYPE "MetodoOnboardingWhatsApp" AS ENUM ('MANUAL', 'EMBEDDED_SIGNUP');

-- CreateEnum
CREATE TYPE "StatusCredencialWhatsApp" AS ENUM ('ATIVA', 'ROTACAO_PENDENTE', 'REVOGADA', 'ERRO');

-- CreateEnum
CREATE TYPE "DirecaoMensagem" AS ENUM ('ENTRADA', 'SAIDA');

-- CreateEnum
CREATE TYPE "StatusConversa" AS ENUM ('ABERTA', 'NOVA', 'AGUARDANDO_ATENDIMENTO', 'EM_ATENDIMENTO', 'AGUARDANDO_CLIENTE', 'PENDENTE', 'ENCERRADA');

-- CreateEnum
CREATE TYPE "StatusMensagem" AS ENUM ('RECEBIDA', 'PROCESSADA', 'PREPARADA', 'ERRO');

-- CreateEnum
CREATE TYPE "StatusEntregaMensagem" AS ENUM ('RECEBIDA', 'PENDENTE_ENVIO', 'ENVIADA', 'ENTREGUE', 'LIDA', 'FALHOU');

-- CreateEnum
CREATE TYPE "StatusLead" AS ENUM ('NOVO', 'EM_ATENDIMENTO', 'QUALIFICADO', 'DESQUALIFICADO', 'CONVERTIDO');

-- CreateEnum
CREATE TYPE "EtapaNegocio" AS ENUM ('NOVO', 'CONTATO', 'PROPOSTA', 'FECHADO', 'PERDIDO');

-- CreateEnum
CREATE TYPE "TipoAtribuicao" AS ENUM ('ASSUMIR', 'ATRIBUIR', 'TRANSFERIR', 'DESATRIBUIR', 'REDISTRIBUIR', 'MOVIMENTAR_ETAPA');

-- CreateEnum
CREATE TYPE "OrigemAtribuicao" AS ENUM ('MANUAL', 'AUTOMATICA', 'MIGRACAO');

-- CreateEnum
CREATE TYPE "TipoAcaoAtendimento" AS ENUM ('ASSUMIR', 'ATRIBUIR', 'TRANSFERIR', 'DEVOLVER_FILA', 'AGUARDAR_CLIENTE', 'MARCAR_PENDENTE', 'ENCERRAR', 'REABRIR', 'ALTERAR_ESTADO');

-- CreateEnum
CREATE TYPE "StatusProcessamentoWebhook" AS ENUM ('RECEBIDO', 'PROCESSANDO', 'PROCESSADO', 'FALHOU', 'IGNORADO_DUPLICADO');

-- CreateEnum
CREATE TYPE "TipoMensagemCanal" AS ENUM ('TEXTO', 'DESCONHECIDA');

-- CreateEnum
CREATE TYPE "TipoMovimentacaoEstoque" AS ENUM ('ENTRADA', 'SAIDA', 'AJUSTE');

-- CreateEnum
CREATE TYPE "StatusAcompanhamento" AS ENUM ('PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "PrioridadeAcompanhamento" AS ENUM ('BAIXA', 'MEDIA', 'ALTA', 'URGENTE', 'CRITICA');

-- CreateEnum
CREATE TYPE "TipoAcaoQualificacaoConversa" AS ENUM ('QUALIFICAR', 'CRIAR_NEGOCIO', 'VINCULAR_NEGOCIO');

-- CreateEnum
CREATE TYPE "TipoAcompanhamento" AS ENUM ('TAREFA', 'RETORNO', 'LIGACAO', 'WHATSAPP', 'EMAIL', 'REUNIAO', 'VISITA', 'OUTRO');

-- CreateEnum
CREATE TYPE "TipoAcaoAcompanhamento" AS ENUM ('CRIAR', 'EDITAR', 'ALTERAR_RESPONSAVEL', 'REAGENDAR', 'INICIAR', 'CONCLUIR', 'CANCELAR', 'REABRIR');

-- CreateEnum
CREATE TYPE "StatusPropostaComercial" AS ENUM ('RASCUNHO', 'PRONTA', 'ENVIADA', 'ACEITA', 'RECUSADA', 'VENCIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "TipoAcaoPropostaComercial" AS ENUM ('CRIAR', 'ATUALIZAR', 'ALTERAR_STATUS', 'DUPLICAR_VERSAO');

-- CreateEnum
CREATE TYPE "PapelUsuario" AS ENUM ('ADMIN', 'GERENTE', 'VENDEDOR');

-- CreateEnum
CREATE TYPE "TipoIntegracao" AS ENUM ('BLING', 'OMIE', 'CONTA_AZUL', 'TINY', 'ALTERDATA', 'CSV', 'XLSX', 'XML', 'JSON', 'CUSTOM');

-- CreateEnum
CREATE TYPE "StatusIntegracao" AS ENUM ('PENDENTE', 'ATIVA', 'INATIVA', 'ERRO');

-- CreateEnum
CREATE TYPE "ModoIntegracao" AS ENUM ('SOMENTE_LEITURA', 'LEITURA_ESCRITA');

-- CreateEnum
CREATE TYPE "StatusSincronizacao" AS ENUM ('PENDENTE', 'EXECUTANDO', 'CONCLUIDA', 'CONCLUIDA_COM_ERROS', 'FALHOU', 'CANCELADA');

-- CreateEnum
CREATE TYPE "OrigemSincronizacao" AS ENUM ('MANUAL', 'AGENDADA', 'WEBHOOK', 'IMPORTACAO');

-- CreateEnum
CREATE TYPE "FormatoImportacao" AS ENUM ('CSV', 'XLSX', 'XML', 'JSON');

-- CreateEnum
CREATE TYPE "StatusImportacao" AS ENUM ('ENVIADO', 'MAPEAMENTO_PENDENTE', 'VALIDANDO', 'PRONTO', 'PROCESSANDO', 'CONCLUIDO', 'CONCLUIDO_COM_ERROS', 'FALHOU', 'CANCELADO');

-- CreateTable
CREATE TABLE "Cliente" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "telefone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "empresa" TEXT NOT NULL DEFAULT '',
    "cidade" TEXT,
    "estado" TEXT,
    "cpfCnpj" TEXT,
    "interesse" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'Lead',
    "valor" INTEGER NOT NULL DEFAULT 0,
    "origem" TEXT NOT NULL DEFAULT 'Manual',
    "favorito" BOOLEAN NOT NULL DEFAULT false,
    "quente" BOOLEAN NOT NULL DEFAULT false,
    "ultimoContato" INTEGER NOT NULL DEFAULT 0,
    "proximoFollowUp" TEXT NOT NULL DEFAULT 'Hoje',
    "tags" TEXT NOT NULL DEFAULT '[]',
    "revisao" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Nota" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "texto" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'nota',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clienteId" INTEGER NOT NULL,

    CONSTRAINT "Nota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoriaProduto" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategoriaProduto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Produto" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "codigo" TEXT,
    "descricao" TEXT,
    "categoriaId" INTEGER,
    "unidadeMedida" TEXT NOT NULL DEFAULT 'UN',
    "quantidadeAtual" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "estoqueMinimo" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "precoCustoCentavos" INTEGER NOT NULL DEFAULT 0,
    "precoVendaCentavos" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Produto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimentacaoEstoque" (
    "id" SERIAL NOT NULL,
    "produtoId" INTEGER NOT NULL,
    "tipo" "TipoMovimentacaoEstoque" NOT NULL,
    "quantidade" DECIMAL(65,30) NOT NULL,
    "quantidadeAnterior" DECIMAL(65,30) NOT NULL,
    "quantidadePosterior" DECIMAL(65,30) NOT NULL,
    "motivo" TEXT,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimentacaoEstoque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Acompanhamento" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "clienteId" INTEGER,
    "leadId" INTEGER,
    "conversaCanalId" INTEGER,
    "negocioId" INTEGER,
    "propostaComercialId" INTEGER,
    "responsavelId" INTEGER,
    "autorId" INTEGER,
    "concluidoPorId" INTEGER,
    "canceladoPorId" INTEGER,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "dataHora" TIMESTAMP(3) NOT NULL,
    "prioridade" "PrioridadeAcompanhamento" NOT NULL DEFAULT 'MEDIA',
    "status" "StatusAcompanhamento" NOT NULL DEFAULT 'PENDENTE',
    "tipo" "TipoAcompanhamento" NOT NULL DEFAULT 'LIGACAO',
    "responsavel" TEXT,
    "concluidoEm" TIMESTAMP(3),
    "canceladoEm" TIMESTAMP(3),
    "revisao" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Acompanhamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoricoAcompanhamento" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "acompanhamentoId" INTEGER NOT NULL,
    "autorId" INTEGER NOT NULL,
    "acao" "TipoAcaoAcompanhamento" NOT NULL,
    "statusAnterior" "StatusAcompanhamento",
    "statusNovo" "StatusAcompanhamento",
    "responsavelAnteriorId" INTEGER,
    "responsavelNovoId" INTEGER,
    "dataHoraAnterior" TIMESTAMP(3),
    "dataHoraNova" TIMESTAMP(3),
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HistoricoAcompanhamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Empresa" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Empresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "papel" "PapelUsuario" NOT NULL DEFAULT 'VENDEDOR',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ultimoLoginEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegracaoOAuthState" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "provedor" TEXT NOT NULL,
    "stateHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegracaoOAuthState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Integracao" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoIntegracao" NOT NULL,
    "status" "StatusIntegracao" NOT NULL DEFAULT 'PENDENTE',
    "modo" "ModoIntegracao" NOT NULL DEFAULT 'SOMENTE_LEITURA',
    "configuracaoJson" TEXT NOT NULL DEFAULT '{}',
    "credenciaisCriptografadas" TEXT,
    "ultimaSincronizacaoEm" TIMESTAMP(3),
    "ultimoSucessoEm" TIMESTAMP(3),
    "ultimoErroEm" TIMESTAMP(3),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Integracao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SincronizacaoIntegracao" (
    "id" SERIAL NOT NULL,
    "integracaoId" INTEGER NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "status" "StatusSincronizacao" NOT NULL DEFAULT 'PENDENTE',
    "origem" "OrigemSincronizacao" NOT NULL DEFAULT 'MANUAL',
    "iniciadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizadaEm" TIMESTAMP(3),
    "itensRecebidos" INTEGER NOT NULL DEFAULT 0,
    "itensProcessados" INTEGER NOT NULL DEFAULT 0,
    "itensComErro" INTEGER NOT NULL DEFAULT 0,
    "mensagemErro" TEXT,
    "metadadosJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SincronizacaoIntegracao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErroIntegracao" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "integracaoId" INTEGER NOT NULL,
    "sincronizacaoId" INTEGER,
    "codigo" TEXT NOT NULL,
    "mensagem" TEXT NOT NULL,
    "detalhesSanitizados" TEXT,
    "resolvido" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "ErroIntegracao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProdutoExterno" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "integracaoId" INTEGER NOT NULL,
    "externalId" TEXT NOT NULL,
    "sku" TEXT,
    "codigoBarras" TEXT,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "categoria" TEXT,
    "marca" TEXT,
    "unidade" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "dadosOriginaisJson" TEXT,
    "sincronizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProdutoExterno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstoqueExterno" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "integracaoId" INTEGER NOT NULL,
    "produtoExternoId" INTEGER NOT NULL,
    "localExternalId" TEXT,
    "localNome" TEXT,
    "quantidade" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "reservado" DECIMAL(65,30),
    "disponivel" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "sincronizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EstoqueExterno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrecoExterno" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "integracaoId" INTEGER NOT NULL,
    "produtoExternoId" INTEGER NOT NULL,
    "tabela" TEXT,
    "precoCentavos" INTEGER NOT NULL,
    "precoPromocionalCentavos" INTEGER,
    "inicioPromocao" TIMESTAMP(3),
    "fimPromocao" TIMESTAMP(3),
    "sincronizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrecoExterno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CondicaoPagamentoExterna" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "integracaoId" INTEGER NOT NULL,
    "externalId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "parcelas" INTEGER,
    "valorMinimoCentavos" INTEGER,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "sincronizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CondicaoPagamentoExterna_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportacaoDados" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "integracaoId" INTEGER,
    "formato" "FormatoImportacao" NOT NULL,
    "status" "StatusImportacao" NOT NULL DEFAULT 'ENVIADO',
    "nomeArquivo" TEXT NOT NULL,
    "tamanhoBytes" INTEGER NOT NULL,
    "hashArquivo" TEXT NOT NULL,
    "tipoEntidade" TEXT NOT NULL,
    "mapeamentoJson" TEXT,
    "totalLinhas" INTEGER NOT NULL DEFAULT 0,
    "linhasValidas" INTEGER NOT NULL DEFAULT 0,
    "linhasComErro" INTEGER NOT NULL DEFAULT 0,
    "iniciadaEm" TIMESTAMP(3),
    "finalizadaEm" TIMESTAMP(3),
    "createdByUsuarioId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportacaoDados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErroImportacao" (
    "id" SERIAL NOT NULL,
    "importacaoId" INTEGER NOT NULL,
    "linha" INTEGER,
    "campo" TEXT,
    "codigo" TEXT NOT NULL,
    "mensagem" TEXT NOT NULL,
    "valorSanitizado" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErroImportacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CanalIntegracao" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "tipo" "TipoCanal" NOT NULL,
    "nome" TEXT NOT NULL,
    "chaveInterna" TEXT NOT NULL,
    "publicId" TEXT,
    "configuracaoJson" TEXT NOT NULL DEFAULT '{}',
    "status" "StatusCanal" NOT NULL DEFAULT 'MODO_TESTE',
    "modoTeste" BOOLEAN NOT NULL DEFAULT true,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "providerEnvironment" TEXT,
    "metaAppId" TEXT,
    "metaBusinessId" TEXT,
    "wabaId" TEXT,
    "phoneNumberId" TEXT,
    "displayPhoneMasked" TEXT,
    "verifiedDisplayName" TEXT,
    "qualityRating" TEXT,
    "graphApiVersion" TEXT,
    "onboardingMethod" "MetodoOnboardingWhatsApp",
    "accessTokenRef" TEXT,
    "credentialStatus" "StatusCredencialWhatsApp",
    "connectedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "lastWebhookAt" TIMESTAMP(3),
    "lastFailureAt" TIMESTAMP(3),
    "lastFailureCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CanalIntegracao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContatoCanal" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "canalIntegracaoId" INTEGER NOT NULL,
    "clienteId" INTEGER,
    "externalId" TEXT NOT NULL,
    "telefoneNormalizado" TEXT,
    "nome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContatoCanal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversaCanal" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "canalIntegracaoId" INTEGER NOT NULL,
    "contatoCanalId" INTEGER NOT NULL,
    "leadId" INTEGER,
    "responsavelId" INTEGER,
    "respostaReservadaPorId" INTEGER,
    "respostaReservadaAte" TIMESTAMP(3),
    "status" "StatusConversa" NOT NULL DEFAULT 'ABERTA',
    "chaveAberta" TEXT,
    "primeiraMensagemEm" TIMESTAMP(3),
    "ultimaMensagemEm" TIMESTAMP(3),
    "primeiraRespostaHumanaEm" TIMESTAMP(3),
    "aguardandoDesde" TIMESTAMP(3),
    "encerradaEm" TIMESTAMP(3),
    "reabertaEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversaCanal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MensagemCanal" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "canalIntegracaoId" INTEGER NOT NULL,
    "conversaCanalId" INTEGER NOT NULL,
    "autorUsuarioId" INTEGER,
    "externalId" TEXT NOT NULL,
    "direcao" "DirecaoMensagem" NOT NULL,
    "tipo" "TipoMensagemCanal" NOT NULL DEFAULT 'TEXTO',
    "texto" TEXT,
    "status" "StatusMensagem" NOT NULL DEFAULT 'RECEBIDA',
    "statusEntrega" "StatusEntregaMensagem",
    "enviadaEm" TIMESTAMP(3),
    "entregueEm" TIMESTAMP(3),
    "lidaEm" TIMESTAMP(3),
    "falhouEm" TIMESTAMP(3),
    "erroCodigo" TEXT,
    "erroResumo" TEXT,
    "simulada" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MensagemCanal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "clienteId" INTEGER NOT NULL,
    "responsavelId" INTEGER,
    "status" "StatusLead" NOT NULL DEFAULT 'NOVO',
    "origem" TEXT,
    "campanha" TEXT,
    "interesse" TEXT,
    "paginaOrigem" TEXT,
    "aceitePoliticaPrivacidade" BOOLEAN,
    "versaoPoliticaPrivacidade" TEXT,
    "aceitePoliticaEm" TIMESTAMP(3),
    "motivoDesqualificacao" TEXT,
    "qualificadoEm" TIMESTAMP(3),
    "desqualificadoEm" TIMESTAMP(3),
    "convertidoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Negocio" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "clienteId" INTEGER NOT NULL,
    "legacyClienteId" INTEGER,
    "leadId" INTEGER,
    "responsavelId" INTEGER,
    "convertidoPorId" INTEGER,
    "statusLeadAnterior" "StatusLead",
    "titulo" TEXT,
    "observacao" TEXT,
    "etapa" "EtapaNegocio" NOT NULL DEFAULT 'NOVO',
    "valor" INTEGER,
    "motivoPerda" TEXT,
    "fechadoEm" TIMESTAMP(3),
    "perdidoEm" TIMESTAMP(3),
    "etapaEntrouEm" TIMESTAMP(3),
    "ultimaMovimentacaoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Negocio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotaInternaConversa" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "conversaCanalId" INTEGER NOT NULL,
    "autorId" INTEGER NOT NULL,
    "conteudo" TEXT NOT NULL,
    "sistema" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotaInternaConversa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoricoAtribuicao" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "leadId" INTEGER,
    "conversaCanalId" INTEGER,
    "negocioId" INTEGER,
    "responsavelAnteriorId" INTEGER,
    "responsavelNovoId" INTEGER,
    "alteradoPorId" INTEGER,
    "tipo" "TipoAtribuicao" NOT NULL DEFAULT 'ATRIBUIR',
    "origem" "OrigemAtribuicao" NOT NULL DEFAULT 'MANUAL',
    "acaoAtendimento" "TipoAcaoAtendimento",
    "estadoAnterior" "StatusConversa",
    "estadoNovo" "StatusConversa",
    "etapaAnterior" "EtapaNegocio",
    "etapaNova" "EtapaNegocio",
    "etapaEntrouEm" TIMESTAMP(3),
    "etapaSaiuEm" TIMESTAMP(3),
    "duracaoEtapaSegundos" INTEGER,
    "duracaoEtapaEstimada" BOOLEAN,
    "motivo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HistoricoAtribuicao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoricoQualificacaoConversa" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "conversaCanalId" INTEGER NOT NULL,
    "clienteId" INTEGER NOT NULL,
    "leadId" INTEGER NOT NULL,
    "negocioId" INTEGER,
    "autorId" INTEGER NOT NULL,
    "acao" "TipoAcaoQualificacaoConversa" NOT NULL,
    "interesse" TEXT,
    "prioridade" "PrioridadeAcompanhamento",
    "valorEstimado" INTEGER,
    "proximaAcao" TEXT,
    "dataRetorno" TIMESTAMP(3),
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HistoricoQualificacaoConversa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropostaComercial" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "clienteId" INTEGER NOT NULL,
    "negocioId" INTEGER NOT NULL,
    "leadId" INTEGER,
    "responsavelId" INTEGER,
    "autorId" INTEGER NOT NULL,
    "propostaOrigemId" INTEGER,
    "codigo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "descontoGeralCentavos" INTEGER NOT NULL DEFAULT 0,
    "subtotalCentavos" INTEGER NOT NULL DEFAULT 0,
    "totalCentavos" INTEGER NOT NULL DEFAULT 0,
    "validade" TIMESTAMP(3) NOT NULL,
    "observacoes" TEXT,
    "condicoesComerciais" TEXT,
    "status" "StatusPropostaComercial" NOT NULL DEFAULT 'RASCUNHO',
    "versao" INTEGER NOT NULL DEFAULT 1,
    "revisao" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropostaComercial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemPropostaComercial" (
    "id" SERIAL NOT NULL,
    "propostaId" INTEGER NOT NULL,
    "descricao" TEXT NOT NULL,
    "quantidade" DECIMAL(65,30) NOT NULL,
    "valorUnitarioCentavos" INTEGER NOT NULL,
    "descontoCentavos" INTEGER NOT NULL DEFAULT 0,
    "subtotalCentavos" INTEGER NOT NULL,
    "totalCentavos" INTEGER NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemPropostaComercial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoricoPropostaComercial" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "propostaId" INTEGER NOT NULL,
    "autorId" INTEGER NOT NULL,
    "acao" "TipoAcaoPropostaComercial" NOT NULL,
    "statusAnterior" "StatusPropostaComercial",
    "statusNovo" "StatusPropostaComercial",
    "versao" INTEGER NOT NULL,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HistoricoPropostaComercial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventoWebhook" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "canalIntegracaoId" INTEGER NOT NULL,
    "provedor" TEXT NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "tipoEvento" TEXT,
    "payloadHash" TEXT,
    "payloadJson" TEXT,
    "statusProcessamento" "StatusProcessamentoWebhook" NOT NULL DEFAULT 'RECEBIDO',
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "recebidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processadoEm" TIMESTAMP(3),
    "erroCodigo" TEXT,
    "erroResumo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventoWebhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomacaoRegra" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "ativa" BOOLEAN NOT NULL DEFAULT false,
    "prioridade" INTEGER NOT NULL DEFAULT 100,
    "gatilho" "GatilhoAutomacao" NOT NULL,
    "condicoesJson" TEXT NOT NULL DEFAULT '[]',
    "acoesJson" TEXT NOT NULL DEFAULT '[]',
    "timezone" TEXT NOT NULL,
    "janelaJson" TEXT,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "activatedAt" TIMESTAMP(3),
    "createdById" INTEGER,
    "updatedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomacaoRegra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomacaoExecucao" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "regraId" INTEGER NOT NULL,
    "regraVersao" INTEGER NOT NULL,
    "regraSnapshotJson" TEXT NOT NULL,
    "entidadeTipo" "EntidadeAutomacao" NOT NULL,
    "entidadeId" INTEGER NOT NULL,
    "leadId" INTEGER,
    "negocioId" INTEGER,
    "occurrenceKey" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "StatusExecucaoAutomacao" NOT NULL DEFAULT 'PENDENTE',
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "iniciadaEm" TIMESTAMP(3),
    "concluidaEm" TIMESTAMP(3),
    "erroCodigo" TEXT,
    "erroResumo" TEXT,
    "resumoJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomacaoExecucao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomacaoAcaoJob" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "execucaoId" INTEGER NOT NULL,
    "indice" INTEGER NOT NULL,
    "tipo" "AcaoAutomacao" NOT NULL,
    "actionKey" TEXT NOT NULL,
    "status" "StatusJobAutomacao" NOT NULL DEFAULT 'PENDENTE',
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "leaseOwner" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "erroCodigo" TEXT,
    "erroResumo" TEXT,
    "resultadoJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomacaoAcaoJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomacaoRoundRobinEstado" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "regraId" INTEGER NOT NULL,
    "ultimoResponsavelId" INTEGER,
    "revisao" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomacaoRoundRobinEstado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomacaoEventoInterno" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "execucaoId" INTEGER,
    "leadId" INTEGER,
    "negocioId" INTEGER,
    "acompanhamentoId" INTEGER,
    "autorId" INTEGER,
    "tipo" TEXT NOT NULL,
    "resumo" TEXT NOT NULL,
    "payloadJson" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomacaoEventoInterno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmpresaFuncionalidade" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "chave" "ChaveFuncionalidade" NOT NULL,
    "habilitada" BOOLEAN NOT NULL DEFAULT false,
    "habilitadoEm" TIMESTAMP(3),
    "habilitadoPorUsuarioId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmpresaFuncionalidade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditoriaFuncionalidade" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "funcionalidadeId" INTEGER,
    "chave" "ChaveFuncionalidade" NOT NULL,
    "valorAnterior" BOOLEAN,
    "valorNovo" BOOLEAN NOT NULL,
    "operadoPor" TEXT NOT NULL,
    "usuarioId" INTEGER,
    "motivo" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditoriaFuncionalidade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformTenantAudit" (
    "id" SERIAL NOT NULL,
    "actorUserId" INTEGER NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "tenantName" TEXT NOT NULL,
    "tenantSlug" TEXT NOT NULL,
    "adminUserId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformTenantAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Cliente_empresaId_idx" ON "Cliente"("empresaId");

-- CreateIndex
CREATE INDEX "Cliente_empresaId_status_idx" ON "Cliente"("empresaId", "status");

-- CreateIndex
CREATE INDEX "Cliente_empresaId_quente_idx" ON "Cliente"("empresaId", "quente");

-- CreateIndex
CREATE INDEX "Cliente_empresaId_createdAt_idx" ON "Cliente"("empresaId", "createdAt");

-- CreateIndex
CREATE INDEX "Nota_empresaId_idx" ON "Nota"("empresaId");

-- CreateIndex
CREATE INDEX "Nota_clienteId_idx" ON "Nota"("clienteId");

-- CreateIndex
CREATE INDEX "Nota_empresaId_clienteId_idx" ON "Nota"("empresaId", "clienteId");

-- CreateIndex
CREATE INDEX "Nota_empresaId_createdAt_idx" ON "Nota"("empresaId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CategoriaProduto_nome_key" ON "CategoriaProduto"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "Produto_codigo_key" ON "Produto"("codigo");

-- CreateIndex
CREATE INDEX "Produto_categoriaId_idx" ON "Produto"("categoriaId");

-- CreateIndex
CREATE INDEX "Produto_ativo_idx" ON "Produto"("ativo");

-- CreateIndex
CREATE INDEX "MovimentacaoEstoque_produtoId_idx" ON "MovimentacaoEstoque"("produtoId");

-- CreateIndex
CREATE INDEX "MovimentacaoEstoque_tipo_idx" ON "MovimentacaoEstoque"("tipo");

-- CreateIndex
CREATE INDEX "MovimentacaoEstoque_createdAt_idx" ON "MovimentacaoEstoque"("createdAt");

-- CreateIndex
CREATE INDEX "Acompanhamento_empresaId_idx" ON "Acompanhamento"("empresaId");

-- CreateIndex
CREATE INDEX "Acompanhamento_clienteId_idx" ON "Acompanhamento"("clienteId");

-- CreateIndex
CREATE INDEX "Acompanhamento_empresaId_clienteId_idx" ON "Acompanhamento"("empresaId", "clienteId");

-- CreateIndex
CREATE INDEX "Acompanhamento_empresaId_dataHora_idx" ON "Acompanhamento"("empresaId", "dataHora");

-- CreateIndex
CREATE INDEX "Acompanhamento_empresaId_status_idx" ON "Acompanhamento"("empresaId", "status");

-- CreateIndex
CREATE INDEX "Acompanhamento_empresaId_prioridade_idx" ON "Acompanhamento"("empresaId", "prioridade");

-- CreateIndex
CREATE INDEX "Acompanhamento_empresaId_tipo_idx" ON "Acompanhamento"("empresaId", "tipo");

-- CreateIndex
CREATE INDEX "Acompanhamento_empresaId_leadId_idx" ON "Acompanhamento"("empresaId", "leadId");

-- CreateIndex
CREATE INDEX "Acompanhamento_empresaId_conversaCanalId_idx" ON "Acompanhamento"("empresaId", "conversaCanalId");

-- CreateIndex
CREATE INDEX "Acompanhamento_empresaId_negocioId_idx" ON "Acompanhamento"("empresaId", "negocioId");

-- CreateIndex
CREATE INDEX "Acompanhamento_empresaId_propostaComercialId_idx" ON "Acompanhamento"("empresaId", "propostaComercialId");

-- CreateIndex
CREATE INDEX "Acompanhamento_empresaId_responsavelId_status_idx" ON "Acompanhamento"("empresaId", "responsavelId", "status");

-- CreateIndex
CREATE INDEX "Acompanhamento_empresaId_autorId_createdAt_idx" ON "Acompanhamento"("empresaId", "autorId", "createdAt");

-- CreateIndex
CREATE INDEX "HistoricoAcompanhamento_empresaId_acompanhamentoId_createdA_idx" ON "HistoricoAcompanhamento"("empresaId", "acompanhamentoId", "createdAt");

-- CreateIndex
CREATE INDEX "HistoricoAcompanhamento_empresaId_autorId_createdAt_idx" ON "HistoricoAcompanhamento"("empresaId", "autorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Empresa_slug_key" ON "Empresa"("slug");

-- CreateIndex
CREATE INDEX "Usuario_empresaId_idx" ON "Usuario"("empresaId");

-- CreateIndex
CREATE INDEX "Usuario_email_idx" ON "Usuario"("email");

-- CreateIndex
CREATE INDEX "Usuario_ativo_idx" ON "Usuario"("ativo");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_empresaId_email_key" ON "Usuario"("empresaId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "IntegracaoOAuthState_stateHash_key" ON "IntegracaoOAuthState"("stateHash");

-- CreateIndex
CREATE INDEX "IntegracaoOAuthState_empresaId_idx" ON "IntegracaoOAuthState"("empresaId");

-- CreateIndex
CREATE INDEX "IntegracaoOAuthState_usuarioId_idx" ON "IntegracaoOAuthState"("usuarioId");

-- CreateIndex
CREATE INDEX "IntegracaoOAuthState_provedor_idx" ON "IntegracaoOAuthState"("provedor");

-- CreateIndex
CREATE INDEX "IntegracaoOAuthState_expiresAt_idx" ON "IntegracaoOAuthState"("expiresAt");

-- CreateIndex
CREATE INDEX "Integracao_empresaId_idx" ON "Integracao"("empresaId");

-- CreateIndex
CREATE INDEX "Integracao_empresaId_status_idx" ON "Integracao"("empresaId", "status");

-- CreateIndex
CREATE INDEX "Integracao_empresaId_tipo_idx" ON "Integracao"("empresaId", "tipo");

-- CreateIndex
CREATE INDEX "Integracao_ativo_idx" ON "Integracao"("ativo");

-- CreateIndex
CREATE INDEX "SincronizacaoIntegracao_empresaId_idx" ON "SincronizacaoIntegracao"("empresaId");

-- CreateIndex
CREATE INDEX "SincronizacaoIntegracao_integracaoId_idx" ON "SincronizacaoIntegracao"("integracaoId");

-- CreateIndex
CREATE INDEX "SincronizacaoIntegracao_status_idx" ON "SincronizacaoIntegracao"("status");

-- CreateIndex
CREATE INDEX "SincronizacaoIntegracao_origem_idx" ON "SincronizacaoIntegracao"("origem");

-- CreateIndex
CREATE INDEX "SincronizacaoIntegracao_iniciadaEm_idx" ON "SincronizacaoIntegracao"("iniciadaEm");

-- CreateIndex
CREATE INDEX "ErroIntegracao_empresaId_idx" ON "ErroIntegracao"("empresaId");

-- CreateIndex
CREATE INDEX "ErroIntegracao_integracaoId_idx" ON "ErroIntegracao"("integracaoId");

-- CreateIndex
CREATE INDEX "ErroIntegracao_sincronizacaoId_idx" ON "ErroIntegracao"("sincronizacaoId");

-- CreateIndex
CREATE INDEX "ErroIntegracao_resolvido_idx" ON "ErroIntegracao"("resolvido");

-- CreateIndex
CREATE INDEX "ErroIntegracao_codigo_idx" ON "ErroIntegracao"("codigo");

-- CreateIndex
CREATE INDEX "ProdutoExterno_empresaId_idx" ON "ProdutoExterno"("empresaId");

-- CreateIndex
CREATE INDEX "ProdutoExterno_integracaoId_idx" ON "ProdutoExterno"("integracaoId");

-- CreateIndex
CREATE INDEX "ProdutoExterno_sku_idx" ON "ProdutoExterno"("sku");

-- CreateIndex
CREATE INDEX "ProdutoExterno_codigoBarras_idx" ON "ProdutoExterno"("codigoBarras");

-- CreateIndex
CREATE INDEX "ProdutoExterno_nome_idx" ON "ProdutoExterno"("nome");

-- CreateIndex
CREATE INDEX "ProdutoExterno_categoria_idx" ON "ProdutoExterno"("categoria");

-- CreateIndex
CREATE UNIQUE INDEX "ProdutoExterno_integracaoId_externalId_key" ON "ProdutoExterno"("integracaoId", "externalId");

-- CreateIndex
CREATE INDEX "EstoqueExterno_empresaId_idx" ON "EstoqueExterno"("empresaId");

-- CreateIndex
CREATE INDEX "EstoqueExterno_integracaoId_idx" ON "EstoqueExterno"("integracaoId");

-- CreateIndex
CREATE INDEX "EstoqueExterno_produtoExternoId_idx" ON "EstoqueExterno"("produtoExternoId");

-- CreateIndex
CREATE INDEX "EstoqueExterno_localExternalId_idx" ON "EstoqueExterno"("localExternalId");

-- CreateIndex
CREATE INDEX "PrecoExterno_empresaId_idx" ON "PrecoExterno"("empresaId");

-- CreateIndex
CREATE INDEX "PrecoExterno_integracaoId_idx" ON "PrecoExterno"("integracaoId");

-- CreateIndex
CREATE INDEX "PrecoExterno_produtoExternoId_idx" ON "PrecoExterno"("produtoExternoId");

-- CreateIndex
CREATE INDEX "PrecoExterno_tabela_idx" ON "PrecoExterno"("tabela");

-- CreateIndex
CREATE INDEX "CondicaoPagamentoExterna_empresaId_idx" ON "CondicaoPagamentoExterna"("empresaId");

-- CreateIndex
CREATE INDEX "CondicaoPagamentoExterna_integracaoId_idx" ON "CondicaoPagamentoExterna"("integracaoId");

-- CreateIndex
CREATE INDEX "CondicaoPagamentoExterna_ativo_idx" ON "CondicaoPagamentoExterna"("ativo");

-- CreateIndex
CREATE UNIQUE INDEX "CondicaoPagamentoExterna_integracaoId_externalId_key" ON "CondicaoPagamentoExterna"("integracaoId", "externalId");

-- CreateIndex
CREATE INDEX "ImportacaoDados_empresaId_idx" ON "ImportacaoDados"("empresaId");

-- CreateIndex
CREATE INDEX "ImportacaoDados_integracaoId_idx" ON "ImportacaoDados"("integracaoId");

-- CreateIndex
CREATE INDEX "ImportacaoDados_createdByUsuarioId_idx" ON "ImportacaoDados"("createdByUsuarioId");

-- CreateIndex
CREATE INDEX "ImportacaoDados_status_idx" ON "ImportacaoDados"("status");

-- CreateIndex
CREATE INDEX "ImportacaoDados_formato_idx" ON "ImportacaoDados"("formato");

-- CreateIndex
CREATE INDEX "ImportacaoDados_hashArquivo_idx" ON "ImportacaoDados"("hashArquivo");

-- CreateIndex
CREATE INDEX "ErroImportacao_importacaoId_idx" ON "ErroImportacao"("importacaoId");

-- CreateIndex
CREATE INDEX "ErroImportacao_codigo_idx" ON "ErroImportacao"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "CanalIntegracao_publicId_key" ON "CanalIntegracao"("publicId");

-- CreateIndex
CREATE INDEX "CanalIntegracao_empresaId_idx" ON "CanalIntegracao"("empresaId");

-- CreateIndex
CREATE INDEX "CanalIntegracao_empresaId_tipo_idx" ON "CanalIntegracao"("empresaId", "tipo");

-- CreateIndex
CREATE INDEX "CanalIntegracao_empresaId_ativo_idx" ON "CanalIntegracao"("empresaId", "ativo");

-- CreateIndex
CREATE INDEX "CanalIntegracao_empresaId_tipo_ativo_idx" ON "CanalIntegracao"("empresaId", "tipo", "ativo");

-- CreateIndex
CREATE INDEX "CanalIntegracao_empresaId_tipo_wabaId_idx" ON "CanalIntegracao"("empresaId", "tipo", "wabaId");

-- CreateIndex
CREATE UNIQUE INDEX "CanalIntegracao_empresaId_chaveInterna_key" ON "CanalIntegracao"("empresaId", "chaveInterna");

-- CreateIndex
CREATE UNIQUE INDEX "CanalIntegracao_tipo_providerEnvironment_metaAppId_phoneNum_key" ON "CanalIntegracao"("tipo", "providerEnvironment", "metaAppId", "phoneNumberId");

-- CreateIndex
CREATE INDEX "ContatoCanal_empresaId_idx" ON "ContatoCanal"("empresaId");

-- CreateIndex
CREATE INDEX "ContatoCanal_canalIntegracaoId_idx" ON "ContatoCanal"("canalIntegracaoId");

-- CreateIndex
CREATE INDEX "ContatoCanal_empresaId_telefoneNormalizado_idx" ON "ContatoCanal"("empresaId", "telefoneNormalizado");

-- CreateIndex
CREATE INDEX "ContatoCanal_empresaId_clienteId_idx" ON "ContatoCanal"("empresaId", "clienteId");

-- CreateIndex
CREATE UNIQUE INDEX "ContatoCanal_canalIntegracaoId_externalId_key" ON "ContatoCanal"("canalIntegracaoId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "ConversaCanal_chaveAberta_key" ON "ConversaCanal"("chaveAberta");

-- CreateIndex
CREATE INDEX "ConversaCanal_empresaId_idx" ON "ConversaCanal"("empresaId");

-- CreateIndex
CREATE INDEX "ConversaCanal_canalIntegracaoId_idx" ON "ConversaCanal"("canalIntegracaoId");

-- CreateIndex
CREATE INDEX "ConversaCanal_contatoCanalId_idx" ON "ConversaCanal"("contatoCanalId");

-- CreateIndex
CREATE INDEX "ConversaCanal_status_idx" ON "ConversaCanal"("status");

-- CreateIndex
CREATE INDEX "ConversaCanal_ultimaMensagemEm_idx" ON "ConversaCanal"("ultimaMensagemEm");

-- CreateIndex
CREATE INDEX "ConversaCanal_empresaId_status_aguardandoDesde_idx" ON "ConversaCanal"("empresaId", "status", "aguardandoDesde");

-- CreateIndex
CREATE INDEX "ConversaCanal_empresaId_responsavelId_status_idx" ON "ConversaCanal"("empresaId", "responsavelId", "status");

-- CreateIndex
CREATE INDEX "ConversaCanal_empresaId_respostaReservadaPorId_idx" ON "ConversaCanal"("empresaId", "respostaReservadaPorId");

-- CreateIndex
CREATE INDEX "ConversaCanal_empresaId_respostaReservadaAte_idx" ON "ConversaCanal"("empresaId", "respostaReservadaAte");

-- CreateIndex
CREATE INDEX "ConversaCanal_empresaId_leadId_idx" ON "ConversaCanal"("empresaId", "leadId");

-- CreateIndex
CREATE INDEX "MensagemCanal_empresaId_idx" ON "MensagemCanal"("empresaId");

-- CreateIndex
CREATE INDEX "MensagemCanal_canalIntegracaoId_idx" ON "MensagemCanal"("canalIntegracaoId");

-- CreateIndex
CREATE INDEX "MensagemCanal_conversaCanalId_idx" ON "MensagemCanal"("conversaCanalId");

-- CreateIndex
CREATE INDEX "MensagemCanal_status_idx" ON "MensagemCanal"("status");

-- CreateIndex
CREATE INDEX "MensagemCanal_empresaId_statusEntrega_idx" ON "MensagemCanal"("empresaId", "statusEntrega");

-- CreateIndex
CREATE INDEX "MensagemCanal_empresaId_conversaCanalId_autorUsuarioId_idx" ON "MensagemCanal"("empresaId", "conversaCanalId", "autorUsuarioId");

-- CreateIndex
CREATE INDEX "MensagemCanal_createdAt_idx" ON "MensagemCanal"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MensagemCanal_canalIntegracaoId_externalId_key" ON "MensagemCanal"("canalIntegracaoId", "externalId");

-- CreateIndex
CREATE INDEX "Lead_empresaId_status_idx" ON "Lead"("empresaId", "status");

-- CreateIndex
CREATE INDEX "Lead_empresaId_responsavelId_status_idx" ON "Lead"("empresaId", "responsavelId", "status");

-- CreateIndex
CREATE INDEX "Lead_empresaId_clienteId_idx" ON "Lead"("empresaId", "clienteId");

-- CreateIndex
CREATE INDEX "Lead_empresaId_createdAt_idx" ON "Lead"("empresaId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Negocio_legacyClienteId_key" ON "Negocio"("legacyClienteId");

-- CreateIndex
CREATE UNIQUE INDEX "Negocio_leadId_key" ON "Negocio"("leadId");

-- CreateIndex
CREATE INDEX "Negocio_empresaId_etapa_idx" ON "Negocio"("empresaId", "etapa");

-- CreateIndex
CREATE INDEX "Negocio_empresaId_responsavelId_etapa_idx" ON "Negocio"("empresaId", "responsavelId", "etapa");

-- CreateIndex
CREATE INDEX "Negocio_empresaId_clienteId_idx" ON "Negocio"("empresaId", "clienteId");

-- CreateIndex
CREATE INDEX "Negocio_empresaId_leadId_idx" ON "Negocio"("empresaId", "leadId");

-- CreateIndex
CREATE INDEX "Negocio_empresaId_legacyClienteId_idx" ON "Negocio"("empresaId", "legacyClienteId");

-- CreateIndex
CREATE INDEX "Negocio_empresaId_convertidoPorId_createdAt_idx" ON "Negocio"("empresaId", "convertidoPorId", "createdAt");

-- CreateIndex
CREATE INDEX "NotaInternaConversa_empresaId_conversaCanalId_createdAt_idx" ON "NotaInternaConversa"("empresaId", "conversaCanalId", "createdAt");

-- CreateIndex
CREATE INDEX "NotaInternaConversa_empresaId_autorId_createdAt_idx" ON "NotaInternaConversa"("empresaId", "autorId", "createdAt");

-- CreateIndex
CREATE INDEX "HistoricoAtribuicao_empresaId_leadId_createdAt_idx" ON "HistoricoAtribuicao"("empresaId", "leadId", "createdAt");

-- CreateIndex
CREATE INDEX "HistoricoAtribuicao_empresaId_conversaCanalId_createdAt_idx" ON "HistoricoAtribuicao"("empresaId", "conversaCanalId", "createdAt");

-- CreateIndex
CREATE INDEX "HistoricoAtribuicao_empresaId_negocioId_createdAt_idx" ON "HistoricoAtribuicao"("empresaId", "negocioId", "createdAt");

-- CreateIndex
CREATE INDEX "HistoricoAtribuicao_empresaId_responsavelNovoId_createdAt_idx" ON "HistoricoAtribuicao"("empresaId", "responsavelNovoId", "createdAt");

-- CreateIndex
CREATE INDEX "HistoricoQualificacaoConversa_empresaId_conversaCanalId_cre_idx" ON "HistoricoQualificacaoConversa"("empresaId", "conversaCanalId", "createdAt");

-- CreateIndex
CREATE INDEX "HistoricoQualificacaoConversa_empresaId_clienteId_createdAt_idx" ON "HistoricoQualificacaoConversa"("empresaId", "clienteId", "createdAt");

-- CreateIndex
CREATE INDEX "HistoricoQualificacaoConversa_empresaId_leadId_createdAt_idx" ON "HistoricoQualificacaoConversa"("empresaId", "leadId", "createdAt");

-- CreateIndex
CREATE INDEX "HistoricoQualificacaoConversa_empresaId_negocioId_createdAt_idx" ON "HistoricoQualificacaoConversa"("empresaId", "negocioId", "createdAt");

-- CreateIndex
CREATE INDEX "HistoricoQualificacaoConversa_empresaId_autorId_createdAt_idx" ON "HistoricoQualificacaoConversa"("empresaId", "autorId", "createdAt");

-- CreateIndex
CREATE INDEX "PropostaComercial_empresaId_clienteId_status_idx" ON "PropostaComercial"("empresaId", "clienteId", "status");

-- CreateIndex
CREATE INDEX "PropostaComercial_empresaId_negocioId_status_idx" ON "PropostaComercial"("empresaId", "negocioId", "status");

-- CreateIndex
CREATE INDEX "PropostaComercial_empresaId_leadId_status_idx" ON "PropostaComercial"("empresaId", "leadId", "status");

-- CreateIndex
CREATE INDEX "PropostaComercial_empresaId_responsavelId_status_idx" ON "PropostaComercial"("empresaId", "responsavelId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PropostaComercial_empresaId_codigo_key" ON "PropostaComercial"("empresaId", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "PropostaComercial_empresaId_propostaOrigemId_versao_key" ON "PropostaComercial"("empresaId", "propostaOrigemId", "versao");

-- CreateIndex
CREATE INDEX "ItemPropostaComercial_propostaId_ordem_idx" ON "ItemPropostaComercial"("propostaId", "ordem");

-- CreateIndex
CREATE INDEX "HistoricoPropostaComercial_empresaId_propostaId_createdAt_idx" ON "HistoricoPropostaComercial"("empresaId", "propostaId", "createdAt");

-- CreateIndex
CREATE INDEX "HistoricoPropostaComercial_empresaId_autorId_createdAt_idx" ON "HistoricoPropostaComercial"("empresaId", "autorId", "createdAt");

-- CreateIndex
CREATE INDEX "EventoWebhook_empresaId_statusProcessamento_recebidoEm_idx" ON "EventoWebhook"("empresaId", "statusProcessamento", "recebidoEm");

-- CreateIndex
CREATE INDEX "EventoWebhook_empresaId_canalIntegracaoId_recebidoEm_idx" ON "EventoWebhook"("empresaId", "canalIntegracaoId", "recebidoEm");

-- CreateIndex
CREATE UNIQUE INDEX "EventoWebhook_empresaId_canalIntegracaoId_provedor_external_key" ON "EventoWebhook"("empresaId", "canalIntegracaoId", "provedor", "externalEventId");

-- CreateIndex
CREATE INDEX "AutomacaoRegra_empresaId_ativa_prioridade_idx" ON "AutomacaoRegra"("empresaId", "ativa", "prioridade");

-- CreateIndex
CREATE INDEX "AutomacaoRegra_empresaId_gatilho_ativa_idx" ON "AutomacaoRegra"("empresaId", "gatilho", "ativa");

-- CreateIndex
CREATE INDEX "AutomacaoRegra_empresaId_activatedAt_idx" ON "AutomacaoRegra"("empresaId", "activatedAt");

-- CreateIndex
CREATE INDEX "AutomacaoExecucao_empresaId_status_createdAt_idx" ON "AutomacaoExecucao"("empresaId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "AutomacaoExecucao_empresaId_entidadeTipo_entidadeId_idx" ON "AutomacaoExecucao"("empresaId", "entidadeTipo", "entidadeId");

-- CreateIndex
CREATE INDEX "AutomacaoExecucao_empresaId_leadId_idx" ON "AutomacaoExecucao"("empresaId", "leadId");

-- CreateIndex
CREATE INDEX "AutomacaoExecucao_empresaId_negocioId_idx" ON "AutomacaoExecucao"("empresaId", "negocioId");

-- CreateIndex
CREATE UNIQUE INDEX "AutomacaoExecucao_empresaId_regraId_occurrenceKey_key" ON "AutomacaoExecucao"("empresaId", "regraId", "occurrenceKey");

-- CreateIndex
CREATE UNIQUE INDEX "AutomacaoExecucao_empresaId_idempotencyKey_key" ON "AutomacaoExecucao"("empresaId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "AutomacaoAcaoJob_empresaId_status_nextAttemptAt_idx" ON "AutomacaoAcaoJob"("empresaId", "status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "AutomacaoAcaoJob_empresaId_execucaoId_indice_idx" ON "AutomacaoAcaoJob"("empresaId", "execucaoId", "indice");

-- CreateIndex
CREATE INDEX "AutomacaoAcaoJob_empresaId_leaseExpiresAt_idx" ON "AutomacaoAcaoJob"("empresaId", "leaseExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AutomacaoAcaoJob_empresaId_actionKey_key" ON "AutomacaoAcaoJob"("empresaId", "actionKey");

-- CreateIndex
CREATE UNIQUE INDEX "AutomacaoRoundRobinEstado_regraId_key" ON "AutomacaoRoundRobinEstado"("regraId");

-- CreateIndex
CREATE INDEX "AutomacaoRoundRobinEstado_empresaId_ultimoResponsavelId_idx" ON "AutomacaoRoundRobinEstado"("empresaId", "ultimoResponsavelId");

-- CreateIndex
CREATE UNIQUE INDEX "AutomacaoRoundRobinEstado_empresaId_regraId_key" ON "AutomacaoRoundRobinEstado"("empresaId", "regraId");

-- CreateIndex
CREATE INDEX "AutomacaoEventoInterno_empresaId_createdAt_idx" ON "AutomacaoEventoInterno"("empresaId", "createdAt");

-- CreateIndex
CREATE INDEX "AutomacaoEventoInterno_empresaId_leadId_idx" ON "AutomacaoEventoInterno"("empresaId", "leadId");

-- CreateIndex
CREATE INDEX "AutomacaoEventoInterno_empresaId_negocioId_idx" ON "AutomacaoEventoInterno"("empresaId", "negocioId");

-- CreateIndex
CREATE INDEX "AutomacaoEventoInterno_empresaId_acompanhamentoId_idx" ON "AutomacaoEventoInterno"("empresaId", "acompanhamentoId");

-- CreateIndex
CREATE UNIQUE INDEX "AutomacaoEventoInterno_empresaId_idempotencyKey_key" ON "AutomacaoEventoInterno"("empresaId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "EmpresaFuncionalidade_empresaId_habilitada_idx" ON "EmpresaFuncionalidade"("empresaId", "habilitada");

-- CreateIndex
CREATE INDEX "EmpresaFuncionalidade_habilitadoPorUsuarioId_idx" ON "EmpresaFuncionalidade"("habilitadoPorUsuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "EmpresaFuncionalidade_empresaId_chave_key" ON "EmpresaFuncionalidade"("empresaId", "chave");

-- CreateIndex
CREATE INDEX "AuditoriaFuncionalidade_empresaId_chave_createdAt_idx" ON "AuditoriaFuncionalidade"("empresaId", "chave", "createdAt");

-- CreateIndex
CREATE INDEX "AuditoriaFuncionalidade_funcionalidadeId_createdAt_idx" ON "AuditoriaFuncionalidade"("funcionalidadeId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditoriaFuncionalidade_usuarioId_createdAt_idx" ON "AuditoriaFuncionalidade"("usuarioId", "createdAt");

-- CreateIndex
CREATE INDEX "PlatformTenantAudit_tenantId_createdAt_idx" ON "PlatformTenantAudit"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "PlatformTenantAudit_actorUserId_createdAt_idx" ON "PlatformTenantAudit"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "PlatformTenantAudit_action_createdAt_idx" ON "PlatformTenantAudit"("action", "createdAt");

-- AddForeignKey
ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nota" ADD CONSTRAINT "Nota_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nota" ADD CONSTRAINT "Nota_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Produto" ADD CONSTRAINT "Produto_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "CategoriaProduto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentacaoEstoque" ADD CONSTRAINT "MovimentacaoEstoque_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Acompanhamento" ADD CONSTRAINT "Acompanhamento_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Acompanhamento" ADD CONSTRAINT "Acompanhamento_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Acompanhamento" ADD CONSTRAINT "Acompanhamento_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Acompanhamento" ADD CONSTRAINT "Acompanhamento_conversaCanalId_fkey" FOREIGN KEY ("conversaCanalId") REFERENCES "ConversaCanal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Acompanhamento" ADD CONSTRAINT "Acompanhamento_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Acompanhamento" ADD CONSTRAINT "Acompanhamento_propostaComercialId_fkey" FOREIGN KEY ("propostaComercialId") REFERENCES "PropostaComercial"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Acompanhamento" ADD CONSTRAINT "Acompanhamento_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Acompanhamento" ADD CONSTRAINT "Acompanhamento_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Acompanhamento" ADD CONSTRAINT "Acompanhamento_concluidoPorId_fkey" FOREIGN KEY ("concluidoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Acompanhamento" ADD CONSTRAINT "Acompanhamento_canceladoPorId_fkey" FOREIGN KEY ("canceladoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricoAcompanhamento" ADD CONSTRAINT "HistoricoAcompanhamento_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricoAcompanhamento" ADD CONSTRAINT "HistoricoAcompanhamento_acompanhamentoId_fkey" FOREIGN KEY ("acompanhamentoId") REFERENCES "Acompanhamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricoAcompanhamento" ADD CONSTRAINT "HistoricoAcompanhamento_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricoAcompanhamento" ADD CONSTRAINT "HistoricoAcompanhamento_responsavelAnteriorId_fkey" FOREIGN KEY ("responsavelAnteriorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricoAcompanhamento" ADD CONSTRAINT "HistoricoAcompanhamento_responsavelNovoId_fkey" FOREIGN KEY ("responsavelNovoId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegracaoOAuthState" ADD CONSTRAINT "IntegracaoOAuthState_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegracaoOAuthState" ADD CONSTRAINT "IntegracaoOAuthState_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Integracao" ADD CONSTRAINT "Integracao_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SincronizacaoIntegracao" ADD CONSTRAINT "SincronizacaoIntegracao_integracaoId_fkey" FOREIGN KEY ("integracaoId") REFERENCES "Integracao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SincronizacaoIntegracao" ADD CONSTRAINT "SincronizacaoIntegracao_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErroIntegracao" ADD CONSTRAINT "ErroIntegracao_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErroIntegracao" ADD CONSTRAINT "ErroIntegracao_integracaoId_fkey" FOREIGN KEY ("integracaoId") REFERENCES "Integracao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErroIntegracao" ADD CONSTRAINT "ErroIntegracao_sincronizacaoId_fkey" FOREIGN KEY ("sincronizacaoId") REFERENCES "SincronizacaoIntegracao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProdutoExterno" ADD CONSTRAINT "ProdutoExterno_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProdutoExterno" ADD CONSTRAINT "ProdutoExterno_integracaoId_fkey" FOREIGN KEY ("integracaoId") REFERENCES "Integracao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstoqueExterno" ADD CONSTRAINT "EstoqueExterno_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstoqueExterno" ADD CONSTRAINT "EstoqueExterno_integracaoId_fkey" FOREIGN KEY ("integracaoId") REFERENCES "Integracao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstoqueExterno" ADD CONSTRAINT "EstoqueExterno_produtoExternoId_fkey" FOREIGN KEY ("produtoExternoId") REFERENCES "ProdutoExterno"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrecoExterno" ADD CONSTRAINT "PrecoExterno_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrecoExterno" ADD CONSTRAINT "PrecoExterno_integracaoId_fkey" FOREIGN KEY ("integracaoId") REFERENCES "Integracao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrecoExterno" ADD CONSTRAINT "PrecoExterno_produtoExternoId_fkey" FOREIGN KEY ("produtoExternoId") REFERENCES "ProdutoExterno"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CondicaoPagamentoExterna" ADD CONSTRAINT "CondicaoPagamentoExterna_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CondicaoPagamentoExterna" ADD CONSTRAINT "CondicaoPagamentoExterna_integracaoId_fkey" FOREIGN KEY ("integracaoId") REFERENCES "Integracao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportacaoDados" ADD CONSTRAINT "ImportacaoDados_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportacaoDados" ADD CONSTRAINT "ImportacaoDados_integracaoId_fkey" FOREIGN KEY ("integracaoId") REFERENCES "Integracao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportacaoDados" ADD CONSTRAINT "ImportacaoDados_createdByUsuarioId_fkey" FOREIGN KEY ("createdByUsuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErroImportacao" ADD CONSTRAINT "ErroImportacao_importacaoId_fkey" FOREIGN KEY ("importacaoId") REFERENCES "ImportacaoDados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanalIntegracao" ADD CONSTRAINT "CanalIntegracao_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContatoCanal" ADD CONSTRAINT "ContatoCanal_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContatoCanal" ADD CONSTRAINT "ContatoCanal_canalIntegracaoId_fkey" FOREIGN KEY ("canalIntegracaoId") REFERENCES "CanalIntegracao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContatoCanal" ADD CONSTRAINT "ContatoCanal_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversaCanal" ADD CONSTRAINT "ConversaCanal_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversaCanal" ADD CONSTRAINT "ConversaCanal_canalIntegracaoId_fkey" FOREIGN KEY ("canalIntegracaoId") REFERENCES "CanalIntegracao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversaCanal" ADD CONSTRAINT "ConversaCanal_contatoCanalId_fkey" FOREIGN KEY ("contatoCanalId") REFERENCES "ContatoCanal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversaCanal" ADD CONSTRAINT "ConversaCanal_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversaCanal" ADD CONSTRAINT "ConversaCanal_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversaCanal" ADD CONSTRAINT "ConversaCanal_respostaReservadaPorId_fkey" FOREIGN KEY ("respostaReservadaPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MensagemCanal" ADD CONSTRAINT "MensagemCanal_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MensagemCanal" ADD CONSTRAINT "MensagemCanal_canalIntegracaoId_fkey" FOREIGN KEY ("canalIntegracaoId") REFERENCES "CanalIntegracao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MensagemCanal" ADD CONSTRAINT "MensagemCanal_conversaCanalId_fkey" FOREIGN KEY ("conversaCanalId") REFERENCES "ConversaCanal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MensagemCanal" ADD CONSTRAINT "MensagemCanal_autorUsuarioId_fkey" FOREIGN KEY ("autorUsuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Negocio" ADD CONSTRAINT "Negocio_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Negocio" ADD CONSTRAINT "Negocio_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Negocio" ADD CONSTRAINT "Negocio_legacyClienteId_fkey" FOREIGN KEY ("legacyClienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Negocio" ADD CONSTRAINT "Negocio_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Negocio" ADD CONSTRAINT "Negocio_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Negocio" ADD CONSTRAINT "Negocio_convertidoPorId_fkey" FOREIGN KEY ("convertidoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotaInternaConversa" ADD CONSTRAINT "NotaInternaConversa_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotaInternaConversa" ADD CONSTRAINT "NotaInternaConversa_conversaCanalId_fkey" FOREIGN KEY ("conversaCanalId") REFERENCES "ConversaCanal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotaInternaConversa" ADD CONSTRAINT "NotaInternaConversa_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricoAtribuicao" ADD CONSTRAINT "HistoricoAtribuicao_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricoAtribuicao" ADD CONSTRAINT "HistoricoAtribuicao_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricoAtribuicao" ADD CONSTRAINT "HistoricoAtribuicao_conversaCanalId_fkey" FOREIGN KEY ("conversaCanalId") REFERENCES "ConversaCanal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricoAtribuicao" ADD CONSTRAINT "HistoricoAtribuicao_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricoAtribuicao" ADD CONSTRAINT "HistoricoAtribuicao_responsavelAnteriorId_fkey" FOREIGN KEY ("responsavelAnteriorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricoAtribuicao" ADD CONSTRAINT "HistoricoAtribuicao_responsavelNovoId_fkey" FOREIGN KEY ("responsavelNovoId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricoAtribuicao" ADD CONSTRAINT "HistoricoAtribuicao_alteradoPorId_fkey" FOREIGN KEY ("alteradoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricoQualificacaoConversa" ADD CONSTRAINT "HistoricoQualificacaoConversa_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricoQualificacaoConversa" ADD CONSTRAINT "HistoricoQualificacaoConversa_conversaCanalId_fkey" FOREIGN KEY ("conversaCanalId") REFERENCES "ConversaCanal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricoQualificacaoConversa" ADD CONSTRAINT "HistoricoQualificacaoConversa_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricoQualificacaoConversa" ADD CONSTRAINT "HistoricoQualificacaoConversa_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricoQualificacaoConversa" ADD CONSTRAINT "HistoricoQualificacaoConversa_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricoQualificacaoConversa" ADD CONSTRAINT "HistoricoQualificacaoConversa_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropostaComercial" ADD CONSTRAINT "PropostaComercial_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropostaComercial" ADD CONSTRAINT "PropostaComercial_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropostaComercial" ADD CONSTRAINT "PropostaComercial_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropostaComercial" ADD CONSTRAINT "PropostaComercial_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropostaComercial" ADD CONSTRAINT "PropostaComercial_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropostaComercial" ADD CONSTRAINT "PropostaComercial_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropostaComercial" ADD CONSTRAINT "PropostaComercial_propostaOrigemId_fkey" FOREIGN KEY ("propostaOrigemId") REFERENCES "PropostaComercial"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemPropostaComercial" ADD CONSTRAINT "ItemPropostaComercial_propostaId_fkey" FOREIGN KEY ("propostaId") REFERENCES "PropostaComercial"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricoPropostaComercial" ADD CONSTRAINT "HistoricoPropostaComercial_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricoPropostaComercial" ADD CONSTRAINT "HistoricoPropostaComercial_propostaId_fkey" FOREIGN KEY ("propostaId") REFERENCES "PropostaComercial"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricoPropostaComercial" ADD CONSTRAINT "HistoricoPropostaComercial_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventoWebhook" ADD CONSTRAINT "EventoWebhook_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventoWebhook" ADD CONSTRAINT "EventoWebhook_canalIntegracaoId_fkey" FOREIGN KEY ("canalIntegracaoId") REFERENCES "CanalIntegracao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomacaoRegra" ADD CONSTRAINT "AutomacaoRegra_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomacaoRegra" ADD CONSTRAINT "AutomacaoRegra_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomacaoRegra" ADD CONSTRAINT "AutomacaoRegra_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomacaoExecucao" ADD CONSTRAINT "AutomacaoExecucao_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomacaoExecucao" ADD CONSTRAINT "AutomacaoExecucao_regraId_fkey" FOREIGN KEY ("regraId") REFERENCES "AutomacaoRegra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomacaoExecucao" ADD CONSTRAINT "AutomacaoExecucao_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomacaoExecucao" ADD CONSTRAINT "AutomacaoExecucao_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomacaoAcaoJob" ADD CONSTRAINT "AutomacaoAcaoJob_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomacaoAcaoJob" ADD CONSTRAINT "AutomacaoAcaoJob_execucaoId_fkey" FOREIGN KEY ("execucaoId") REFERENCES "AutomacaoExecucao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomacaoRoundRobinEstado" ADD CONSTRAINT "AutomacaoRoundRobinEstado_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomacaoRoundRobinEstado" ADD CONSTRAINT "AutomacaoRoundRobinEstado_regraId_fkey" FOREIGN KEY ("regraId") REFERENCES "AutomacaoRegra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomacaoEventoInterno" ADD CONSTRAINT "AutomacaoEventoInterno_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomacaoEventoInterno" ADD CONSTRAINT "AutomacaoEventoInterno_execucaoId_fkey" FOREIGN KEY ("execucaoId") REFERENCES "AutomacaoExecucao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomacaoEventoInterno" ADD CONSTRAINT "AutomacaoEventoInterno_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomacaoEventoInterno" ADD CONSTRAINT "AutomacaoEventoInterno_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomacaoEventoInterno" ADD CONSTRAINT "AutomacaoEventoInterno_acompanhamentoId_fkey" FOREIGN KEY ("acompanhamentoId") REFERENCES "Acompanhamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomacaoEventoInterno" ADD CONSTRAINT "AutomacaoEventoInterno_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmpresaFuncionalidade" ADD CONSTRAINT "EmpresaFuncionalidade_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmpresaFuncionalidade" ADD CONSTRAINT "EmpresaFuncionalidade_habilitadoPorUsuarioId_fkey" FOREIGN KEY ("habilitadoPorUsuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditoriaFuncionalidade" ADD CONSTRAINT "AuditoriaFuncionalidade_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditoriaFuncionalidade" ADD CONSTRAINT "AuditoriaFuncionalidade_funcionalidadeId_fkey" FOREIGN KEY ("funcionalidadeId") REFERENCES "EmpresaFuncionalidade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditoriaFuncionalidade" ADD CONSTRAINT "AuditoriaFuncionalidade_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformTenantAudit" ADD CONSTRAINT "PlatformTenantAudit_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformTenantAudit" ADD CONSTRAINT "PlatformTenantAudit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformTenantAudit" ADD CONSTRAINT "PlatformTenantAudit_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

