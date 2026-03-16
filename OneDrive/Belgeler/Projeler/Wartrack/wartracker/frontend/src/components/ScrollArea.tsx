import type { ReactNode } from "react";
import { cn } from "../lib/utils";

export interface ScrollAreaProps {
  children: ReactNode;
  className?: string;
}

function ScrollArea({ children, className }: ScrollAreaProps) {
  return <div className={cn("min-h-0 overflow-y-auto", className)}>{children}</div>;
}

export default ScrollArea;
