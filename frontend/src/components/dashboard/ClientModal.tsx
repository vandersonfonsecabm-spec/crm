import type { Dispatch, SetStateAction } from "react";
import { Trash2, X } from "lucide-react";
import type { Client, Status } from "../../types/dashboard";

const statusList: Status[] = ["Novo", "Contato", "Proposta", "Fechado", "Perdido"];

type ClientModalProps = {
  title: string;
  client: Client;
  setClient: Dispatch<SetStateAction<Client | null>>;
  onClose: () => void;
  onSave: () => void;
  onDelete?: () => void;
  saveLabel: string;
  showDelete?: boolean;
};

export default function ClientModal({
  title,
  client,
  setClient,
  onClose,
  onSave,
  onDelete,
  saveLabel,
  showDelete = false,
}: ClientModalProps) {
  const fieldBaseClass =
    "rounded-xl border border-slate-500/16 bg-slate-950/25 px-3 py-2 text-sm outline-none transition-all duration-200 placeholder:text-slate-600 hover:border-slate-400/24 hover:bg-slate-900/55 focus:border-teal-300/28 focus:bg-slate-900/70";

  const fieldLabelClass =
    "mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="saas-panel w-full max-w-2xl rounded-2xl p-4 text-white shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold">{title}</p>
            <p className="mt-1 text-[11px] text-slate-500">
              Preencha os dados principais para manter o pipeline limpo e organizado.
            </p>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-800/70 hover:text-slate-200"
          >
            <X size={15} />
          </button>
        </div>

        <div className="saas-card mb-4 grid gap-3 rounded-2xl p-3 md:grid-cols-2">
          <div>
            <label className={fieldLabelClass}>Nome do cliente</label>
            <input
              value={client.name}
              onChange={(event) => setClient({ ...client, name: event.target.value })}
              placeholder="Ex: Mariana Costa"
              className={`${fieldBaseClass} select-text`}
            />
          </div>

          <div>
            <label className={fieldLabelClass}>Empresa</label>
            <input
              value={client.company}
              onChange={(event) => setClient({ ...client, company: event.target.value })}
              placeholder="Ex: Alpha Digital"
              className={`${fieldBaseClass} select-text`}
            />
          </div>

          <div>
            <label className={fieldLabelClass}>Telefone / WhatsApp</label>
            <input
              value={client.phone}
              onChange={(event) => setClient({ ...client, phone: event.target.value })}
              placeholder="Ex: 5535999990000"
              className={`${fieldBaseClass} select-text`}
            />
          </div>

          <div>
            <label className={fieldLabelClass}>E-mail</label>
            <input
              value={client.email}
              onChange={(event) => setClient({ ...client, email: event.target.value })}
              placeholder="Ex: cliente@email.com"
              className={`${fieldBaseClass} select-text`}
            />
          </div>
        </div>

        <div className="saas-card grid gap-3 rounded-2xl p-3 md:grid-cols-2">
          <div>
            <label className={fieldLabelClass}>Valor estimado</label>
            <input
              type="number"
              value={client.value}
              onChange={(event) => setClient({ ...client, value: Number(event.target.value) })}
              placeholder="Ex: 12000"
              className={`${fieldBaseClass} select-text`}
            />

            <p className="mt-1 text-[10px] text-slate-600">
              Use apenas números. Exemplo: 12000.
            </p>
          </div>

          <div>
            <label className={fieldLabelClass}>Origem do lead</label>
            <input
              value={client.source}
              onChange={(event) => setClient({ ...client, source: event.target.value })}
              placeholder="Ex: Instagram, Site, WhatsApp"
              className={`${fieldBaseClass} select-text`}
            />

            <p className="mt-1 text-[10px] text-slate-600">
              Informe o canal de entrada para melhorar relatórios e priorização.
            </p>
          </div>

          <div>
            <label className={fieldLabelClass}>Próximo follow-up</label>
            <input
              value={client.nextFollowUp}
              onChange={(event) => setClient({ ...client, nextFollowUp: event.target.value })}
              placeholder="Ex: Hoje, Amanhã, 30 dias"
              className={`${fieldBaseClass} select-text`}
            />
          </div>

          <div>
            <label className={fieldLabelClass}>Status do pipeline</label>
            <select
              value={client.status}
              onChange={(event) => setClient({ ...client, status: event.target.value as Status })}
              className={`${fieldBaseClass} bg-slate-950`}
            >
              {statusList.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className={fieldLabelClass}>Tags comerciais</label>
            <input
              value={client.tags.join(", ")}
              onChange={(event) =>
                setClient({
                  ...client,
                  tags: event.target.value
                    .split(",")
                    .map((tag) => tag.trim())
                    .filter(Boolean),
                })
              }
              placeholder="Ex: Quente, Alto valor, Urgente"
              className={`${fieldBaseClass} select-text`}
            />

            <p className="mt-1 text-[10px] text-slate-600">
              Separe por vírgula para criar múltiplas tags.
            </p>
          </div>
        </div>

        <div className="mt-4 flex justify-between gap-2">
          {showDelete && onDelete ? (
            <button
              onClick={onDelete}
              className="inline-flex items-center gap-2 rounded-xl border border-rose-300/20 bg-slate-950/25 px-3 py-2 text-xs text-rose-100 transition hover:bg-slate-900/70"
            >
              <Trash2 size={14} />
              Excluir
            </button>
          ) : (
            <div />
          )}

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-xl border border-slate-500/16 bg-slate-950/25 px-3 py-2 text-xs text-slate-300 transition-all duration-200 hover:border-slate-400/24 hover:bg-slate-900/70"
            >
              Cancelar
            </button>

            <button
              onClick={onSave}
              className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-950 transition-all duration-200 hover:bg-white"
            >
              {saveLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
