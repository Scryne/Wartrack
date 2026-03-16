import { cn } from "../lib/utils";

type SpinnerSize = "sm" | "md";

const sizeClasses: Record<SpinnerSize, string> = {
  sm: "h-4 w-4 border-[2px]",
  md: "h-6 w-6 border-[3px]"
};

export interface SpinnerProps {
  size?: SpinnerSize;
}

function Spinner({ size = "md" }: SpinnerProps) {
  return (
    <span
      aria-label="Loading"
      className={cn(
        "inline-block animate-spin rounded-full border-border-default border-r-accent",
        sizeClasses[size]
      )}
    />
  );
}

export default Spinner;
