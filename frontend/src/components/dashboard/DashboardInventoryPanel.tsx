import { AlertTriangle, Boxes, CheckCircle2, Layers3, Package, Search, SlidersHorizontal, Warehouse } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  fetchEstoqueMovimentacoes,
  fetchEstoqueResumo,
  fetchProdutos,
  type ApiMovimentacaoEstoque,
  type ApiProduto,
  type ApiResumoEstoque,
} from "../../services/crmApi";
import MetricCard from "./MetricCard";

const PRODUCT_PAGE_SIZE = 5;
const MOVEMENT_LIMIT = 5;
const UNITS = ["Todos", "UN", "KG", "L", "SC", "TON"];

type InventoryStatus = "idle" | "loading" | "success" | "error";

export default function DashboardInventoryPanel() {
  const [summary, setSummary] = useState<ApiResumoEstoque | null>(null);
  const [products, setProducts] = useState<ApiProduto[]>([]);
  const [movements, setMovements] = useState<ApiMovimentacaoEstoque[]>([]);
  const [productTotal, setProductTotal] = useState(0);
  const [productPage, setProductPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<"todos" | "ativos" | "inativos">("todos");
  const [unitFilter, setUnitFilter] = useState("Todos");
  const [status, setStatus] = useState<InventoryStatus>("idle");
  const [refreshKey, setRefreshKey] = useState(0);

  const totalPages = Math.max(1, Math.ceil(productTotal / PRODUCT_PAGE_SIZE));

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

        const [summaryData, productsData, movementsData] = await Promise.all([
          fetchEstoqueResumo(),
          fetchProdutos({
            busca: debouncedSearch,
            ativo,
            unidadeMedida: unitFilter === "Todos" ? undefined : unitFilter,
            page: productPage,
            limit: PRODUCT_PAGE_SIZE,
          }),
          fetchEstoqueMovimentacoes({
            page: 1,
            limit: MOVEMENT_LIMIT,
          }),
        ]);

        if (ignore) return;

        setSummary(summaryData);
        setProducts(productsData.data);
        setProductTotal(productsData.pagination.total);
        setMovements(movementsData.data);
        setStatus("success");
      } catch {
        if (ignore) return;
        setStatus("error");
      }
    }

    void loadInventory();

    return () => {
      ignore = true;
    };
  }, [activeFilter, debouncedSearch, productPage, refreshKey, unitFilter]);

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
    ],
    [summary],
  );

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
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
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

            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_120px_110px] lg:w-[520px]">
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
                text="Cadastre produtos para acompanhar saldos, estoque minimo e movimentacoes."
              />
            )}

            {!isLoading &&
              products.map((product) => (
                <ProductRow key={product.id} product={product} />
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
    </section>
  );
}

function ProductRow({ product }: { product: ApiProduto }) {
  return (
    <article className="saas-row grid min-w-0 gap-3 rounded-2xl p-3 lg:grid-cols-[minmax(0,1fr)_86px_86px_86px_76px] lg:items-center">
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

      <InfoCell label="Unidade" value={product.unidadeMedida} />
      <InfoCell label="Saldo" value={formatDecimal(product.quantidadeAtual)} />
      <InfoCell label="Minimo" value={formatDecimal(product.estoqueMinimo)} />
      <InfoCell label="Venda" value={formatCurrency(product.precoVendaCentavos)} />
    </article>
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

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-slate-950/24 px-3 py-2">
      <p className="text-[9px] uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 truncate text-xs font-semibold text-slate-100">{value}</p>
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

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
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
