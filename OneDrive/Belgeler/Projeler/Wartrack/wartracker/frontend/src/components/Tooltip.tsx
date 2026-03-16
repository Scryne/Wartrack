import type { ReactNode } from "react";

export interface TooltipProps {
  children: ReactNode;
  label: string;
}

function Tooltip({ children, label }: TooltipProps) {
  return (
    <span className="group relative inline-flex" tabIndex={0}>
      <span className="absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-[var(--radius-sm)] border border-border-default bg-bg-1 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-text-1 opacity-0 transition duration-150 pointer-events-none group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100">
        {label}
      </span>
      <span className="inline-flex items-center">{children}</span>
    </span>
  );
}

export default Tooltip;
