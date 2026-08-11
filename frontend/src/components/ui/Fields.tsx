import { forwardRef, useId } from "react";
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cx } from "./utils";

const fieldClass = "h-9 w-full rounded-[5px] border border-[var(--control-border)] bg-[var(--control-bg)] px-3 text-xs text-[var(--control-text)] shadow-none outline-none transition-[border-color,background-color] placeholder:text-[var(--control-placeholder)] hover:border-[var(--control-border-hover)] focus:border-[var(--control-border-focus)] focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-[var(--focus-ring)] disabled:cursor-not-allowed disabled:border-[var(--control-border)] disabled:bg-[var(--control-bg-disabled)] disabled:text-[var(--disabled-text)] disabled:opacity-100";

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
      {label && <label className="text-xs font-medium text-[var(--text-secondary)]" htmlFor={id}>{label}</label>}
      {children}
      {(error || helperText) && (
        <p className={cx("text-[11px] leading-4", error ? "text-[var(--danger)]" : "text-[var(--text-muted)]")} id={descriptionId}>
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
      <input {...props} aria-describedby={error || helperText ? `${id}-description` : undefined} aria-invalid={Boolean(error)} className={cx(fieldClass, Boolean(error) && "border-[var(--control-error)] focus:border-[var(--control-error)] focus:outline-[var(--control-error)]", className)} data-ui-control id={id} ref={ref} />
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
      <select {...props} aria-describedby={error || helperText ? `${id}-description` : undefined} aria-invalid={Boolean(error)} className={cx(fieldClass, Boolean(error) && "border-[var(--control-error)] focus:border-[var(--control-error)] focus:outline-[var(--control-error)]", className)} data-ui-control id={id} ref={ref}>{children}</select>
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
      <textarea {...props} aria-describedby={error || helperText ? `${id}-description` : undefined} aria-invalid={Boolean(error)} className={cx(fieldClass, "h-auto min-h-24 resize-y py-2", Boolean(error) && "border-[var(--control-error)] focus:border-[var(--control-error)] focus:outline-[var(--control-error)]", className)} data-ui-control id={id} ref={ref} />
    </FieldFrame>
  );
});
