const BASE_URL = '/api';

export async function apiFetch(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${BASE_URL}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
  const token = localStorage.getItem('potentpolicy_token');

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  try {
    const res = await fetch(url, {
      ...options,
      headers,
    });

    const data = await res.json().catch(() => ({}));

    if (res.status === 401) {
      // Do not redirect if it's the participate endpoint or login attempt itself
      if (!endpoint.includes('/auth/login') && !endpoint.includes('/participate')) {
        localStorage.removeItem('potentpolicy_token');
        localStorage.removeItem('potentpolicy_user');
        if (window.location.pathname.startsWith('/dashboard')) {
          window.location.href = '/login?expired=1';
        }
      }
    }

    if (!res.ok) {
      const err = new Error(data.error || data.message || `Request failed with status ${res.status}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }

    return data;
  } catch (err) {
    throw err;
  }
}

export const api = {
  get: (endpoint, options) => apiFetch(endpoint, { method: 'GET', ...options }),
  post: (endpoint, body, options) => apiFetch(endpoint, { method: 'POST', body: JSON.stringify(body), ...options }),
  put: (endpoint, body, options) => apiFetch(endpoint, { method: 'PUT', body: JSON.stringify(body), ...options }),
  patch: (endpoint, body, options) => apiFetch(endpoint, { method: 'PATCH', body: JSON.stringify(body), ...options }),
  del: (endpoint, bodyOrOptions, options) => {
    if (bodyOrOptions && !bodyOrOptions.headers && !bodyOrOptions.method) {
      return apiFetch(endpoint, { method: 'DELETE', body: JSON.stringify(bodyOrOptions), ...options });
    }
    return apiFetch(endpoint, { method: 'DELETE', ...bodyOrOptions });
  },
};

export default api;
