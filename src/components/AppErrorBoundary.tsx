import React from 'react';

type AppErrorBoundaryState = {
  error?: Error;
};

export class AppErrorBoundary extends React.Component<React.PropsWithChildren, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {};

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('App render failed', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="app-shell" style={{ padding: 24, display: 'block', overflow: 'auto' }}>
          <h1 style={{ margin: '0 0 12px', fontSize: 20 }}>应用启动失败</h1>
          <p style={{ margin: '0 0 12px' }}>前端渲染时发生错误。请打开开发者工具查看 Console，或把下面错误发给开发者。</p>
          <pre style={{ whiteSpace: 'pre-wrap', background: 'var(--panel-2)', padding: 14, borderRadius: 12 }}>
            {this.state.error.stack || this.state.error.message}
          </pre>
        </div>
      );
    }

    return this.props.children;
  }
}
