import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles.css';
import App from './App';

class RootErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error('ROOT CRASH ERROR:', error);
    console.error('ROOT CRASH STACK:', error?.stack);
    console.error('COMPONENT STACK:', info?.componentStack);
    this.setState({ info });
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: '2rem', fontFamily: 'monospace', background: '#1a1a1a', color: '#ff4444', minHeight: '100vh' }}>
          <h1 style={{ color: '#ff6666', marginBottom: '1rem' }}>⚠️ App Crash Detected</h1>
          <h3 style={{ color: '#ffaa44' }}>Error Message:</h3>
          <pre style={{ background: '#2a0000', padding: '1rem', borderRadius: '8px', overflow: 'auto', color: '#ff8888' }}>
            {this.state.error?.message}
          </pre>
          <h3 style={{ color: '#ffaa44', marginTop: '1rem' }}>Stack Trace:</h3>
          <pre style={{ background: '#2a0000', padding: '1rem', borderRadius: '8px', overflow: 'auto', color: '#ff8888', fontSize: '0.75rem' }}>
            {this.state.error?.stack}
          </pre>
          <h3 style={{ color: '#ffaa44', marginTop: '1rem' }}>Component Stack:</h3>
          <pre style={{ background: '#2a0000', padding: '1rem', borderRadius: '8px', overflow: 'auto', color: '#ffcc88', fontSize: '0.75rem' }}>
            {this.state.info?.componentStack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <RootErrorBoundary>
    <App />
  </RootErrorBoundary>
);

// Register PWA Service Worker for offline capability
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => {
        console.log('Baseera PWA Service Worker registered:', reg.scope);
      })
      .catch((err) => {
        console.error('Service Worker registration failed:', err);
      });
  });
}

