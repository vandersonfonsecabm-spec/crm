import { forwardRef, useId } from "react";
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cx } from "./utils";

const fieldClass = "h-9 w-full rounded-md border border-[var(--control-border)] bg-[var(--control-bg)] px-3 text-xs text-[var(--control-text)] shadow-none outline-none transition-colors placeholder:text-[var(--control-placeholder)] hover:border-[var(--control-border-hover)] focus:border-[var(--control-border-focus)] focus:ring-2 focus:ring-[var(--control-ring)] focus-visible:outline-none disabled:cursor-not-allowed disabled:border-[var(--control-border)] disabled:bg-[var(--control-bg-disabled)] disabled:text-[var(--disabled-text)] disabled:opacity-100";

type FieldMetaProps = {
  label?: ReactNode;
  helperText?: ReactNode;
  error?: ReactNode;
  containerClassName?: string;
};

function FieldFrame({ children, containerClassName, error, helperText, id, label }: FieldMetaProps & { children: ReactNode; id: string }) {
  const descriptionId = error || helperText ? `${id}-description` : undefined;
  return (
    <div className={cx("grid min-w-0 gap-1.5", containerClassName)}>
      {label && <label className="text-[11px] font-medium text-[var(--text-secondary)]" htmlFor={id}>{label}</label>}
      {children}
      {(error || helperText) && (
        <p className={cx("text-[10px] leading-4", error ? "text-[var(--danger)]" : "text-[var(--text-muted)]")} id={descriptionId}>
          {error ?? helperText}
        </p>
      )}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & FieldMetaProps>(function Input(
  { className, containerClassName, error, helperText, id: providedId, label, ...props },
  ref,
) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  return (
    <FieldFrame containerClassName={containerClassName} error={error} helperText={helperText} id={id} label={label}>
      <input {...props} aria-describedby={error || helperText ? `${id}-description` : undefined} aria-invalid={Boolean(error)} className={cx(fieldClass, Boolean(error) && "border-[var(--control-error)] focus:border-[var(--control-error)] focus:ring-[color:rgba(179,58,69,0.14)]", className)} data-ui-control id={id} ref={ref} />
    </FieldFrame>
  );
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & FieldMetaProps>(function Select(
  { children, className, containerClassName, error, helperText, id: providedId, label, ...props },
  ref,
) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  return (
    <FieldFrame containerClassName={containerClassName} error={error} helperText={helperText} id={id} label={label}>
      <select {...props} aria-describedby={error || helperText ? `${id}-description` : undefined} aria-invalid={Boolean(error)} className={cx(fieldClass, Boolean(error) && "border-[var(--control-error)] focus:border-[var(--control-error)] focus:ring-[color:rgba(179,58,69,0.14)]", className)} data-ui-control id={id} ref={ref}>{children}</select>
    </FieldFrame>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & FieldMetaProps>(function Textarea(
  { className, containerClassName, error, helperText, id: providedId, label, ...props },
  ref,
) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  return (
    <FieldFrame containerClassName={containerClassName} error={error} helperText={helperText} id={id} label={label}>
      <textarea {...props} aria-describedby={error || helperText ? `${id}-description` : undefined} aria-invalid={Boolean(error)} className={cx(fieldClass, "h-auto min-h-24 resize-y py-2", Boolean(error) && "border-[var(--control-error)] focus:border-[var(--control-error)] focus:ring-[color:rgba(179,58,69,0.14)]", className)} data-ui-control id={id} ref={ref} />
    </FieldFrame>
  );
});
