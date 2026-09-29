import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import App from './App.jsx';
import { ToastProvider } from './components/Toast.jsx';
import { AuthGate } from './components/Auth.jsx';
import { IS_PHP } from './lib/api.js';
import './index.css';

// PHP hosting can't rewrite deep links to index.html, so it uses #/ URLs instead.
const Router = IS_PHP ? HashRouter : BrowserRouter;

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Router>
      <ToastProvider>
        <AuthGate>
          <App />
        </AuthGate>
      </ToastProvider>
    </Router>
  </StrictMode>,
);
