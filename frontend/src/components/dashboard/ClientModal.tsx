import { useEffect, useRef, useState } from "react";
import type { Dispatch, FormEvent, SetStateAction } from "react";
import { Trash2, X } from "lucide-react";
import type { Client, Status } from "../../types/dashboard";

const statusList: Status[] = ["Novo", "Contato", "Proposta", "Fechado", "Perdido"];

type ClientModalProps = {
  title: string;
  client: Client;
  setClient: Dispatch<SetStateAction<Client | null>>;
  onClose: () => void;
  onSave: () => void | Promise<void>;
  onDelete?: () => void;
  saveLabel: string;
  showDelete?: boolean;
  validateBeforeSave?: boolean;
};

type ClientValidationErrors = Partial<Record<"name" | "phone" | "email", string>>;

function normalizeFormText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeClient(client: Client): Client {
  return {
    ...client,
    name: normalizeFormText(client.name),
    company: normalizeFormText(client.company),
    phone: client.phone.trim(),
    email: client.email.trim(),
    source: normalizeFormText(client.source),
    nextFollowUp: normalizeFormText(client.nextFollowUp),
  };
}

function validateClient(client: Client): ClientValidationErrors {
  const errors: ClientValidationErrors = {};
  const normalized = normalizeClient(client);
  const phoneDigits = normalized.phone.replace(/\D/g, "");

  if (!normalized.name) {
    errors.name = "Informe o nome do cliente.";
  }

  if (normalized.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.email)) {
    errors.email = "Informe um e-mail válido.";
  }

  if (normalized.phone && phoneDigits.length < 10) {
    errors.phone = "Informe um telefone válido.";
  }

  return errors;
}

function hasErrors(errors: ClientValidationErrors) {
  return Object.values(errors).some(Boolean);
}

export default function ClientModal({
  title,
  client,
  setClient,
  onClose,
  onSave,
  onDelete,
  saveLabel,
  showDelete = false,
  validateBeforeSave = false,
}: ClientModalProps) {
  const [errors, setErrors] = useState<ClientValidationErrors>({});
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  const fieldBaseClass =
    "rounded-xl border border-slate-500/16 bg-slate-950/25 px-3 py-2 text-sm outline-none transition-all duration-200 placeholder:text-slate-600 hover:border-slate-400/24 hover:bg-slate-900/55 focus:border-teal-300/28 focus:bg-slate-900/70";
  const invalidFieldClass = "border-rose-300/45 bg-rose-950/10 focus:border-rose-200/70";

  const fieldLabelClass =
    "mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500";

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !isSubmitting) {
        event.stopPropagation();
        onClose();
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isSubmitting, onClose]);

  function updateField(field: keyof Client, value: string | number | Status | string[]) {
    setClient((current) => (current ? { ...current, [field]: value } : current));
    setFormError("");

    if (field === "name" || field === "phone" || field === "email") {
      setErrors((current) => {
        if (!current[field]) return current;

        const nextClient = { ...client, [field]: value };
        const nextErrors = validateClient(nextClient);

        if (nextErrors[field]) return { ...current, [field]: nextErrors[field] };

        return Object.fromEntries(Object.entries(current).filter(([key]) => key !== field)) as ClientValidationErrors;
      });
    }
  }

  function focusFirstInvalid(nextErrors: ClientValidationErrors) {
    if (nextErrors.name) {
      nameRef.current?.focus();
      return;
    }

    if (nextErrors.phone) {
      phoneRef.current?.focus();
      return;
    }

    if (nextErrors.email) {
      emailRef.current?.focus();
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) return;

    const normalizedClient = normalizeClient(client);

    if (validateBeforeSave) {
      const nextErrors = validateClient(normalizedClient);

      if (hasErrors(nextErrors)) {
        setErrors(nextErrors);
        setFormError("");
        focusFirstInvalid(nextErrors);
        return;
      }

      setClient((current) => (current ? { ...current, ...normalizedClient } : current));
    }

    setIsSubmitting(true);
    setFormError("");

    try {
      await onSave();
    } catch {
      setFormError("Não foi possível criar o cliente agora. Tente novamente.");
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <form
        onSubmit={handleSubmit}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !isSubmitting) {
            event.stopPropagation();
            onClose();
          }
        }}
        className="saas-panel w-full max-w-2xl rounded-2xl p-4 text-white shadow-2xl"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold">{title}</p>
            <p className="mt-1 text-[11px] text-slate-500">
              Preencha os dados principais para manter o funil limpo e organizado.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-800/70 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <X size={15} />
          </button>
        </div>

        <div className="saas-card mb-4 grid gap-3 rounded-2xl p-3 md:grid-cols-2">
          <div>
            <label htmlFor="client-name" className={fieldLabelClass}>Nome do cliente</label>
            <input
              ref={nameRef}
              id="client-name"
              value={client.name}
              onChange={(event) => updateField("name", event.target.value)}
              placeholder="Ex: Mariana Costa"
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? "client-name-error" : undefined}
              disabled={isSubmitting}
              className={`${fieldBaseClass} ${errors.name ? invalidFieldClass : ""} select-text disabled:cursor-not-allowed disabled:opacity-70`}
            />
            {errors.name ? <p id="client-name-error" className="mt-1 text-[11px] text-rose-200">{errors.name}</p> : null}
          </div>

          <div>
            <label htmlFor="client-company" className={fieldLabelClass}>Empresa</label>
            <input
              id="client-company"
              value={client.company}
              onChange={(event) => updateField("company", event.target.value)}
              placeholder="Ex: Alpha Digital"
              disabled={isSubmitting}
              className={`${fieldBaseClass} select-text disabled:cursor-not-allowed disabled:opacity-70`}
            />
          </div>

          <div>
            <label htmlFor="client-phone" className={fieldLabelClass}>Telefone / WhatsApp</label>
            <input
              ref={phoneRef}
              id="client-phone"
              value={client.phone}
              onChange={(event) => updateField("phone", event.target.value)}
              placeholder="Ex: 5535999990000"
              aria-invalid={Boolean(errors.phone)}
              aria-describedby={errors.phone ? "client-phone-error" : undefined}
              disabled={isSubmitting}
              className={`${fieldBaseClass} ${errors.phone ? invalidFieldClass : ""} select-text disabled:cursor-not-allowed disabled:opacity-70`}
            />
            {errors.phone ? <p id="client-phone-error" className="mt-1 text-[11px] text-rose-200">{errors.phone}</p> : null}
          </div>

          <div>
            <label htmlFor="client-email" className={fieldLabelClass}>E-mail</label>
            <input
              ref={emailRef}
              id="client-email"
              value={client.email}
              onChange={(event) => updateField("email", event.target.value)}
              placeholder="Ex: cliente@email.com"
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? "client-email-error" : undefined}
              disabled={isSubmitting}
              className={`${fieldBaseClass} ${errors.email ? invalidFieldClass : ""} select-text disabled:cursor-not-allowed disabled:opacity-70`}
            />
            {errors.email ? <p id="client-email-error" className="mt-1 text-[11px] text-rose-200">{errors.email}</p> : null}
          </div>
        </div>

        <div className="saas-card grid gap-3 rounded-2xl p-3 md:grid-cols-2">
          <div>
            <label htmlFor="client-value" className={fieldLabelClass}>Valor estimado</label>
            <input
              id="client-value"
              type="number"
              value={client.value}
              onChange={(event) => updateField("value", Number(event.target.value))}
              placeholder="Ex: 12000"
              disabled={isSubmitting}
              className={`${fieldBaseClass} select-text disabled:cursor-not-allowed disabled:opacity-70`}
            />

            <p className="mt-1 text-[10px] text-slate-600">
              Use apenas números. Exemplo: 12000.
            </p>
          </div>

          <div>
            <label htmlFor="client-source" className={fieldLabelClass}>Origem da oportunidade</label>
            <input
              id="client-source"
              value={client.source}
              onChange={(event) => updateField("source", event.target.value)}
              placeholder="Ex: Instagram, Site, WhatsApp"
              disabled={isSubmitting}
              className={`${fieldBaseClass} select-text disabled:cursor-not-allowed disabled:opacity-70`}
            />

            <p className="mt-1 text-[10px] text-slate-600">
              Informe o canal de entrada para melhorar relatórios e priorização.
            </p>
          </div>

          <div>
            <label htmlFor="client-next-follow-up" className={fieldLabelClass}>Próximo contato</label>
            <input
              id="client-next-follow-up"
              value={client.nextFollowUp}
              onChange={(event) => updateField("nextFollowUp", event.target.value)}
              placeholder="Ex: Hoje, Amanhã, 30 dias"
              disabled={isSubmitting}
              className={`${fieldBaseClass} select-text disabled:cursor-not-allowed disabled:opacity-70`}
            />
          </div>

          <div>
            <label htmlFor="client-status" className={fieldLabelClass}>Status no funil</label>
            <select
              id="client-status"
              value={client.status}
              onChange={(event) => updateField("status", event.target.value as Status)}
              disabled={isSubmitting}
              className={`${fieldBaseClass} bg-slate-950 disabled:cursor-not-allowed disabled:opacity-70`}
            >
              {statusList.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label htmlFor="client-tags" className={fieldLabelClass}>Tags comerciais</label>
            <input
              id="client-tags"
              value={client.tags.join(", ")}
              onChange={(event) =>
                updateField(
                  "tags",
                  event.target.value
                    .split(",")
                    .map((tag) => tag.trim())
                    .filter(Boolean),
                )
              }
              placeholder="Ex: Quente, Alto valor, Urgente"
              disabled={isSubmitting}
              className={`${fieldBaseClass} select-text disabled:cursor-not-allowed disabled:opacity-70`}
            />

            <p className="mt-1 text-[10px] text-slate-600">
              Separe por vírgula para criar múltiplas tags.
            </p>
          </div>
        </div>

        {formError ? (
          <p className="mt-3 rounded-xl border border-rose-300/20 bg-rose-950/20 px-3 py-2 text-xs text-rose-100">
            {formError}
          </p>
        ) : null}

        <div className="mt-4 flex justify-between gap-2">
          {showDelete && onDelete ? (
            <button
              type="button"
              onClick={onDelete}
              disabled={isSubmitting}
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
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl border border-slate-500/16 bg-slate-950/25 px-3 py-2 text-xs text-slate-300 transition-all duration-200 hover:border-slate-400/24 hover:bg-slate-900/70 disabled:cursor-not-allowed disabled:opacity-45"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              aria-disabled={isSubmitting}
              className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-950 transition-all duration-200 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Salvando..." : saveLabel}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
