import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { ToastProvider } from './components/Toast.jsx';
import { AuthGate } from './components/Auth.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthGate>
          <App />
        </AuthGate>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
