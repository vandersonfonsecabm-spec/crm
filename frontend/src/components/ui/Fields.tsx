import { forwardRef, useId } from "react";
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cx } from "./utils";

const fieldClass = "h-9 w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 text-xs text-[var(--text-primary)] shadow-sm outline-none placeholder:text-[var(--text-muted)] focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15 disabled:cursor-not-allowed disabled:bg-[var(--disabled-bg)] disabled:text-[var(--disabled-text)]";

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
      <input {...props} aria-describedby={error || helperText ? `${id}-description` : undefined} aria-invalid={Boolean(error)} className={cx(fieldClass, Boolean(error) && "border-[var(--danger)]", className)} id={id} ref={ref} />
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
      <select {...props} aria-describedby={error || helperText ? `${id}-description` : undefined} aria-invalid={Boolean(error)} className={cx(fieldClass, Boolean(error) && "border-[var(--danger)]", className)} id={id} ref={ref}>{children}</select>
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
      <textarea {...props} aria-describedby={error || helperText ? `${id}-description` : undefined} aria-invalid={Boolean(error)} className={cx(fieldClass, "h-auto min-h-24 resize-y py-2", Boolean(error) && "border-[var(--danger)]", className)} id={id} ref={ref} />
    </FieldFrame>
  );
});
