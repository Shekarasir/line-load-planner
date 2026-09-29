import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { CalendarRange, Loader2, LogIn } from 'lucide-react';
import { COMPANY_NAME } from '../../shared/tna.js';
import { api } from '../lib/api.js';

const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

/** Renders the app only for a signed-in user; otherwise shows the login screen. */
export function AuthGate({ children }) {
  const [account, setAccount] = useState(undefined); // undefined = still checking

  useEffect(() => {
    api.auth.me().then(setAccount, () => setAccount(null));
    const onUnauthorized = () => setAccount(null);
    window.addEventListener('tna:unauthorized', onUnauthorized);
    return () => window.removeEventListener('tna:unauthorized', onUnauthorized);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } finally {
      setAccount(null);
    }
  }, []);

  if (account === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }
  if (!account) return <LoginPage onLogin={setAccount} />;
  return <AuthContext.Provider value={{ account, logout }}>{children}</AuthContext.Provider>;
}

function LoginPage({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      onLogin(await api.auth.login(username, password));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-brand-700 to-brand-900 px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-xl bg-brand-50 p-2.5 text-brand-700">
            <CalendarRange className="h-6 w-6" />
          </div>
          <div className="leading-tight">
            <div className="font-semibold text-slate-900">{COMPANY_NAME}</div>
            <div className="text-xs uppercase tracking-wider text-slate-500">Time &amp; Action Calendar</div>
          </div>
        </div>
        <label className="mb-3 block">
          <span className="label">Username</span>
          <input
            className="input"
            autoComplete="username"
            autoCapitalize="none"
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </label>
        <label className="mb-4 block">
          <span className="label">Password</span>
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />} Sign in
        </button>
        <p className="mt-4 text-center text-xs text-slate-500">Forgot your password? Ask your T&amp;A admin to reset it.</p>
      </form>
    </div>
  );
}
