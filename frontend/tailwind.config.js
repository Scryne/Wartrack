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
        accent: "var(--accent)",
        "accent-dim": "var(--accent-dim)",
        danger: "var(--danger)",
        "danger-dim": "var(--danger-dim)",
        warn: "var(--warn)",
        "warn-dim": "var(--warn-dim)",
        success: "var(--success)",
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
