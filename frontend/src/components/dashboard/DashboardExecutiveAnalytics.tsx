import type { Analytics, Client } from "../../types/dashboard";

type DashboardExecutiveAnalyticsProps = {
  analytics: Analytics;
  clients: Client[];
  money: (value: number) => string;
  initials: (name: string) => string;
  leadOwner: (client: Client) => string;
  getLeadScore: (client: Client) => number;
};

export default function DashboardExecutiveAnalytics({
  analytics,
  clients,
  money,
  initials,
  leadOwner,
  getLeadScore,
}: DashboardExecutiveAnalyticsProps) {
  const conversionRate = Math.round(
    (clients.filter((client) => client.status === "Fechado").length / Math.max(clients.length, 1)) * 100
  );

  const recentlyMovedClients = clients.filter((client) => client.lastContactDays <= 2).length;

  return (
    <div className="saas-panel rounded-2xl p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Analytics Executive</p>
          <p className="mt-1 text-[11px] text-slate-500">
            Tendência comercial, conversão e performance do time.
          </p>
        </div>

        <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-200">
          Leitura executiva
        </span>
      </div>

      <div className="grid gap-3 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="saas-card rounded-2xl p-3">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-200">Performance semanal</p>
              <p className="mt-0.5 text-[10px] text-slate-500">
                Tendência, volume e qualidade do pipeline em visão executiva.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="rounded-lg border border-emerald-400/10 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-200">
                +18%
              </span>

              <span className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-slate-300">
                semana
              </span>
            </div>
          </div>

          <div className="saas-panel rounded-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-white/10 bg-white/[0.025] p-3">
              <div>
                <p className="text-[9px] uppercase tracking-[0.2em] text-slate-600">
                  Pipeline previsto
                </p>

                <p className="mt-1 text-2xl font-bold text-white">
                  {money(analytics.forecastValue)}
                </p>

                <p className="mt-1 text-[10px] text-slate-500">
                  Comparativo visual dos últimos 7 dias.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="metric-card metric-revenue rounded-xl px-2.5 py-2 text-right">
                  <p className="text-[9px] text-cyan-200/70">Pico</p>
                  <p className="mt-1 text-xs font-semibold text-cyan-100">86%</p>
                </div>

                <div className="metric-card rounded-xl px-2.5 py-2 text-right">
                  <p className="text-[9px] text-violet-200/70">Média</p>
                  <p className="mt-1 text-xs font-semibold text-violet-100">
                    {analytics.averageScore}
                  </p>
                </div>
              </div>
            </div>

            <div className="relative h-56 p-3">
              <div className="absolute inset-x-3 top-8 h-px bg-white/5" />
              <div className="absolute inset-x-3 top-20 h-px bg-white/5" />
              <div className="absolute inset-x-3 top-32 h-px bg-white/5" />
              <div className="absolute inset-x-3 top-44 h-px bg-white/5" />

              <div className="absolute inset-x-3 bottom-8 top-5 rounded-2xl bg-gradient-to-t from-cyan-500/10 via-cyan-400/[0.035] to-transparent" />

              <svg viewBox="0 0 700 180" className="relative z-10 h-[180px] w-full overflow-visible">
                <defs>
                  <linearGradient id="pipelineGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgb(103 232 249)" stopOpacity="0.38" />
                    <stop offset="100%" stopColor="rgb(103 232 249)" stopOpacity="0" />
                  </linearGradient>

                  <filter id="softGlow">
                    <feGaussianBlur stdDeviation="4" result="coloredBlur" />
                    <feMerge>
                      <feMergeNode in="coloredBlur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>

                <path
                  d="M 0 138 C 65 118, 90 92, 135 104 C 190 118, 205 58, 270 70 C 335 82, 340 48, 405 56 C 470 64, 500 30, 565 38 C 625 45, 650 28, 700 24 L 700 180 L 0 180 Z"
                  fill="url(#pipelineGradient)"
                />

                <path
                  d="M 0 138 C 65 118, 90 92, 135 104 C 190 118, 205 58, 270 70 C 335 82, 340 48, 405 56 C 470 64, 500 30, 565 38 C 625 45, 650 28, 700 24"
                  fill="none"
                  stroke="rgb(103 232 249)"
                  strokeWidth="4"
                  strokeLinecap="round"
                  filter="url(#softGlow)"
                />

                {[
                  { x: 0, y: 138, label: "S" },
                  { x: 135, y: 104, label: "T" },
                  { x: 270, y: 70, label: "Q" },
                  { x: 405, y: 56, label: "Q" },
                  { x: 565, y: 38, label: "S" },
                  { x: 700, y: 24, label: "D" },
                ].map((point) => (
                  <g key={`${point.x}-${point.y}`}>
                    <circle cx={point.x} cy={point.y} r="6" fill="rgb(8 11 18)" stroke="rgb(103 232 249)" strokeWidth="3" />
                    <circle cx={point.x} cy={point.y} r="2.5" fill="rgb(103 232 249)" />
                  </g>
                ))}
              </svg>

              <div className="relative z-20 mt-1 grid grid-cols-7 text-center text-[9px] text-slate-600">
                {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((day) => (
                  <span key={day}>{day}</span>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 border-t border-white/10 bg-white/[0.02] p-3">
              <div className="metric-card rounded-xl p-2">
                <p className="text-[9px] text-slate-500">Conversão</p>
                <p className="mt-1 text-xs font-semibold text-white">{conversionRate}%</p>
              </div>

              <div className="metric-card rounded-xl p-2">
                <p className="text-[9px] text-slate-500">Oportunidades</p>
                <p className="mt-1 text-xs font-semibold text-white">{clients.length} leads</p>
              </div>

              <div className="metric-card rounded-xl p-2">
                <p className="text-[9px] text-slate-500">Qualidade</p>
                <p className="mt-1 text-xs font-semibold text-white">{analytics.averageScore}/100</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
          <div className="metric-card metric-pipeline rounded-xl p-3">
            <p className="text-[10px] text-emerald-200/70">Taxa de conversão</p>
            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="text-lg font-semibold text-emerald-100">{conversionRate}%</p>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-emerald-300" style={{ width: `${conversionRate}%` }} />
              </div>
            </div>
          </div>

          <div className="metric-card metric-revenue rounded-xl p-3">
            <p className="text-[10px] text-sky-200/70">Velocidade comercial</p>
            <p className="mt-2 text-lg font-semibold text-sky-100">
              {recentlyMovedClients}/{clients.length}
            </p>
            <p className="mt-1 text-[10px] text-sky-200/60">
              leads movimentados recentemente
            </p>
          </div>

          <div className="metric-card rounded-xl p-3">
            <p className="text-[10px] text-violet-200/70">Qualidade média</p>
            <p className="mt-2 text-lg font-semibold text-violet-100">
              {analytics.averageScore}/100
            </p>
            <p className="mt-1 text-[10px] text-violet-200/60">
              score consolidado da carteira
            </p>
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-3">
        {["Ana", "Marco", "Bia"].map((seller) => {
          const sellerClients = clients.filter((client) => leadOwner(client) === seller);
          const sellerScore =
            sellerClients.length > 0
              ? Math.round(
                  sellerClients.reduce((sum, client) => sum + getLeadScore(client), 0) / sellerClients.length
                )
              : 0;

          return (
            <div
              key={seller}
              className="metric-card rounded-xl p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-400/24"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-[10px] font-bold">
                    {initials(seller)}
                  </div>

                  <div>
                    <p className="text-xs font-semibold">{seller}</p>
                    <p className="text-[10px] text-slate-500">Performance comercial</p>
                  </div>
                </div>

                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[9px] text-slate-300">
                  {sellerClients.length} leads
                </span>
              </div>

              <div className="mt-3">
                <div className="mb-1 flex items-center justify-between text-[10px] text-slate-500">
                  <span>Score</span>
                  <span>{sellerScore}</span>
                </div>

                <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-white" style={{ width: `${sellerScore}%` }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
