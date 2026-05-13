export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';
export const AUTH_TOKEN_KEY = 'clipmeet_token';

export function getAuthToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY) || '';
}

export function getAuthHeaders(extraHeaders = {}) {
  const token = getAuthToken();

  return {
    ...extraHeaders,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export function authFetch(url, options = {}) {
  return fetch(url, {
    ...options,
    headers: getAuthHeaders(options.headers || {}),
  });
}
