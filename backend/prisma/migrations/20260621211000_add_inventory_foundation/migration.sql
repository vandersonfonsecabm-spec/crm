-- CreateTable
CREATE TABLE "CategoriaProduto" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Produto" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nome" TEXT NOT NULL,
    "codigo" TEXT,
    "descricao" TEXT,
    "categoriaId" INTEGER,
    "unidadeMedida" TEXT NOT NULL DEFAULT 'UN',
    "quantidadeAtual" DECIMAL NOT NULL DEFAULT 0,
    "estoqueMinimo" DECIMAL NOT NULL DEFAULT 0,
    "precoCustoCentavos" INTEGER NOT NULL DEFAULT 0,
    "precoVendaCentavos" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Produto_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "CategoriaProduto" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MovimentacaoEstoque" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "produtoId" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "quantidade" DECIMAL NOT NULL,
    "quantidadeAnterior" DECIMAL NOT NULL,
    "quantidadePosterior" DECIMAL NOT NULL,
    "motivo" TEXT,
    "observacao" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MovimentacaoEstoque_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

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
