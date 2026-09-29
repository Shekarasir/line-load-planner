// Thin fetch wrapper for the Express API. Errors carry the server's
// validation details so forms can show them.
export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details || [];
  }
}

async function request(method, url, body) {
  const res = await fetch(`/api${url}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || `Request failed (${res.status})`, res.status, data.details);
  return data;
}

export const api = {
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
