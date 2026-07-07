import { useEffect, useRef, useState } from "react";
import { ExternalLink, MessageCircle, X } from "lucide-react";

export type WhatsappExternalRequest = {
  contactName?: string;
  phone: string;
  message: string;
};

type WhatsappExternalConfirmDialogProps = {
  request: WhatsappExternalRequest | null;
  onClose: () => void;
};

function buildWhatsappExternalUrl({ phone, message }: WhatsappExternalRequest) {
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

function maskWhatsappPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 4) return "telefone protegido";
  return `${"*".repeat(Math.max(4, digits.length - 4))}${digits.slice(-4)}`;
}

function summarizeWhatsappMessage(message: string) {
  const compact = message.replace(/\s+/g, " ").trim();
  if (compact.length <= 140) return compact;
  return `${compact.slice(0, 137)}...`;
}

export default function WhatsappExternalConfirmDialog({
  request,
  onClose,
}: WhatsappExternalConfirmDialogProps) {
  if (!request) return null;

  return (
    <WhatsappExternalConfirmContent
      key={`${request.phone}-${request.message}`}
      request={request}
      onClose={onClose}
    />
  );
}

function WhatsappExternalConfirmContent({
  request,
  onClose,
}: {
  request: WhatsappExternalRequest;
  onClose: () => void;
}) {
  const [openError, setOpenError] = useState("");
  const [isOpening, setIsOpening] = useState(false);
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const timeout = window.setTimeout(() => cancelButtonRef.current?.focus(), 0);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusableElements = Array.from(
        dialogRef.current.querySelectorAll<HTMLButtonElement>("button:not([disabled])")
      );
      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [onClose, request]);

  function handleConfirm() {
    if (!request || isOpening) return;

    setIsOpening(true);
    const opened = window.open(buildWhatsappExternalUrl(request), "_blank", "noopener,noreferrer");

    if (!opened) {
      setOpenError("Nao foi possivel abrir o WhatsApp. Verifique se o navegador bloqueou a nova aba.");
      setIsOpening(false);
      return;
    }

    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        aria-describedby="whatsapp-external-confirm-description"
        aria-labelledby="whatsapp-external-confirm-title"
        aria-modal="true"
        className="saas-panel w-full max-w-md rounded-2xl p-4 text-white shadow-2xl"
        ref={dialogRef}
        role="dialog"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="flex min-w-0 gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-300/18 bg-emerald-300/[0.075] text-emerald-100">
              <MessageCircle size={17} />
            </div>
            <div className="min-w-0">
              <h2 id="whatsapp-external-confirm-title" className="text-sm font-semibold">
                Abrir WhatsApp externo?
              </h2>
              <p id="whatsapp-external-confirm-description" className="mt-1 text-[11px] leading-relaxed text-slate-500">
                Voce sera direcionado para o WhatsApp fora do CRM. A mensagem ficara apenas preenchida e nao sera enviada automaticamente.
              </p>
            </div>
          </div>

          <button
            aria-label="Fechar confirmacao"
            className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-800/70 hover:text-slate-200"
            onClick={onClose}
            type="button"
          >
            <X size={15} />
          </button>
        </div>

        <div className="saas-card space-y-3 rounded-2xl p-3">
          <DialogInfo label="Contato" value={request.contactName || "Contato selecionado"} />
          <DialogInfo label="Telefone" value={maskWhatsappPhone(request.phone)} />
          <DialogInfo label="Mensagem preparada" value={summarizeWhatsappMessage(request.message) || "Mensagem vazia"} />
        </div>

        {openError && (
          <p className="mt-3 rounded-xl border border-rose-300/20 bg-rose-300/[0.08] px-3 py-2 text-[11px] text-rose-100">
            {openError}
          </p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            ref={cancelButtonRef}
            className="rounded-xl border border-slate-500/16 bg-slate-950/25 px-3 py-2 text-xs text-slate-300 transition hover:border-slate-400/24 hover:bg-slate-900/70"
            onClick={onClose}
            type="button"
          >
            Cancelar
          </button>

          <button
            className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isOpening}
            onClick={handleConfirm}
            type="button"
          >
            <ExternalLink size={13} />
            Abrir WhatsApp
          </button>
        </div>
      </div>
    </div>
  );
}

function DialogInfo({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 break-words text-xs text-slate-200">{value}</p>
    </div>
  );
}
