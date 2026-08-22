/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "bg-base": "var(--bg-base)",
        "bg-1": "var(--bg-1)",
        "bg-2": "var(--bg-2)",
        "bg-3": "var(--bg-3)",
        "bg-4": "var(--bg-4)",
        "text-1": "var(--text-1)",
        "text-2": "var(--text-2)",
        "text-3": "var(--text-3)",
        // Channel form so Tailwind can build alpha modifiers
        // (bg-accent/15, bg-success/10, bg-danger/10). A bare var() colour
        // silently drops the /NN modifier instead of emitting a rule.
        accent: "rgb(var(--accent-rgb) / <alpha-value>)",
        "accent-dim": "var(--accent-dim)",
        danger: "rgb(var(--danger-rgb) / <alpha-value>)",
        "danger-dim": "var(--danger-dim)",
        warn: "rgb(var(--warn-rgb) / <alpha-value>)",
        "warn-dim": "var(--warn-dim)",
        success: "rgb(var(--success-rgb) / <alpha-value>)",
        purple: "var(--purple)",
        orange: "var(--orange)",
        "border-default": "var(--border)",
        "border-dim": "var(--border-dim)"
      },
      fontFamily: {
        ui: ["var(--font-ui)"],
        mono: ["var(--font-mono)"],
        display: ["var(--font-display)"]
      }
    }
  },
  plugins: []
};
