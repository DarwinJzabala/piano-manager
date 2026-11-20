export async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const res = await fetch(`/api/${path}`, {
    ...options,
    headers,
    credentials: 'same-origin'
  });
  if (!res.ok) {
    let message = `Error HTTP ${res.status}`;
    let data = null;
    try {
      data = await res.json();
      if (data && data.error) message = data.error;
    } catch (_) { /* respuesta no JSON */ }
    if (res.status === 401 && !path.startsWith('auth/'))
      window.dispatchEvent(new CustomEvent('pm:unauthorized', { detail: message }));
    const error = new Error(message);
    error.status = res.status;
    error.data = data;
    throw error;
  }
  return res.json();
}

export const get = (path) => api(path);
export const post = (path, data) => api(path, { method: 'POST', body: JSON.stringify(data) });
export const put = (path, data) => api(path, { method: 'PUT', body: JSON.stringify(data) });
export const del = (path) => api(path, { method: 'DELETE' });
