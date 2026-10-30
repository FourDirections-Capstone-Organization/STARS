import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, ArrowLeft, RotateCcw } from 'lucide-react';

interface Props {
    children: ReactNode;
    onReset?: () => void;
    fallbackTitle?: string;
    fallbackMessage?: string;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class PerformanceErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('PerformanceErrorBoundary caught an error:', error, errorInfo);
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null });
        this.props.onReset?.();
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="pe-error-card" style={{ margin: '32px auto', maxWidth: 640 }}>
                    <AlertTriangle size={36} color="#ee5d50" />
                    <h4>{this.props.fallbackTitle || 'Unable to Display Performance Review'}</h4>
                    <p>
                        {this.props.fallbackMessage ||
                            'An unexpected error occurred while displaying the review. You can return to the reviews list or retry.'}
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
                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                        {this.props.onReset && (
                            <button
                                type="button"
                                className="pe-btn pe-btn-secondary"
                                onClick={this.handleReset}
                            >
                                <ArrowLeft size={16} />
                                Back to Performance Reviews
                            </button>
                        )}
                        <button
                            type="button"
                            className="pe-btn pe-btn-primary"
                            onClick={() => this.setState({ hasError: false, error: null })}
                        >
                            <RotateCcw size={16} />
                            Try Again
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

