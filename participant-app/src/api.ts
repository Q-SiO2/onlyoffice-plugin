export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export async function request<T>(
  base: string,
  path: string,
  token = '',
  body?: unknown,
  method?: string,
): Promise<T> {
  const res = await fetch(base + path, {
    method: method || (body === undefined ? 'GET' : 'POST'),
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new ApiError(
      res.status,
      error.code || 'ERROR',
      error.message || 'Connexion impossible. Réessayez.',
    );
  }
  return res.json() as Promise<T>;
}
export async function downloadCsv(base: string, token: string, session: string) {
  const res = await fetch(`${base}/api/admin/export?session=${encodeURIComponent(session)}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error('Export impossible.');
  downloadBlob(await res.blob(), 'paloalto-results.csv');
}
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
