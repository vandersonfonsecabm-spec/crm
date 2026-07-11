import { LoaderCircle } from "lucide-react";
import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "./utils";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive" | "subtle";
export type ButtonSize = "sm" | "md";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary: "border-[var(--primary)] bg-[var(--primary)] text-white hover:border-[var(--primary-hover)] hover:bg-[var(--primary-hover)]",
  secondary: "border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-muted)] hover:text-[var(--text-primary)]",
  ghost: "border-transparent bg-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-muted)] hover:text-[var(--text-primary)]",
  destructive: "border-[var(--danger)] bg-[var(--danger)] text-white hover:brightness-95",
  subtle: "border-[var(--border-default)] bg-[var(--bg-muted)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 px-2.5 text-[11px]",
  md: "h-9 gap-2 px-3 text-xs",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { children, className, disabled, leftIcon, loading = false, rightIcon, size = "md", type = "button", variant = "secondary", ...props },
  ref,
) {
  return (
    <button
      {...props}
      className={cx(
        "relative inline-flex shrink-0 items-center justify-center rounded-md border font-semibold shadow-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:cursor-not-allowed disabled:border-[var(--border-strong)] disabled:bg-[var(--disabled-bg)] disabled:text-[var(--disabled-text)] disabled:shadow-none",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      disabled={disabled || loading}
      ref={ref}
      type={type}
    >
      <span className={cx("inline-flex items-center justify-center", size === "sm" ? "gap-1.5" : "gap-2", loading && "invisible")}>
        {leftIcon}
        {children}
        {rightIcon}
      </span>
      {loading && <LoaderCircle aria-hidden="true" className="absolute animate-spin" size={15} />}
    </button>
  );
});

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "children"> & {
  "aria-label": string;
  children: ReactNode;
  size?: ButtonSize;
  variant?: "secondary" | "ghost" | "destructive";
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { "aria-label": ariaLabel, children, className, size = "sm", title, type = "button", variant = "ghost", ...props },
  ref,
) {
  return (
    <button
      {...props}
      aria-label={ariaLabel}
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-md border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:cursor-not-allowed disabled:bg-[var(--disabled-bg)] disabled:text-[var(--disabled-text)]",
        size === "sm" ? "h-8 w-8" : "h-9 w-9",
        variantClasses[variant],
        className,
      )}
      ref={ref}
      title={title ?? ariaLabel}
      type={type}
    >
      {children}
    </button>
  );
});
