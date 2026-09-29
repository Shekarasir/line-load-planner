// Thin fetch wrapper for the API. Errors carry the server's validation details
// so forms can show them.
//
// Two backends share this client:
//  - Node/Express (default): REST paths under /api
//  - PHP hosting (VITE_BACKEND=php): everything goes through api.php?r=/path, and
//    PUT/PATCH/DELETE are sent as POST ?_method=… because many shared hosts block them.
export const IS_PHP = import.meta.env.VITE_BACKEND === 'php';

/** Absolute-or-relative URL for an API path such as "/users?status=Active". */
export function apiUrl(path) {
  if (!IS_PHP) return `/api${path}`;
  const [p, query] = path.split('?');
  return `api.php?r=${encodeURIComponent(p)}${query ? `&${query}` : ''}`;
}

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details || [];
  }
}

async function request(method, url, body) {
  let target = apiUrl(url);
  let httpMethod = method;
  if (IS_PHP && method !== 'GET' && method !== 'POST') {
    target += `&_method=${method}`;
    httpMethod = 'POST';
  }
  const res = await fetch(target, {
    method: httpMethod,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  // Session expired or signed out elsewhere: tell the app to show the login screen.
  if (res.status === 401 && !url.startsWith('/auth/')) {
    window.dispatchEvent(new Event('tna:unauthorized'));
  }
  if (!res.ok) throw new ApiError(data.error || `Request failed (${res.status})`, res.status, data.details);
  return data;
}

export const api = {
  auth: {
    me: () => request('GET', '/auth/me'),
    status: () => request('GET', '/auth/status'),
    setup: (account) => request('POST', '/auth/setup', account),
    login: (username, password) => request('POST', '/auth/login', { username, password }),
    logout: () => request('POST', '/auth/logout'),
    changePassword: (current_password, new_password) =>
      request('POST', '/auth/password', { current_password, new_password }),
  },
  accounts: {
    list: () => request('GET', '/accounts'),
    create: (account) => request('POST', '/accounts', account),
    update: (id, account) => request('PUT', `/accounts/${id}`, account),
    remove: (id) => request('DELETE', `/accounts/${id}`),
  },
  users: {
    list: (status) => request('GET', `/users${status ? `?status=${encodeURIComponent(status)}` : ''}`),
    create: (user) => request('POST', '/users', user),
    update: (id, user) => request('PUT', `/users/${id}`, user),
    remove: (id) => request('DELETE', `/users/${id}`),
  },
  orders: {
    list: () => request('GET', '/orders'),
    get: (id) => request('GET', `/orders/${id}`),
    create: (doc) => request('POST', '/orders', doc),
    update: (id, doc) => request('PUT', `/orders/${id}`, doc),
    remove: (id) => request('DELETE', `/orders/${id}`),
  },
  backupUrl: () => apiUrl('/backup'),
  progress: {
    task: (id, patch) => request('PATCH', `/tasks/${id}`, patch),
    subtask: (id, patch) => request('PATCH', `/subtasks/${id}`, patch),
    openItems: () => request('GET', '/open-items'),
  },
};

export function errorText(err) {
  if (err instanceof ApiError && err.details?.length) return `${err.message}: ${err.details.join('; ')}`;
  return err?.message || String(err);
}
