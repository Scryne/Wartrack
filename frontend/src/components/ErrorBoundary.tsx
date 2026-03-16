import React from "react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error("[PanelError]", error, errorInfo);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--danger)",
            background: "var(--bg-1)",
            color: "var(--text-1)"
          }}
        >
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: 1 }}>
            Panel yüklenemedi
          </span>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              border: "1px solid var(--danger)",
              background: "var(--danger-dim)",
              color: "var(--text-1)",
              borderRadius: "var(--radius-sm)",
              padding: "4px 10px",
              cursor: "pointer",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: 0.8
            }}
          >
            Yenile
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
