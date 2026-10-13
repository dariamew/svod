export async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${url}`, { ...options, headers: options.body instanceof FormData ? options.headers : { 'Content-Type': 'application/json', ...options.headers } });
  const data = await response.json();
  if (!response.ok) { if (response.status === 401 && !url.startsWith('/auth')) window.dispatchEvent(new Event('session-expired')); throw new Error(data.error || 'Не удалось выполнить запрос'); }
  return data as T;
}
export const post = <T>(url: string, body: unknown) => api<T>(url, { method: 'POST', body: JSON.stringify(body) });
