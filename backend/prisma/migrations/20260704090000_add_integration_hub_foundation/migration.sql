-- CreateTable
CREATE TABLE "Integracao" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "empresaId" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "modo" TEXT NOT NULL DEFAULT 'SOMENTE_LEITURA',
    "configuracaoJson" TEXT NOT NULL DEFAULT '{}',
    "credenciaisCriptografadas" TEXT,
    "ultimaSincronizacaoEm" DATETIME,
    "ultimoSucessoEm" DATETIME,
    "ultimoErroEm" DATETIME,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Integracao_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SincronizacaoIntegracao" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "integracaoId" INTEGER NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "origem" TEXT NOT NULL DEFAULT 'MANUAL',
    "iniciadaEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizadaEm" DATETIME,
    "itensRecebidos" INTEGER NOT NULL DEFAULT 0,
    "itensProcessados" INTEGER NOT NULL DEFAULT 0,
    "itensComErro" INTEGER NOT NULL DEFAULT 0,
    "mensagemErro" TEXT,
    "metadadosJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SincronizacaoIntegracao_integracaoId_fkey" FOREIGN KEY ("integracaoId") REFERENCES "Integracao" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SincronizacaoIntegracao_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ErroIntegracao" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "empresaId" INTEGER NOT NULL,
    "integracaoId" INTEGER NOT NULL,
    "sincronizacaoId" INTEGER,
    "codigo" TEXT NOT NULL,
    "mensagem" TEXT NOT NULL,
    "detalhesSanitizados" TEXT,
    "resolvido" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    CONSTRAINT "ErroIntegracao_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ErroIntegracao_integracaoId_fkey" FOREIGN KEY ("integracaoId") REFERENCES "Integracao" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ErroIntegracao_sincronizacaoId_fkey" FOREIGN KEY ("sincronizacaoId") REFERENCES "SincronizacaoIntegracao" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProdutoExterno" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
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
    "sincronizadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProdutoExterno_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProdutoExterno_integracaoId_fkey" FOREIGN KEY ("integracaoId") REFERENCES "Integracao" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EstoqueExterno" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "empresaId" INTEGER NOT NULL,
    "integracaoId" INTEGER NOT NULL,
    "produtoExternoId" INTEGER NOT NULL,
    "localExternalId" TEXT,
    "localNome" TEXT,
    "quantidade" DECIMAL NOT NULL DEFAULT 0,
    "reservado" DECIMAL,
    "disponivel" DECIMAL NOT NULL DEFAULT 0,
    "sincronizadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EstoqueExterno_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EstoqueExterno_integracaoId_fkey" FOREIGN KEY ("integracaoId") REFERENCES "Integracao" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EstoqueExterno_produtoExternoId_fkey" FOREIGN KEY ("produtoExternoId") REFERENCES "ProdutoExterno" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PrecoExterno" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "empresaId" INTEGER NOT NULL,
    "integracaoId" INTEGER NOT NULL,
    "produtoExternoId" INTEGER NOT NULL,
    "tabela" TEXT,
    "precoCentavos" INTEGER NOT NULL,
    "precoPromocionalCentavos" INTEGER,
    "inicioPromocao" DATETIME,
    "fimPromocao" DATETIME,
    "sincronizadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PrecoExterno_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PrecoExterno_integracaoId_fkey" FOREIGN KEY ("integracaoId") REFERENCES "Integracao" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PrecoExterno_produtoExternoId_fkey" FOREIGN KEY ("produtoExternoId") REFERENCES "ProdutoExterno" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CondicaoPagamentoExterna" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "empresaId" INTEGER NOT NULL,
    "integracaoId" INTEGER NOT NULL,
    "externalId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "parcelas" INTEGER,
    "valorMinimoCentavos" INTEGER,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "sincronizadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CondicaoPagamentoExterna_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CondicaoPagamentoExterna_integracaoId_fkey" FOREIGN KEY ("integracaoId") REFERENCES "Integracao" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ImportacaoDados" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "empresaId" INTEGER NOT NULL,
    "integracaoId" INTEGER,
    "formato" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ENVIADO',
    "nomeArquivo" TEXT NOT NULL,
    "tamanhoBytes" INTEGER NOT NULL,
    "hashArquivo" TEXT NOT NULL,
    "tipoEntidade" TEXT NOT NULL,
    "mapeamentoJson" TEXT,
    "totalLinhas" INTEGER NOT NULL DEFAULT 0,
    "linhasValidas" INTEGER NOT NULL DEFAULT 0,
    "linhasComErro" INTEGER NOT NULL DEFAULT 0,
    "iniciadaEm" DATETIME,
    "finalizadaEm" DATETIME,
    "createdByUsuarioId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ImportacaoDados_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ImportacaoDados_integracaoId_fkey" FOREIGN KEY ("integracaoId") REFERENCES "Integracao" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ImportacaoDados_createdByUsuarioId_fkey" FOREIGN KEY ("createdByUsuarioId") REFERENCES "Usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ErroImportacao" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "importacaoId" INTEGER NOT NULL,
    "linha" INTEGER,
    "campo" TEXT,
    "codigo" TEXT NOT NULL,
    "mensagem" TEXT NOT NULL,
    "valorSanitizado" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ErroImportacao_importacaoId_fkey" FOREIGN KEY ("importacaoId") REFERENCES "ImportacaoDados" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Integracao_empresaId_idx" ON "Integracao"("empresaId");
CREATE INDEX "Integracao_empresaId_status_idx" ON "Integracao"("empresaId", "status");
CREATE INDEX "Integracao_empresaId_tipo_idx" ON "Integracao"("empresaId", "tipo");
CREATE INDEX "Integracao_ativo_idx" ON "Integracao"("ativo");
CREATE INDEX "SincronizacaoIntegracao_empresaId_idx" ON "SincronizacaoIntegracao"("empresaId");
CREATE INDEX "SincronizacaoIntegracao_integracaoId_idx" ON "SincronizacaoIntegracao"("integracaoId");
CREATE INDEX "SincronizacaoIntegracao_status_idx" ON "SincronizacaoIntegracao"("status");
CREATE INDEX "SincronizacaoIntegracao_origem_idx" ON "SincronizacaoIntegracao"("origem");
CREATE INDEX "SincronizacaoIntegracao_iniciadaEm_idx" ON "SincronizacaoIntegracao"("iniciadaEm");
CREATE INDEX "ErroIntegracao_empresaId_idx" ON "ErroIntegracao"("empresaId");
CREATE INDEX "ErroIntegracao_integracaoId_idx" ON "ErroIntegracao"("integracaoId");
CREATE INDEX "ErroIntegracao_sincronizacaoId_idx" ON "ErroIntegracao"("sincronizacaoId");
CREATE INDEX "ErroIntegracao_resolvido_idx" ON "ErroIntegracao"("resolvido");
CREATE INDEX "ErroIntegracao_codigo_idx" ON "ErroIntegracao"("codigo");
CREATE UNIQUE INDEX "ProdutoExterno_integracaoId_externalId_key" ON "ProdutoExterno"("integracaoId", "externalId");
CREATE INDEX "ProdutoExterno_empresaId_idx" ON "ProdutoExterno"("empresaId");
CREATE INDEX "ProdutoExterno_integracaoId_idx" ON "ProdutoExterno"("integracaoId");
CREATE INDEX "ProdutoExterno_sku_idx" ON "ProdutoExterno"("sku");
CREATE INDEX "ProdutoExterno_codigoBarras_idx" ON "ProdutoExterno"("codigoBarras");
CREATE INDEX "ProdutoExterno_nome_idx" ON "ProdutoExterno"("nome");
CREATE INDEX "ProdutoExterno_categoria_idx" ON "ProdutoExterno"("categoria");
CREATE INDEX "EstoqueExterno_empresaId_idx" ON "EstoqueExterno"("empresaId");
CREATE INDEX "EstoqueExterno_integracaoId_idx" ON "EstoqueExterno"("integracaoId");
CREATE INDEX "EstoqueExterno_produtoExternoId_idx" ON "EstoqueExterno"("produtoExternoId");
CREATE INDEX "EstoqueExterno_localExternalId_idx" ON "EstoqueExterno"("localExternalId");
CREATE INDEX "PrecoExterno_empresaId_idx" ON "PrecoExterno"("empresaId");
CREATE INDEX "PrecoExterno_integracaoId_idx" ON "PrecoExterno"("integracaoId");
CREATE INDEX "PrecoExterno_produtoExternoId_idx" ON "PrecoExterno"("produtoExternoId");
CREATE INDEX "PrecoExterno_tabela_idx" ON "PrecoExterno"("tabela");
CREATE UNIQUE INDEX "CondicaoPagamentoExterna_integracaoId_externalId_key" ON "CondicaoPagamentoExterna"("integracaoId", "externalId");
CREATE INDEX "CondicaoPagamentoExterna_empresaId_idx" ON "CondicaoPagamentoExterna"("empresaId");
CREATE INDEX "CondicaoPagamentoExterna_integracaoId_idx" ON "CondicaoPagamentoExterna"("integracaoId");
CREATE INDEX "CondicaoPagamentoExterna_ativo_idx" ON "CondicaoPagamentoExterna"("ativo");
CREATE INDEX "ImportacaoDados_empresaId_idx" ON "ImportacaoDados"("empresaId");
CREATE INDEX "ImportacaoDados_integracaoId_idx" ON "ImportacaoDados"("integracaoId");
CREATE INDEX "ImportacaoDados_createdByUsuarioId_idx" ON "ImportacaoDados"("createdByUsuarioId");
CREATE INDEX "ImportacaoDados_status_idx" ON "ImportacaoDados"("status");
CREATE INDEX "ImportacaoDados_formato_idx" ON "ImportacaoDados"("formato");
CREATE INDEX "ImportacaoDados_hashArquivo_idx" ON "ImportacaoDados"("hashArquivo");
CREATE INDEX "ErroImportacao_importacaoId_idx" ON "ErroImportacao"("importacaoId");
CREATE INDEX "ErroImportacao_codigo_idx" ON "ErroImportacao"("codigo");
