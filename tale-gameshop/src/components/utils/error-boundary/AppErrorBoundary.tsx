import React from 'react';
import i18n from '../../../i18n';

type AppErrorBoundaryState = {
    hasError: boolean;
};

// Глобальная страховка: необработанная ошибка рендера в любом компоненте
// больше не превращает сайт в белый экран — показываем аккуратный fallback.
class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, AppErrorBoundaryState> {
    state: AppErrorBoundaryState = { hasError: false };

    static getDerivedStateFromError(): AppErrorBoundaryState {
        return { hasError: true };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error('Unhandled render error:', error, info.componentStack);
    }

    render() {
        if (!this.state.hasError) {
            return this.props.children;
        }

        return (
            <div
                style={{
                    minHeight: '100vh',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 16,
                    background: '#f6f2fb',
                    color: '#2b2350',
                    fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
                    textAlign: 'center',
                    padding: 24
                }}
            >
                <div style={{ fontSize: 48 }}>😵</div>
                <h1 style={{ margin: 0, fontSize: 24 }}>{i18n.t('errorBoundary.title')}</h1>
                <p style={{ margin: 0, color: '#6c6393', maxWidth: 420 }}>{i18n.t('errorBoundary.text')}</p>
                <button
                    type="button"
                    onClick={() => window.location.reload()}
                    style={{
                        marginTop: 8,
                        padding: '10px 24px',
                        borderRadius: 6,
                        border: 'none',
                        background: '#6b3ff2',
                        color: '#ffffff',
                        fontWeight: 600,
                        fontSize: 14,
                        cursor: 'pointer'
                    }}
                >
                    {i18n.t('errorBoundary.reload')}
                </button>
            </div>
        );
    }
}

export default AppErrorBoundary;
