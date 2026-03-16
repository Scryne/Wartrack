import type { ReactNode } from "react";
import { cn } from "../lib/utils";

type BadgeVariant = "default" | "danger" | "warn" | "success" | "accent";

const variantClasses: Record<BadgeVariant, string> = {
  default: "border-border-default bg-bg-3 text-text-2",
  accent: "border-accent bg-accent-dim text-text-1",
  danger: "border-danger bg-danger-dim text-text-1",
  warn: "border-border-default bg-bg-4 text-warn",
  success: "border-border-default bg-bg-4 text-success"
};

export interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
}

function Badge({ children, variant = "default" }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.22em]",
        variantClasses[variant]
      )}
    >
      {children}
    </span>
  );
}

export default Badge;
