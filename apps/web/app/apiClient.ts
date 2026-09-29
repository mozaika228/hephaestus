export function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  return fetch(input, { ...init, headers, cache: "no-store", credentials: "include" });
}
