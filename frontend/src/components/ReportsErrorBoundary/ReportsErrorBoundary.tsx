import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
    children: ReactNode;
    fallbackTitle?: string;
    fallbackMessage?: string;
    onReset?: () => void;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ReportsErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('ReportsErrorBoundary caught an error:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="card" style={{ padding: 32, margin: '24px auto', maxWidth: 640, textAlign: 'center' }}>
                    <AlertTriangle size={36} color="#ee5d50" style={{ margin: '0 auto 12px' }} />
                    <h4 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 600 }}>
                        {this.props.fallbackTitle || 'Unable to Display Reports'}
                    </h4>
                    <p style={{ margin: '0 0 16px', color: 'var(--text-secondary)', fontSize: 14 }}>
                        {this.props.fallbackMessage || 'An unexpected error occurred while loading this report view.'}
                    </p>
                    {this.state.error?.message && (
                        <div style={{
                            padding: '8px 12px',
                            background: '#fff0f0',
                            border: '1px solid #ffd0d0',
                            borderRadius: '6px',
                            fontSize: '12px',
                            color: '#c53030',
                            marginBottom: '16px',
                            wordBreak: 'break-word',
                            fontFamily: 'monospace'
                        }}>
                            {this.state.error.message}
                        </div>
                    )}
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => {
                            this.setState({ hasError: false, error: null });
                            this.props.onReset?.();
                        }}
                    >
                        <RotateCcw size={14} style={{ marginRight: 6 }} />
                        Try Again
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ReportsErrorBoundary;
