import type { Dispatch, SetStateAction } from "react";
import { Trash2, X } from "lucide-react";

type Status = "Novo" | "Contato" | "Proposta" | "Fechado" | "Perdido";

type Note = {
  id: number;
  text: string;
  date: string;
};

type Client = {
  id: number;
  name: string;
  company: string;
  phone: string;
  email: string;
  value: number;
  status: Status;
  source: string;
  favorite: boolean;
  hot: boolean;
  lastContactDays: number;
  nextFollowUp: string;
  tags: string[];
  notes: Note[];
};

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
    "rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none transition-all duration-200 placeholder:text-slate-600 hover:border-white/20 hover:bg-white/10 focus:border-white/25 focus:bg-white/[0.08]";

  const fieldLabelClass =
    "mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#0d111a] p-4 text-white shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold">{title}</p>
            <p className="mt-1 text-[11px] text-slate-500">
              Preencha os dados principais para manter o pipeline limpo e organizado.
            </p>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-white/10"
          >
            <X size={15} />
          </button>
        </div>

        <div className="mb-4 grid gap-3 rounded-2xl border border-white/10 bg-black/20 p-3 md:grid-cols-2">
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
            <label className={fieldLabelClass}>Email</label>
            <input
              value={client.email}
              onChange={(event) => setClient({ ...client, email: event.target.value })}
              placeholder="Ex: cliente@email.com"
              className={`${fieldBaseClass} select-text`}
            />
          </div>
        </div>

        <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 md:grid-cols-2">
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
              Antes aparecia como “Manual”; agora fica claro que é a origem.
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
              className={`${fieldBaseClass} bg-[#0d111a]`}
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
              className="inline-flex items-center gap-2 rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-100"
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
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300 transition-all duration-200 hover:border-white/20 hover:bg-white/10"
            >
              Cancelar
            </button>

            <button
              onClick={onSave}
              className="rounded-xl bg-white px-4 py-2 text-xs font-semibold text-black transition-all duration-200 hover:scale-[1.01] hover:bg-slate-100"
            >
              {saveLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
