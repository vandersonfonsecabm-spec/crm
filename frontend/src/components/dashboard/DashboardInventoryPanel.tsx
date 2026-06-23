import { AlertTriangle, Boxes, CheckCircle2, Edit3, Layers3, Loader2, Package, Plus, Search, SlidersHorizontal, TrendingDown, TrendingUp, Wallet, Warehouse, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  createProduto,
  createAjusteEstoque,
  createEntradaEstoque,
  createSaidaEstoque,
  fetchCategoriasProdutos,
  fetchEstoqueResumo,
  fetchProduto,
  fetchProdutos,
  updateProduto,
  type ApiCategoriaProduto,
  type ApiMovimentacaoEstoque,
  type ApiProduto,
  type ApiResumoEstoque,
} from "../../services/crmApi";
import MetricCard from "./MetricCard";

const PRODUCT_PAGE_SIZE = 5;
const UNITS = ["Todos", "UN", "KG", "L", "SC", "TON"];
const PRODUCT_UNITS = [
  { value: "UN", label: "UN - Unidade" },
  { value: "KG", label: "KG - Quilograma" },
  { value: "L", label: "L - Litro" },
  { value: "SC", label: "SC - Saca" },
  { value: "TON", label: "TON - Tonelada" },
];

type InventoryStatus = "idle" | "loading" | "success" | "error";
type InventoryAction = "entrada" | "saida" | "ajuste";
type ProductForm = {
  nome: string;
  codigo: string;
  descricao: string;
  categoriaId: string;
  unidadeMedida: string;
  estoqueMinimo: string;
  precoCusto: string;
  precoVenda: string;
  ativo: boolean;
};

const initialProductForm: ProductForm = {
  nome: "",
  codigo: "",
  descricao: "",
  categoriaId: "",
  unidadeMedida: "KG",
  estoqueMinimo: "0",
  precoCusto: "",
  precoVenda: "",
  ativo: true,
};

type MovementForm = {
  quantidade: string;
  novaQuantidade: string;
  motivo: string;
  observacao: string;
};

const initialMovementForm: MovementForm = {
  quantidade: "",
  novaQuantidade: "",
  motivo: "",
  observacao: "",
};

export default function DashboardInventoryPanel() {
  const [summary, setSummary] = useState<ApiResumoEstoque | null>(null);
  const [categories, setCategories] = useState<ApiCategoriaProduto[]>([]);
  const [products, setProducts] = useState<ApiProduto[]>([]);
  const [movements, setMovements] = useState<ApiMovimentacaoEstoque[]>([]);
  const [productTotal, setProductTotal] = useState(0);
  const [productPage, setProductPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<"todos" | "ativos" | "inativos">("todos");
  const [unitFilter, setUnitFilter] = useState("Todos");
  const [categoryFilter, setCategoryFilter] = useState("Todos");
  const [stockFilter, setStockFilter] = useState<"todos" | "baixo">("todos");
  const [status, setStatus] = useState<InventoryStatus>("idle");
  const [refreshKey, setRefreshKey] = useState(0);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [productForm, setProductForm] = useState<ProductForm>(initialProductForm);
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<ApiProduto | null>(null);
  const [isLoadingProduct, setIsLoadingProduct] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ApiProduto | null>(null);
  const [movementProduct, setMovementProduct] = useState<ApiProduto | null>(null);
  const [movementAction, setMovementAction] = useState<InventoryAction | null>(null);
  const [movementForm, setMovementForm] = useState<MovementForm>(initialMovementForm);

  const totalPages = Math.max(1, Math.ceil(productTotal / PRODUCT_PAGE_SIZE));

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setProductPage(1);
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    let ignore = false;

    async function loadInventory() {
      setStatus("loading");

      try {
        const ativo =
          activeFilter === "ativos" ? true : activeFilter === "inativos" ? false : null;
        const categoriaId = categoryFilter === "Todos" ? undefined : Number(categoryFilter);

        const [summaryData, productsData] = await Promise.all([
          fetchEstoqueResumo(),
          fetchProdutos({
            busca: debouncedSearch,
            ativo,
            categoriaId,
            unidadeMedida: unitFilter === "Todos" ? undefined : unitFilter,
            estoqueBaixo: stockFilter === "baixo" ? true : undefined,
            page: productPage,
            limit: PRODUCT_PAGE_SIZE,
          }),
        ]);
        const categoriesData = await fetchCategoriasProdutos({ ativo: true, limit: 100 }).catch(() => ({
          data: [] as ApiCategoriaProduto[],
          pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
        }));

        if (ignore) return;

        setSummary(summaryData);
        setCategories(categoriesData.data);
        setProducts(productsData.data);
        setProductTotal(productsData.pagination.total);
        setMovements(summaryData.ultimasMovimentacoes.slice(0, 5));
        setStatus("success");
      } catch (error) {
        if (ignore) return;
        console.error("Falha ao carregar estoque", error);
        setStatus("error");
      }
    }

    void loadInventory();

    return () => {
      ignore = true;
    };
  }, [activeFilter, categoryFilter, debouncedSearch, productPage, refreshKey, stockFilter, unitFilter]);

  const isLoading = status === "loading" || status === "idle";
  const isError = status === "error";
  const hasProducts = products.length > 0;
  const hasMovements = movements.length > 0;

  const summaryCards = useMemo(
    () => [
      {
        title: "Produtos ativos",
        value: summary?.indicadores.produtosAtivos ?? 0,
        caption: "Itens disponiveis",
        icon: <Package size={15} />,
        tone: "pipeline" as const,
      },
      {
        title: "Com estoque",
        value: summary?.indicadores.produtosComEstoque ?? 0,
        caption: "Saldo positivo",
        icon: <CheckCircle2 size={15} />,
        tone: "revenue" as const,
      },
      {
        title: "Estoque baixo",
        value: summary?.indicadores.produtosComEstoqueBaixo ?? 0,
        caption: "Abaixo do minimo",
        icon: <AlertTriangle size={15} />,
        tone: "forecast" as const,
      },
      {
        title: "Sem estoque",
        value: summary?.indicadores.produtosSemEstoque ?? 0,
        caption: "Saldo zerado",
        icon: <Boxes size={15} />,
        tone: "risk" as const,
      },
      {
        title: "Categorias ativas",
        value: summary?.indicadores.categoriasAtivas ?? 0,
        caption: "Grupos em uso",
        icon: <Layers3 size={15} />,
        tone: "neutral" as const,
      },
      {
        title: "Custo em estoque",
        value: formatCurrency(Number(summary?.indicadores.valorTotalCustoCentavos ?? 0)),
        caption: "Valor de custo",
        icon: <Wallet size={15} />,
        tone: "revenue" as const,
      },
      {
        title: "Venda potencial",
        value: formatCurrency(Number(summary?.indicadores.valorTotalVendaCentavos ?? 0)),
        caption: "Valor de venda",
        icon: <Wallet size={15} />,
        tone: "pipeline" as const,
      },
    ],
    [summary],
  );

  async function handleCreateProduct() {
    setFormError("");

    const validation = validateProductForm(productForm);
    if (validation) {
      setFormError(validation);
      return;
    }

    setIsSubmitting(true);

    try {
      await createProduto({
        nome: productForm.nome.trim(),
        codigo: productForm.codigo.trim() || undefined,
        descricao: productForm.descricao.trim() || undefined,
        categoriaId: productForm.categoriaId ? Number(productForm.categoriaId) : undefined,
        unidadeMedida: productForm.unidadeMedida,
        estoqueMinimo: normalizeDecimalInput(productForm.estoqueMinimo),
        precoCustoCentavos: parseMoneyToCents(productForm.precoCusto),
        precoVendaCentavos: parseMoneyToCents(productForm.precoVenda),
      });

      setShowCreateModal(false);
      setProductForm(initialProductForm);
      setProductPage(1);
      setRefreshKey((current) => current + 1);
      setToast("Produto cadastrado com sucesso.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      setFormError(toFriendlyProductError(message));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function openProductDetails(productId: number) {
    setIsLoadingProduct(true);

    try {
      const product = await fetchProduto(productId);
      setSelectedProduct(product);
    } catch (error) {
      console.error("Falha ao carregar produto", error);
      setToast("Nao foi possivel abrir o produto agora.");
    } finally {
      setIsLoadingProduct(false);
    }
  }

  function openEditProduct(product: ApiProduto) {
    setProductForm(productToForm(product));
    setFormError("");
    setEditingProduct(product);
  }

  async function handleUpdateProduct() {
    if (!editingProduct) return;

    setFormError("");
    const validation = validateProductForm(productForm);
    if (validation) {
      setFormError(validation);
      return;
    }

    setIsSubmitting(true);

    try {
      const updated = await updateProduto(editingProduct.id, {
        nome: productForm.nome.trim(),
        codigo: productForm.codigo.trim() || undefined,
        descricao: productForm.descricao.trim() || undefined,
        categoriaId: productForm.categoriaId ? Number(productForm.categoriaId) : undefined,
        unidadeMedida: productForm.unidadeMedida,
        estoqueMinimo: normalizeDecimalInput(productForm.estoqueMinimo),
        precoCustoCentavos: parseMoneyToCents(productForm.precoCusto),
        precoVendaCentavos: parseMoneyToCents(productForm.precoVenda),
        ativo: productForm.ativo,
      });

      const detailed = await fetchProduto(updated.id);
      setEditingProduct(null);
      setSelectedProduct(detailed);
      setRefreshKey((current) => current + 1);
      setToast("Produto atualizado com sucesso.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      setFormError(toFriendlyProductError(message));
    } finally {
      setIsSubmitting(false);
    }
  }

  function openMovementModal(product: ApiProduto, action: InventoryAction) {
    if (!product.ativo) {
      setToast("Ative o produto para realizar movimentacoes.");
      return;
    }

    setMovementProduct(product);
    setMovementAction(action);
    setMovementForm(initialMovementForm);
    setFormError("");
  }

  async function handleMovementSubmit() {
    if (!movementProduct || !movementAction) return;

    const validation = validateMovementForm(movementForm, movementProduct, movementAction);
    if (validation) {
      setFormError(validation);
      return;
    }

    setIsSubmitting(true);

    try {
      const payloadBase = {
        produtoId: movementProduct.id,
        motivo: movementForm.motivo.trim() || undefined,
        observacao: movementForm.observacao.trim() || undefined,
      };
      const response =
        movementAction === "entrada"
          ? await createEntradaEstoque({
              ...payloadBase,
              quantidade: normalizeDecimalInput(movementForm.quantidade),
            })
          : movementAction === "saida"
            ? await createSaidaEstoque({
                ...payloadBase,
                quantidade: normalizeDecimalInput(movementForm.quantidade),
              })
            : await createAjusteEstoque({
                ...payloadBase,
                motivo: movementForm.motivo.trim(),
                novaQuantidade: normalizeDecimalInput(movementForm.novaQuantidade),
              });

      const detailed = await fetchProduto(response.produto.id);
      setMovementProduct(null);
      setMovementAction(null);
      setMovementForm(initialMovementForm);
      setSelectedProduct(detailed);
      setRefreshKey((current) => current + 1);
      setToast(movementSuccessMessage(movementAction));
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      setFormError(toFriendlyMovementError(message));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isError) {
    return (
      <section className="premium-panel rounded-2xl p-5">
        <div className="flex max-w-xl items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-rose-300/20 bg-rose-300/[0.06] text-rose-100">
            <AlertTriangle size={16} />
          </div>

          <div>
            <p className="text-sm font-semibold text-white">Nao foi possivel carregar o estoque agora.</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Verifique a conexao e tente novamente em instantes.
            </p>
            <button
              className="premium-ghost mt-4 rounded-xl px-3 py-2 text-xs font-semibold text-slate-200"
              onClick={() => setRefreshKey((current) => current + 1)}
              type="button"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 rounded-2xl border border-teal-300/20 bg-slate-950/95 px-4 py-3 text-xs font-semibold text-teal-100 shadow-2xl">
          {toast}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-7">
        {summaryCards.map((card) => (
          <MetricCard
            key={card.title}
            title={card.title}
            value={isLoading ? "..." : card.value}
            caption={card.caption}
            icon={card.icon}
            tone={card.tone}
            compact
          />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="premium-panel min-w-0 rounded-2xl p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-semibold text-white">Produtos</p>
              <p className="mt-1 text-xs text-slate-500">Saldos, estoque minimo e status da carteira de itens.</p>
            </div>

            <div className="flex flex-col gap-2 xl:items-end">
              <button
                className="premium-button inline-flex h-9 items-center justify-center gap-2 rounded-xl px-3 text-xs font-semibold transition hover:-translate-y-px"
                onClick={() => {
                  setProductForm(initialProductForm);
                  setFormError("");
                  setShowCreateModal(true);
                }}
                type="button"
              >
                <Plus size={14} />
                Novo produto
              </button>

            <div className="grid gap-2 sm:grid-cols-2 xl:w-[620px] xl:grid-cols-[minmax(0,1fr)_120px_120px_105px]">
              <label className="premium-ghost flex h-10 min-w-0 items-center gap-2 rounded-xl px-3 text-xs text-slate-400">
                <Search size={14} className="shrink-0" />
                <input
                  className="min-w-0 flex-1 bg-transparent text-xs text-slate-100 outline-none placeholder:text-slate-600"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar nome ou codigo"
                  value={search}
                />
              </label>

              <select
                className="premium-ghost h-10 rounded-xl px-3 text-xs text-slate-200 outline-none"
                onChange={(event) => {
                  setActiveFilter(event.target.value as typeof activeFilter);
                  setProductPage(1);
                }}
                value={activeFilter}
              >
                <option value="todos">Todos</option>
                <option value="ativos">Ativos</option>
                <option value="inativos">Inativos</option>
              </select>

              <select
                className="premium-ghost h-10 rounded-xl px-3 text-xs text-slate-200 outline-none"
                onChange={(event) => {
                  setCategoryFilter(event.target.value);
                  setProductPage(1);
                }}
                value={categoryFilter}
              >
                <option value="Todos">Categorias</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.nome}
                  </option>
                ))}
              </select>

              <select
                className="premium-ghost h-10 rounded-xl px-3 text-xs text-slate-200 outline-none"
                onChange={(event) => {
                  setUnitFilter(event.target.value);
                  setProductPage(1);
                }}
                value={unitFilter}
              >
                {UNITS.map((unit) => (
                  <option key={unit} value={unit}>
                  {unit}
                  </option>
                ))}
              </select>

              <select
                className="premium-ghost h-10 rounded-xl px-3 text-xs text-slate-200 outline-none sm:col-span-2 xl:col-span-1"
                onChange={(event) => {
                  setStockFilter(event.target.value as typeof stockFilter);
                  setProductPage(1);
                }}
                value={stockFilter}
              >
                <option value="todos">Todos saldos</option>
                <option value="baixo">Estoque baixo</option>
              </select>
            </div>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {isLoading && (
              <>
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="h-20 animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]" />
                ))}
              </>
            )}

            {!isLoading && !hasProducts && (
              <EmptyState
                icon={<Warehouse size={17} />}
                title="Nenhum produto cadastrado"
                text="Os produtos e seus saldos aparecerao aqui."
              />
            )}

            {!isLoading &&
              products.map((product) => (
                <ProductRow key={product.id} product={product} onOpen={() => openProductDetails(product.id)} />
              ))}
          </div>

          <div className="mt-4 flex flex-col gap-2 border-t border-white/[0.06] pt-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <span>
              {productTotal} produto{productTotal === 1 ? "" : "s"} encontrado{productTotal === 1 ? "" : "s"}
            </span>
            <div className="flex items-center gap-2">
              <button
                className="premium-ghost rounded-xl px-3 py-2 text-xs text-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={productPage <= 1}
                onClick={() => setProductPage((current) => Math.max(1, current - 1))}
                type="button"
              >
                Anterior
              </button>
              <span className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2 text-[11px] text-slate-400">
                {productPage}/{totalPages}
              </span>
              <button
                className="premium-ghost rounded-xl px-3 py-2 text-xs text-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={productPage >= totalPages}
                onClick={() => setProductPage((current) => Math.min(totalPages, current + 1))}
                type="button"
              >
                Proxima
              </button>
            </div>
          </div>
        </div>

        <div className="premium-panel min-w-0 rounded-2xl p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">Movimentacoes recentes</p>
              <p className="mt-1 text-xs text-slate-500">Ultimos ajustes registrados na operacao.</p>
            </div>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-500/16 bg-slate-900/55 text-slate-200">
              <SlidersHorizontal size={15} />
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {isLoading && (
              <>
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="h-16 animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]" />
                ))}
              </>
            )}

            {!isLoading && !hasMovements && (
              <EmptyState
                icon={<Boxes size={17} />}
                title="Nenhuma movimentacao registrada"
                text="Entradas, saidas e ajustes aparecerao aqui."
              />
            )}

            {!isLoading &&
              movements.map((movement) => (
                <MovementRow key={movement.id} movement={movement} />
              ))}
          </div>
        </div>
      </div>

      {showCreateModal && (
        <ProductCreateModal
          categories={categories}
          form={productForm}
          error={formError}
          isSubmitting={isSubmitting}
          setForm={setProductForm}
          onClose={() => {
            if (isSubmitting) return;
            setShowCreateModal(false);
            setFormError("");
          }}
          onSubmit={handleCreateProduct}
        />
      )}

      {selectedProduct && (
        <ProductDetailsDrawer
          product={selectedProduct}
          isLoading={isLoadingProduct}
          onClose={() => setSelectedProduct(null)}
          onEdit={() => openEditProduct(selectedProduct)}
          onMovement={(action) => openMovementModal(selectedProduct, action)}
        />
      )}

      {editingProduct && (
        <ProductCreateModal
          categories={categories}
          form={productForm}
          error={formError}
          isSubmitting={isSubmitting}
          setForm={setProductForm}
          onClose={() => {
            if (isSubmitting) return;
            setEditingProduct(null);
            setFormError("");
          }}
          onSubmit={handleUpdateProduct}
          title="Editar produto"
          submitLabel="Salvar produto"
          showActiveToggle
        />
      )}

      {movementProduct && movementAction && (
        <StockMovementModal
          action={movementAction}
          product={movementProduct}
          form={movementForm}
          error={formError}
          isSubmitting={isSubmitting}
          setForm={setMovementForm}
          onClose={() => {
            if (isSubmitting) return;
            setMovementProduct(null);
            setMovementAction(null);
            setFormError("");
          }}
          onSubmit={handleMovementSubmit}
        />
      )}
    </section>
  );
}

function ProductCreateModal({
  categories,
  form,
  error,
  isSubmitting,
  setForm,
  onClose,
  onSubmit,
  title = "Novo produto",
  submitLabel = "Cadastrar produto",
  showActiveToggle = false,
}: {
  categories: ApiCategoriaProduto[];
  form: ProductForm;
  error: string;
  isSubmitting: boolean;
  setForm: (form: ProductForm) => void;
  onClose: () => void;
  onSubmit: () => void;
  title?: string;
  submitLabel?: string;
  showActiveToggle?: boolean;
}) {
  const fieldBaseClass =
    "w-full rounded-xl border border-slate-500/16 bg-slate-950/25 px-3 py-2 text-sm text-slate-100 outline-none transition-all duration-200 placeholder:text-slate-600 hover:border-slate-400/24 hover:bg-slate-900/55 focus:border-teal-300/28 focus:bg-slate-900/70 disabled:cursor-not-allowed disabled:opacity-60";
  const fieldLabelClass = "mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="saas-panel max-h-[calc(100vh-32px)] w-full max-w-2xl overflow-y-auto rounded-2xl p-4 text-white shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold">{title}</p>
            <p className="mt-1 text-[11px] text-slate-500">
              Cadastre o item para acompanhar saldos, estoque minimo e movimentacoes.
            </p>
          </div>

          <button
            className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-800/70 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isSubmitting}
            onClick={onClose}
            type="button"
          >
            <X size={15} />
          </button>
        </div>

        <div className="saas-card grid gap-3 rounded-2xl p-3 md:grid-cols-2">
          <Field label="Nome do produto" labelClass={fieldLabelClass}>
            <input
              className={fieldBaseClass}
              disabled={isSubmitting}
              onChange={(event) => setForm({ ...form, nome: event.target.value })}
              placeholder="Ex: Fertilizante NPK 10-10-10"
              value={form.nome}
            />
          </Field>

          <Field label="Codigo" labelClass={fieldLabelClass}>
            <input
              className={fieldBaseClass}
              disabled={isSubmitting}
              onChange={(event) => setForm({ ...form, codigo: event.target.value })}
              placeholder="Ex: NPK-101010"
              value={form.codigo}
            />
          </Field>

          <Field label="Categoria" labelClass={fieldLabelClass}>
            <select
              className={fieldBaseClass}
              disabled={isSubmitting}
              onChange={(event) => setForm({ ...form, categoriaId: event.target.value })}
              value={form.categoriaId}
            >
              <option value="">Sem categoria</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.nome}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Unidade de medida" labelClass={fieldLabelClass}>
            <select
              className={fieldBaseClass}
              disabled={isSubmitting}
              onChange={(event) => setForm({ ...form, unidadeMedida: event.target.value })}
              value={form.unidadeMedida}
            >
              {PRODUCT_UNITS.map((unit) => (
                <option key={unit.value} value={unit.value}>
                  {unit.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Estoque minimo" labelClass={fieldLabelClass}>
            <input
              className={fieldBaseClass}
              disabled={isSubmitting}
              inputMode="decimal"
              onChange={(event) => setForm({ ...form, estoqueMinimo: event.target.value })}
              placeholder="Ex: 10 ou 10,5"
              value={form.estoqueMinimo}
            />
          </Field>

          <Field label="Preco de custo" labelClass={fieldLabelClass}>
            <input
              className={fieldBaseClass}
              disabled={isSubmitting}
              inputMode="decimal"
              onChange={(event) => setForm({ ...form, precoCusto: event.target.value })}
              placeholder="Ex: 125,50"
              value={form.precoCusto}
            />
          </Field>

          <Field label="Preco de venda" labelClass={fieldLabelClass}>
            <input
              className={fieldBaseClass}
              disabled={isSubmitting}
              inputMode="decimal"
              onChange={(event) => setForm({ ...form, precoVenda: event.target.value })}
              placeholder="Ex: 165,00"
              value={form.precoVenda}
            />
          </Field>

          <Field label="Descricao" labelClass={fieldLabelClass} wide>
            <textarea
              className={`${fieldBaseClass} min-h-[76px] resize-none`}
              disabled={isSubmitting}
              onChange={(event) => setForm({ ...form, descricao: event.target.value })}
              placeholder="Descricao curta do produto"
              value={form.descricao}
            />
          </Field>

          {showActiveToggle && (
            <div className="md:col-span-2">
              <label className="inline-flex items-center gap-2 rounded-xl border border-slate-500/16 bg-slate-950/25 px-3 py-2 text-xs text-slate-300">
                <input
                  checked={form.ativo}
                  className="h-4 w-4 accent-teal-300"
                  disabled={isSubmitting}
                  onChange={(event) => setForm({ ...form, ativo: event.target.checked })}
                  type="checkbox"
                />
                Produto ativo
              </label>
            </div>
          )}
        </div>

        {error && (
          <div className="mt-3 rounded-xl border border-rose-300/20 bg-rose-300/[0.055] px-3 py-2 text-xs text-rose-100">
            {error}
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            className="rounded-xl border border-slate-500/16 bg-slate-950/25 px-3 py-2 text-xs text-slate-300 transition hover:border-slate-400/24 hover:bg-slate-900/70 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isSubmitting}
            onClick={onClose}
            type="button"
          >
            Cancelar
          </button>

          <button
            className="premium-button inline-flex min-w-32 items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting}
            onClick={onSubmit}
            type="button"
          >
            {isSubmitting && <Loader2 size={13} className="animate-spin" />}
            {isSubmitting ? "Salvando" : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  labelClass,
  children,
  wide = false,
}: {
  label: string;
  labelClass: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "md:col-span-2" : ""}>
      <label className={labelClass}>{label}</label>
      {children}
    </div>
  );
}

function ProductDetailsDrawer({
  product,
  isLoading,
  onClose,
  onEdit,
  onMovement,
}: {
  product: ApiProduto;
  isLoading: boolean;
  onClose: () => void;
  onEdit: () => void;
  onMovement: (action: InventoryAction) => void;
}) {
  const recentMovements = product.ultimasMovimentacoes ?? [];

  return (
    <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-slate-700/50 bg-[#070b12]/96 text-white shadow-2xl backdrop-blur-xl">
      <div className="border-b border-white/[0.07] p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">{product.nome}</p>
            <p className="mt-1 truncate text-[11px] text-slate-500">
              {product.codigo || "Sem codigo"} - {product.categoria?.nome || "Sem categoria"}
            </p>
          </div>
          <button className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-800/70 hover:text-slate-200" onClick={onClose} type="button">
            <X size={15} />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {isLoading && <div className="h-20 animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]" />}

        <section className="saas-card rounded-2xl p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <InfoCell label="Situacao" value={stockLabel(product)} tone={stockTone(product)} />
            <InfoCell label="Status" value={product.ativo ? "Ativo" : "Inativo"} tone={product.ativo ? "ok" : "empty"} />
            <InfoCell label="Saldo" value={`${formatDecimal(product.quantidadeAtual)} ${product.unidadeMedida}`} />
            <InfoCell label="Minimo" value={formatDecimal(product.estoqueMinimo)} />
            <InfoCell label="Custo" value={formatCurrency(product.precoCustoCentavos)} />
            <InfoCell label="Venda" value={formatCurrency(product.precoVendaCentavos)} />
          </div>

          {product.descricao && (
            <p className="mt-3 rounded-xl border border-white/[0.06] bg-slate-950/24 p-3 text-xs leading-relaxed text-slate-400">
              {product.descricao}
            </p>
          )}
        </section>

        {!product.ativo && (
          <div className="rounded-2xl border border-amber-300/18 bg-amber-300/[0.06] p-3 text-xs text-amber-100">
            Ative o produto para realizar movimentacoes.
          </div>
        )}

        <section className="grid gap-2 sm:grid-cols-2">
          <button className="saas-action inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-slate-200" onClick={onEdit} type="button">
            <Edit3 size={14} />
            Editar produto
          </button>
          <button className="saas-action inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-slate-200 disabled:cursor-not-allowed disabled:opacity-45" disabled={!product.ativo} onClick={() => onMovement("entrada")} type="button">
            <TrendingUp size={14} />
            Dar entrada
          </button>
          <button className="saas-action inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-slate-200 disabled:cursor-not-allowed disabled:opacity-45" disabled={!product.ativo} onClick={() => onMovement("saida")} type="button">
            <TrendingDown size={14} />
            Registrar saida
          </button>
          <button className="saas-action inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-slate-200 disabled:cursor-not-allowed disabled:opacity-45" disabled={!product.ativo} onClick={() => onMovement("ajuste")} type="button">
            <SlidersHorizontal size={14} />
            Ajustar saldo
          </button>
        </section>

        <section className="saas-card rounded-2xl p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-xs font-semibold text-slate-100">Ultimas movimentacoes</p>
            <span className="saas-chip rounded-full px-2 py-1 text-[10px]">
              {product.movimentacoesCount ?? recentMovements.length} registros
            </span>
          </div>
          <div className="space-y-2">
            {recentMovements.length === 0 && (
              <p className="rounded-xl border border-dashed border-white/10 bg-black/20 p-3 text-xs text-slate-500">
                Nenhuma movimentacao registrada para este produto.
              </p>
            )}
            {recentMovements.map((movement) => (
              <MovementRow key={movement.id} movement={movement} />
            ))}
          </div>
        </section>
      </div>
    </aside>
  );
}

function StockMovementModal({
  action,
  product,
  form,
  error,
  isSubmitting,
  setForm,
  onClose,
  onSubmit,
}: {
  action: InventoryAction;
  product: ApiProduto;
  form: MovementForm;
  error: string;
  isSubmitting: boolean;
  setForm: (form: MovementForm) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const isAdjustment = action === "ajuste";
  const title = action === "entrada" ? "Dar entrada" : action === "saida" ? "Registrar saida" : "Ajustar saldo";
  const submitLabel = action === "entrada" ? "Registrar entrada" : action === "saida" ? "Registrar saida" : "Salvar ajuste";
  const current = decimalNumber(product.quantidadeAtual);
  const next = isAdjustment ? decimalNumber(normalizeDecimalInput(form.novaQuantidade)) : current;
  const difference = next - current;
  const fieldBaseClass =
    "w-full rounded-xl border border-slate-500/16 bg-slate-950/25 px-3 py-2 text-sm text-slate-100 outline-none transition-all duration-200 placeholder:text-slate-600 hover:border-slate-400/24 hover:bg-slate-900/55 focus:border-teal-300/28 focus:bg-slate-900/70 disabled:cursor-not-allowed disabled:opacity-60";
  const labelClass = "mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="saas-panel w-full max-w-lg rounded-2xl p-4 text-white shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold">{title}</p>
            <p className="mt-1 truncate text-[11px] text-slate-500">
              {product.nome} - saldo atual: {formatDecimal(product.quantidadeAtual)} {product.unidadeMedida}
            </p>
          </div>
          <button className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-800/70 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-50" disabled={isSubmitting} onClick={onClose} type="button">
            <X size={15} />
          </button>
        </div>

        <div className="saas-card grid gap-3 rounded-2xl p-3">
          <Field label={isAdjustment ? "Nova quantidade" : "Quantidade"} labelClass={labelClass}>
            <input
              className={fieldBaseClass}
              disabled={isSubmitting}
              inputMode="decimal"
              onChange={(event) =>
                setForm(isAdjustment ? { ...form, novaQuantidade: event.target.value } : { ...form, quantidade: event.target.value })
              }
              placeholder="Ex: 10 ou 10,5"
              value={isAdjustment ? form.novaQuantidade : form.quantidade}
            />
          </Field>

          {isAdjustment && (
            <div className="rounded-xl border border-white/[0.06] bg-slate-950/24 px-3 py-2 text-xs text-slate-400">
              Diferenca: <span className={difference > 0 ? "text-teal-100" : difference < 0 ? "text-rose-100" : "text-slate-300"}>{formatDecimal(String(difference))}</span>
            </div>
          )}

          <Field label={isAdjustment ? "Motivo obrigatorio" : "Motivo"} labelClass={labelClass}>
            <input
              className={fieldBaseClass}
              disabled={isSubmitting}
              onChange={(event) => setForm({ ...form, motivo: event.target.value })}
              placeholder={isAdjustment ? "Ex: Contagem fisica" : "Ex: Operacao de estoque"}
              value={form.motivo}
            />
          </Field>

          <Field label="Observacao" labelClass={labelClass}>
            <textarea
              className={`${fieldBaseClass} min-h-[72px] resize-none`}
              disabled={isSubmitting}
              onChange={(event) => setForm({ ...form, observacao: event.target.value })}
              placeholder="Informacao complementar"
              value={form.observacao}
            />
          </Field>
        </div>

        {error && <div className="mt-3 rounded-xl border border-rose-300/20 bg-rose-300/[0.055] px-3 py-2 text-xs text-rose-100">{error}</div>}

        <div className="mt-4 flex justify-end gap-2">
          <button className="rounded-xl border border-slate-500/16 bg-slate-950/25 px-3 py-2 text-xs text-slate-300 transition hover:bg-slate-900/70 disabled:cursor-not-allowed disabled:opacity-50" disabled={isSubmitting} onClick={onClose} type="button">
            Cancelar
          </button>
          <button className="premium-button inline-flex min-w-32 items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60" disabled={isSubmitting} onClick={onSubmit} type="button">
            {isSubmitting && <Loader2 size={13} className="animate-spin" />}
            {isSubmitting ? "Salvando" : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProductRow({ product, onOpen }: { product: ApiProduto; onOpen: () => void }) {
  return (
    <button className="saas-row grid min-w-0 gap-3 rounded-2xl p-3 text-left lg:grid-cols-[minmax(0,1fr)_96px_68px_72px_72px_84px_84px] lg:items-center" onClick={onOpen} type="button">
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-sm font-semibold text-white">{product.nome}</p>
          <span className={`saas-chip shrink-0 ${product.ativo ? "text-teal-100" : "text-slate-400"}`}>
            {product.ativo ? "Ativo" : "Inativo"}
          </span>
        </div>
        <p className="mt-1 truncate text-[11px] text-slate-500">
          {product.codigo || "Sem codigo"} - {product.categoria?.nome || "Sem categoria"}
        </p>
      </div>

        <InfoCell label="Estoque" value={stockLabel(product)} tone={stockTone(product)} />
        <InfoCell label="Unidade" value={product.unidadeMedida} />
        <InfoCell label="Saldo" value={formatDecimal(product.quantidadeAtual)} />
        <InfoCell label="Minimo" value={formatDecimal(product.estoqueMinimo)} />
        <InfoCell label="Custo" value={formatCurrency(product.precoCustoCentavos)} />
        <InfoCell label="Venda" value={formatCurrency(product.precoVendaCentavos)} />
    </button>
  );
}

function MovementRow({ movement }: { movement: ApiMovimentacaoEstoque }) {
  return (
    <article className="rounded-2xl border border-white/[0.07] bg-white/[0.035] p-3">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <span className={`saas-chip shrink-0 ${movementTone(movement.tipo)}`}>
              {movementLabel(movement.tipo)}
            </span>
            <p className="truncate text-xs font-semibold text-slate-100">
              {movement.produto?.nome || "Produto"}
            </p>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            {formatDecimal(movement.quantidadeAnterior)} &rarr; {formatDecimal(movement.quantidadePosterior)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs font-semibold text-white">{formatDecimal(movement.quantidade)}</p>
          <p className="mt-1 text-[10px] text-slate-500">{formatDate(movement.createdAt)}</p>
        </div>
      </div>
    </article>
  );
}

function InfoCell({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "ok" | "warn" | "empty" }) {
  const toneClass = {
    default: "text-slate-100",
    ok: "text-teal-100",
    warn: "text-amber-100",
    empty: "text-rose-100",
  }[tone];

  return (
    <div className="rounded-xl border border-white/[0.06] bg-slate-950/24 px-3 py-2">
      <p className="text-[9px] uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className={`mt-1 truncate text-xs font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

function EmptyState({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-5 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl border border-slate-500/16 bg-slate-900/55 text-slate-300">
        {icon}
      </div>
      <p className="mt-3 text-sm font-semibold text-white">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-slate-500">{text}</p>
    </div>
  );
}

function formatDecimal(value: string) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;

  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 3,
  }).format(numeric);
}

function validateProductForm(form: ProductForm) {
  if (!form.nome.trim()) return "Informe o nome do produto.";
  if (!form.unidadeMedida.trim()) return "Selecione a unidade de medida.";
  if (!isDecimalInputValid(form.estoqueMinimo)) return "Estoque minimo deve ser zero ou maior.";
  if (!isMoneyInputValid(form.precoCusto)) return "Preco de custo deve ser zero ou maior.";
  if (!isMoneyInputValid(form.precoVenda)) return "Preco de venda deve ser zero ou maior.";
  return "";
}

function isDecimalInputValid(value: string) {
  const normalized = normalizeDecimalInput(value);
  const numeric = Number(normalized);
  return Number.isFinite(numeric) && numeric >= 0;
}

function normalizeDecimalInput(value: string) {
  const normalized = value.trim().replace(/\./g, "").replace(",", ".");
  return normalized || "0";
}

function isMoneyInputValid(value: string) {
  try {
    return parseMoneyToCents(value) >= 0;
  } catch {
    return false;
  }
}

function parseMoneyToCents(value: string) {
  const clean = value.trim();
  if (!clean) return 0;
  if (clean.startsWith("-")) throw new Error("Valor negativo");

  const normalized = clean.replace(/[^\d,.]/g, "");
  const hasComma = normalized.includes(",");
  const decimalSeparator = hasComma ? "," : normalized.includes(".") ? "." : "";
  const [integerRaw, decimalRaw = ""] = decimalSeparator
    ? normalized.split(decimalSeparator)
    : [normalized, ""];
  const integerDigits = integerRaw.replace(/\D/g, "") || "0";
  const decimalDigits = decimalRaw.replace(/\D/g, "").padEnd(2, "0").slice(0, 2);
  const cents = Number(`${integerDigits}${decimalDigits}`);

  if (!Number.isFinite(cents) || cents < 0) throw new Error("Valor invalido");
  return cents;
}

function toFriendlyProductError(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("codigo") || normalized.includes("código") || normalized.includes("unique")) {
    return "Ja existe um produto com esse codigo.";
  }
  if (normalized.includes("categoria")) return "Categoria selecionada nao esta disponivel.";
  if (normalized.includes("nome")) return "Informe um nome valido para o produto.";
  if (normalized.includes("unidade")) return "Selecione uma unidade de medida valida.";
  return "Nao foi possivel cadastrar o produto agora.";
}

function productToForm(product: ApiProduto): ProductForm {
  return {
    nome: product.nome,
    codigo: product.codigo ?? "",
    descricao: product.descricao ?? "",
    categoriaId: product.categoriaId ? String(product.categoriaId) : "",
    unidadeMedida: product.unidadeMedida,
    estoqueMinimo: formatDecimal(product.estoqueMinimo),
    precoCusto: centsToMoneyInput(product.precoCustoCentavos),
    precoVenda: centsToMoneyInput(product.precoVendaCentavos),
    ativo: product.ativo,
  };
}

function validateMovementForm(form: MovementForm, product: ApiProduto, action: InventoryAction) {
  if (!product.ativo) return "Ative o produto para realizar movimentacoes.";

  if (action === "ajuste") {
    if (!isDecimalInputValid(form.novaQuantidade)) return "Nova quantidade deve ser zero ou maior.";
    if (!form.motivo.trim()) return "Informe o motivo do ajuste.";
    if (decimalNumber(normalizeDecimalInput(form.novaQuantidade)) === decimalNumber(product.quantidadeAtual)) {
      return "Informe uma quantidade diferente do saldo atual.";
    }
    return "";
  }

  if (!isDecimalInputValid(form.quantidade) || decimalNumber(normalizeDecimalInput(form.quantidade)) <= 0) {
    return "Informe uma quantidade maior que zero.";
  }

  if (action === "saida" && decimalNumber(normalizeDecimalInput(form.quantidade)) > decimalNumber(product.quantidadeAtual)) {
    return "A quantidade informada e maior que o saldo disponivel.";
  }

  return "";
}

function movementSuccessMessage(action: InventoryAction) {
  if (action === "entrada") return "Entrada registrada com sucesso.";
  if (action === "saida") return "Saida registrada com sucesso.";
  return "Saldo ajustado com sucesso.";
}

function toFriendlyMovementError(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("saldo") || normalized.includes("insuficiente")) {
    return "A quantidade informada e maior que o saldo disponivel.";
  }
  if (normalized.includes("ativo") || normalized.includes("inativo")) {
    return "Ative o produto para realizar movimentacoes.";
  }
  if (normalized.includes("motivo")) return "Informe o motivo do ajuste.";
  if (normalized.includes("quantidade")) return "Informe uma quantidade valida.";
  return "Nao foi possivel concluir a movimentacao agora.";
}

function centsToMoneyInput(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function decimalNumber(value: string) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function stockLabel(product: ApiProduto) {
  const current = decimalNumber(product.quantidadeAtual);
  const minimum = decimalNumber(product.estoqueMinimo);

  if (current <= 0) return "Sem estoque";
  if (minimum > 0 && current <= minimum) return "Estoque baixo";
  return "Normal";
}

function stockTone(product: ApiProduto): "ok" | "warn" | "empty" {
  const current = decimalNumber(product.quantidadeAtual);
  const minimum = decimalNumber(product.estoqueMinimo);

  if (current <= 0) return "empty";
  if (minimum > 0 && current <= minimum) return "warn";
  return "ok";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function movementLabel(type: ApiMovimentacaoEstoque["tipo"]) {
  if (type === "ENTRADA") return "Entrada";
  if (type === "SAIDA") return "Saida";
  return "Ajuste";
}

function movementTone(type: ApiMovimentacaoEstoque["tipo"]) {
  if (type === "ENTRADA") return "border-teal-300/15 bg-teal-300/[0.07] text-teal-100";
  if (type === "SAIDA") return "border-rose-300/15 bg-rose-300/[0.07] text-rose-100";
  return "border-amber-300/15 bg-amber-300/[0.07] text-amber-100";
}
