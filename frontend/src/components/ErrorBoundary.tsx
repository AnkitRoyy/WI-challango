import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an unhandled error:", error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#F8FAFC",
            padding: "20px",
            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          }}
        >
          <div
            style={{
              maxWidth: "500px",
              width: "100%",
              backgroundColor: "#FFFFFF",
              borderRadius: "12px",
              padding: "32px",
              textAlign: "center",
              boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.05)",
              border: "1px solid #E2E8F0",
            }}
          >
            <div
              style={{
                width: "56px",
                height: "56px",
                backgroundColor: "#FEF2F2",
                color: "#EF4444",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 16px auto",
                fontSize: "28px",
              }}
            >
              ⚠️
            </div>
            <h2
              style={{
                fontSize: "20px",
                fontWeight: 700,
                color: "#1E293B",
                marginBottom: "8px",
                marginTop: 0,
              }}
            >
              Something went wrong
            </h2>
            <p
              style={{
                fontSize: "14px",
                color: "#64748B",
                lineHeight: 1.5,
                marginBottom: "20px",
                marginTop: 0,
              }}
            >
              An unexpected error occurred in this view. Your session and database data remain safe and intact.
            </p>
            {this.state.error?.message && (
              <div
                style={{
                  backgroundColor: "#FEF2F2",
                  border: "1px solid #FEE2E2",
                  borderRadius: "8px",
                  padding: "12px",
                  marginBottom: "20px",
                  textAlign: "left",
                  fontSize: "12px",
                  fontFamily: "monospace",
                  color: "#B91C1C",
                  wordBreak: "break-word",
                  maxHeight: "120px",
                  overflowY: "auto",
                }}
              >
                {this.state.error.message}
              </div>
            )}
            <button
              onClick={this.handleReset}
              style={{
                backgroundColor: "#2563EB",
                color: "#FFFFFF",
                border: "none",
                borderRadius: "8px",
                padding: "10px 24px",
                fontSize: "14px",
                fontWeight: 600,
                cursor: "pointer",
                transition: "background-color 0.2s",
              }}
              onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#1D4ED8")}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "#2563EB")}
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
