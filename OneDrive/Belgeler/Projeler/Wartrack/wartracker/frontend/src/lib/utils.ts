import { format } from "date-fns";
import { tr } from "date-fns/locale";
import type { ClassValue } from "clsx";
import clsx from "clsx";

export function cn(...classes: ClassValue[]): string {
  return clsx(...classes);
}

export function formatDate(date: Date | string | number): string {
  const normalized = date instanceof Date ? date : new Date(date);

  if (Number.isNaN(normalized.getTime())) {
    return "--";
  }

  return format(normalized, "dd MMM HH:mm", { locale: tr });
}

export function truncate(str: string, n: number): string {
  if (str.length <= n) {
    return str;
  }

  if (n <= 3) {
    return str.slice(0, n);
  }

  return `${str.slice(0, n - 3)}...`;
}

export function severityColor(level: 1 | 2 | 3 | 4 | 5): string {
  const scale = {
    1: "var(--success)",
    2: "var(--accent)",
    3: "var(--warn)",
    4: "var(--danger)",
    5: "var(--danger)"
  } as const;

  return scale[level];
}
