import type { MouseEventHandler, ReactNode } from "react";
import { cn } from "../lib/utils";

type ButtonVariant = "primary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "border-accent bg-accent-dim text-text-1 hover:bg-bg-4 focus-visible:ring-accent",
  ghost:
    "border-border-default bg-transparent text-text-1 hover:bg-bg-3 focus-visible:ring-border-default",
  danger:
    "border-danger bg-danger-dim text-text-1 hover:bg-bg-4 focus-visible:ring-danger"
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[11px]",
  md: "h-10 px-4 text-xs"
};

export interface ButtonProps {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
}

function Button({
  children,
  variant = "ghost",
  size = "md",
  onClick,
  disabled = false
}: ButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center rounded-[var(--radius-md)] border font-mono uppercase tracking-[0.18em] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-40",
        variantClasses[variant],
        sizeClasses[size]
      )}
    >
      {children}
    </button>
  );
}

export default Button;
