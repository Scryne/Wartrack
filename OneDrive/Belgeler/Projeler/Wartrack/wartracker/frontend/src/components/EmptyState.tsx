import type { ReactNode } from "react";

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description: string;
}

function EmptyState({ icon, title, description }: EmptyStateProps) {
  return (
    <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-3 rounded-[var(--radius-lg)] border border-dashed border-border-default bg-bg-2 px-6 text-center">
      {icon ? (
        <div className="font-mono text-xs uppercase tracking-[0.24em] text-text-3">{icon}</div>
      ) : null}
      <div className="space-y-2">
        <h3 className="font-display text-2xl uppercase tracking-[0.14em] text-text-2">
          {title}
        </h3>
        <p className="max-w-[28ch] text-sm text-text-2">{description}</p>
      </div>
    </div>
  );
}

export default EmptyState;
