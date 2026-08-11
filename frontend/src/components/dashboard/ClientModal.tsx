import { useEffect, useRef, useState } from "react";
import type { Dispatch, FormEvent, SetStateAction } from "react";
import { Trash2, X } from "lucide-react";
import type { Client, Status } from "../../types/dashboard";
import { ApiHttpError } from "../../services/crmApi";
import { formatNextFollowUp } from "../../utils/followUpProjection";

const statusList: Status[] = ["Novo", "Contato", "Proposta", "Fechado", "Perdido"];

type ClientModalProps = {
  title: string;
  client: Client;
  setClient: Dispatch<SetStateAction<Client | null>>;
  onClose: () => void;
  onSave: (client: Client) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
  saveLabel: string;
  showDelete?: boolean;
};

type ClientValidationErrors = Partial<Record<"name" | "phone" | "email" | "state" | "cpfCnpj", string>>;

function normalizeFormText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeClient(client: Client): Client {
  return {
    ...client,
    name: normalizeFormText(client.name),
    company: normalizeFormText(client.company),
    city: normalizeFormText(client.city),
    state: client.state.trim().toUpperCase(),
    cpfCnpj: client.cpfCnpj.replace(/\D/g, ""),
    phone: client.phone.trim(),
    email: client.email.trim(),
    source: normalizeFormText(client.source),
    nextFollowUp: client.nextFollowUp,
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
  if (normalized.state && !/^[A-Z]{2}$/.test(normalized.state)) {
    errors.state = "Use a sigla do estado com duas letras.";
  }
  if (normalized.cpfCnpj && !isValidCpfCnpj(normalized.cpfCnpj)) {
    errors.cpfCnpj = "Informe um CPF ou CNPJ válido.";
  }

  return errors;
}

function hasErrors(errors: ClientValidationErrors) {
  return Object.values(errors).some(Boolean);
}

function isValidCpfCnpj(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits || /^(\d)\1+$/.test(digits)) return false;
  if (digits.length === 11) {
    const digit = (length: number) => {
      let sum = 0;
      for (let index = 0; index < length; index += 1) sum += Number(digits[index]) * (length + 1 - index);
      const result = (sum * 10) % 11;
      return result === 10 ? 0 : result;
    };
    return digit(9) === Number(digits[9]) && digit(10) === Number(digits[10]);
  }
  if (digits.length === 14) {
    const calculate = (length: number) => {
      const weights = length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      const sum = weights.reduce((total, weight, index) => total + Number(digits[index]) * weight, 0);
      const remainder = sum % 11;
      return remainder < 2 ? 0 : 11 - remainder;
    };
    return calculate(12) === Number(digits[12]) && calculate(13) === Number(digits[13]);
  }
  return false;
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
}: ClientModalProps) {
  const [errors, setErrors] = useState<ClientValidationErrors>({});
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteConfirming, setIsDeleteConfirming] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const stateRef = useRef<HTMLInputElement>(null);
  const documentRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLFormElement>(null);
  const deleteCancelRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const isBusyRef = useRef(false);

  const fieldBaseClass =
    "rounded-xl border border-slate-500/16 bg-slate-950/25 px-3 py-2 text-sm outline-none transition-[border-color,background-color] duration-200 placeholder:text-slate-600 hover:border-slate-400/24 hover:bg-slate-900/55 focus:border-teal-300/28 focus:bg-slate-900/70";
  const invalidFieldClass = "border-rose-300/45 bg-rose-950/10 focus:border-rose-200/70";

  const fieldLabelClass =
    "mb-1.5 block text-[11px] font-semibold text-slate-500";

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    isBusyRef.current = isSubmitting || isDeleting;
  }, [isDeleting, isSubmitting]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimeout = window.setTimeout(() => nameRef.current?.focus(), 0);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isBusyRef.current) {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.clearTimeout(focusTimeout);
      window.removeEventListener("keydown", handleKeyDown, true);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  useEffect(() => {
    if (isDeleteConfirming) deleteCancelRef.current?.focus();
  }, [isDeleteConfirming]);

  function updateField(field: keyof Client, value: string | number | Status | string[]) {
    setClient((current) => (current ? { ...current, [field]: value } : current));
    setFormError("");

    if (field === "name" || field === "phone" || field === "email" || field === "state" || field === "cpfCnpj") {
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
      return;
    }
    if (nextErrors.state) stateRef.current?.focus();
    else if (nextErrors.cpfCnpj) documentRef.current?.focus();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) return;

    const normalizedClient = normalizeClient(client);

    const nextErrors = validateClient(normalizedClient);

    if (hasErrors(nextErrors)) {
      setErrors(nextErrors);
      setFormError("");
      focusFirstInvalid(nextErrors);
      return;
    }

    setClient((current) => (current ? { ...current, ...normalizedClient } : current));

    setIsSubmitting(true);
    setFormError("");

    try {
      await onSave(normalizedClient);
    } catch (error) {
      setFormError(error instanceof ApiHttpError && error.status === 409
        ? "Este cadastro foi atualizado por outra pessoa. Feche, abra novamente e revise os dados."
        : error instanceof ApiHttpError && error.status === 422
          ? error.message
          : "Não foi possível salvar o cliente agora. Tente novamente.");
      setIsSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!onDelete || isBusyRef.current) return;
    setIsDeleting(true);
    setFormError("");
    try {
      await onDelete();
    } catch {
      setFormError("Não foi possível excluir o cliente agora. Tente novamente.");
      setIsDeleting(false);
      setIsDeleteConfirming(false);
    }
  }

  const isBusy = isSubmitting || isDeleting;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4">
      <form
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="client-modal-title"
        aria-describedby="client-modal-description"
        onSubmit={handleSubmit}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !isBusy) {
            event.stopPropagation();
            if (isDeleteConfirming) setIsDeleteConfirming(false);
            else onClose();
          }
        }}
        className="saas-panel max-h-[calc(100vh-32px)] w-full max-w-2xl overflow-y-auto rounded-lg p-4 text-white shadow-2xl"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 id="client-modal-title" className="text-sm font-semibold">{title}</h2>
            <p id="client-modal-description" className="mt-1 text-[11px] text-slate-500">
              Preencha os dados principais para manter o funil limpo e organizado.
            </p>
          </div>

          <button
            aria-label="Fechar formulário de cliente"
            type="button"
            onClick={onClose}
            disabled={isBusy}
            className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-800/70 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <X size={15} />
          </button>
        </div>

        <div className="saas-card mb-4 grid gap-3 rounded-lg p-3 md:grid-cols-2">
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
              disabled={isBusy}
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
              disabled={isBusy}
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
              disabled={isBusy}
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
              disabled={isBusy}
              className={`${fieldBaseClass} ${errors.email ? invalidFieldClass : ""} select-text disabled:cursor-not-allowed disabled:opacity-70`}
            />
            {errors.email ? <p id="client-email-error" className="mt-1 text-[11px] text-rose-200">{errors.email}</p> : null}
          </div>

          <div>
            <label htmlFor="client-city" className={fieldLabelClass}>Cidade</label>
            <input
              id="client-city"
              value={client.city}
              onChange={(event) => updateField("city", event.target.value)}
              placeholder="Ex: Campinas"
              disabled={isBusy}
              className={`${fieldBaseClass} select-text disabled:cursor-not-allowed disabled:opacity-70`}
            />
          </div>

          <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3">
            <div>
              <label htmlFor="client-state" className={fieldLabelClass}>UF</label>
              <input
                ref={stateRef}
                id="client-state"
                value={client.state}
                maxLength={2}
                onChange={(event) => updateField("state", event.target.value.toUpperCase())}
                placeholder="SP"
                aria-invalid={Boolean(errors.state)}
                aria-describedby={errors.state ? "client-state-error" : undefined}
                disabled={isBusy}
                className={`${fieldBaseClass} ${errors.state ? invalidFieldClass : ""} w-full select-text uppercase disabled:cursor-not-allowed disabled:opacity-70`}
              />
              {errors.state ? <p id="client-state-error" className="mt-1 text-[11px] text-rose-200">{errors.state}</p> : null}
            </div>
            <div>
              <label htmlFor="client-document" className={fieldLabelClass}>CPF / CNPJ</label>
              <input
                ref={documentRef}
                id="client-document"
                value={client.cpfCnpj}
                inputMode="numeric"
                onChange={(event) => updateField("cpfCnpj", event.target.value)}
                placeholder="Somente números"
                aria-invalid={Boolean(errors.cpfCnpj)}
                aria-describedby={errors.cpfCnpj ? "client-document-error" : undefined}
                disabled={isBusy}
                className={`${fieldBaseClass} ${errors.cpfCnpj ? invalidFieldClass : ""} w-full select-text disabled:cursor-not-allowed disabled:opacity-70`}
              />
              {errors.cpfCnpj ? <p id="client-document-error" className="mt-1 text-[11px] text-rose-200">{errors.cpfCnpj}</p> : null}
            </div>
          </div>
        </div>

        <div className="saas-card grid gap-3 rounded-lg p-3 md:grid-cols-2">
          <div>
            <label htmlFor="client-value" className={fieldLabelClass}>Valor estimado</label>
            <input
              id="client-value"
              type="number"
              value={client.value}
              onChange={(event) => updateField("value", Number(event.target.value))}
              placeholder="Ex: 12000"
              disabled={isBusy}
              className={`${fieldBaseClass} select-text disabled:cursor-not-allowed disabled:opacity-70`}
            />

            <p className="mt-1 text-[11px] text-slate-600">
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
              disabled={isBusy}
              className={`${fieldBaseClass} select-text disabled:cursor-not-allowed disabled:opacity-70`}
            />

            <p className="mt-1 text-[11px] text-slate-600">
              Informe o canal de entrada para melhorar relatórios e priorização.
            </p>
          </div>

          <div>
            <label htmlFor="client-next-follow-up" className={fieldLabelClass}>Próximo contato</label>
            <input
              id="client-next-follow-up"
              value={formatNextFollowUp(client.nextFollowUp)}
              readOnly
              aria-readonly="true"
              className={`${fieldBaseClass} cursor-default select-text text-slate-400`}
            />
          </div>

          <div>
            <label htmlFor="client-status" className={fieldLabelClass}>Status no funil</label>
            <select
              id="client-status"
              value={client.status}
              onChange={(event) => updateField("status", event.target.value as Status)}
              disabled={isBusy}
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
              disabled={isBusy}
              className={`${fieldBaseClass} select-text disabled:cursor-not-allowed disabled:opacity-70`}
            />

            <p className="mt-1 text-[11px] text-slate-600">
              Separe por vírgula para criar múltiplas tags.
            </p>
          </div>
        </div>

        {formError ? (
          <p className="mt-3 rounded-xl border border-rose-300/20 bg-rose-950/20 px-3 py-2 text-xs text-rose-100">
            {formError}
          </p>
        ) : null}

        <div className="mt-4 flex items-center justify-between gap-2">
          {showDelete && onDelete && !isDeleteConfirming ? (
            <button
              type="button"
              onClick={() => setIsDeleteConfirming(true)}
              disabled={isBusy}
              className="inline-flex items-center gap-2 rounded-xl border border-rose-300/20 bg-slate-950/25 px-3 py-2 text-xs text-rose-100 transition hover:bg-slate-900/70"
            >
              <Trash2 size={14} />
              Excluir
            </button>
          ) : !isDeleteConfirming ? (
            <div />
          ) : null}

          {isDeleteConfirming ? (
            <div className="flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-300/20 bg-rose-950/15 px-3 py-2">
              <p className="text-xs text-rose-100">Excluir este cliente e o histórico relacionado?</p>
              <div className="flex gap-2">
                <button
                  ref={deleteCancelRef}
                  type="button"
                  onClick={() => setIsDeleteConfirming(false)}
                  disabled={isBusy}
                  className="rounded-xl border border-slate-500/16 bg-slate-950/25 px-3 py-2 text-xs text-slate-300"
                >
                  Cancelar exclusão
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isBusy}
                  className="rounded-xl border border-rose-300/30 bg-rose-950/30 px-3 py-2 text-xs font-semibold text-rose-100 disabled:opacity-60"
                >
                  {isDeleting ? "Excluindo..." : "Confirmar exclusão"}
                </button>
              </div>
            </div>
          ) : (

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isBusy}
              className="rounded-xl border border-slate-500/16 bg-slate-950/25 px-3 py-2 text-xs text-slate-300 transition-[border-color,background-color] duration-200 hover:border-slate-400/24 hover:bg-slate-900/70 disabled:cursor-not-allowed disabled:opacity-45"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={isBusy}
              aria-disabled={isBusy}
              className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-950 transition-colors duration-200 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Salvando..." : saveLabel}
            </button>
          </div>
          )}
        </div>
      </form>
    </div>
  );
}
