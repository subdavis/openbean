/** Same-origin JSON fetch. Throws the server's `error` string so views can just print it. */
async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    method,
  });
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(detail?.error || `${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  del: <T>(path: string) => req<T>("DELETE", path),
  get: <T>(path: string) => req<T>("GET", path),
  patch: <T>(path: string, body?: unknown) => req<T>("PATCH", path, body),
  post: <T>(path: string, body?: unknown) => req<T>("POST", path, body),
};

/** Direct-to-bucket PUT — not /api, no credentials, signature is in the query string. */
export async function uploadToBucket(url: string, body: Blob) {
  const res = await fetch(url, {
    body,
    headers: { "Content-Type": body.type },
    method: "PUT",
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
}
