export const TOKEN_KEY = 'negocio_token';
export const ROLE_KEY = 'negocio_role';

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? '';
}

export function setToken(token: string, role?: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  if (role) localStorage.setItem(ROLE_KEY, role);
}

export function getRole(): string {
  return localStorage.getItem(ROLE_KEY) ?? '';
}

export function isAdmin(): boolean {
  return getRole() === 'admin';
}

export function isReadOnly(): boolean {
  return getRole() === 'lector';
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ROLE_KEY);
}

export async function api<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(path, {
    method: options.method ?? (options.body !== undefined ? 'POST' : 'GET'),
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 401) {
    clearToken();
    window.location.href = '/';
    throw new Error('Sesión expirada');
  }
  if (!res.ok) {
    let msg = `Error ${res.status}`;
    try {
      const data = await res.json();
      if (data?.error) msg = data.error;
    } catch {
      /* noop */
    }
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function money(n: number): string {
  try {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n ?? 0);
  } catch {
    return `$ ${n ?? 0}`;
  }
}

export function fmtDate(iso: string): string {
  if (!iso) return '';
  return iso.replace('T', ' ').slice(0, 16);
}
