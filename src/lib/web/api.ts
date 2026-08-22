
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  status?: number
  /** Set by the API when an account is pending approval or suspended. */
  code?: string
}

export async function apiRequest<T = unknown>(
  endpoint: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(`/api${endpoint}`, {
      ...options,
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers ?? {}),
      },
    })

    const body = await res.json().catch(() => null)

    if (!res.ok) {
      return {
        success: false,
        status: res.status,
        error: body?.error ?? `Request failed (${res.status})`,
        code: body?.code,
        // Some failures carry a payload that matters — a 402 from
        // mark-complete-provider returns the token the provider still owes.
        data: (body ?? undefined) as T | undefined,
      }
    }

    // Routes are inconsistent in two ways. Some return the payload bare, some
    // wrap it in {success, data}, and several of the payment routes put the
    // payload alongside `success` at the root — {success, checkout_url, …}.
    // Normalise all three so `data` always holds the payload.
    if (body && typeof body === 'object' && 'success' in body) {
      const b = body as ApiResponse<T> & Record<string, unknown>
      return 'data' in b ? b : { ...b, data: b as unknown as T }
    }
    return { success: true, data: body as T }
  } catch {
    return { success: false, error: 'Could not reach the server' }
  }
}

export const api = {
  get: <T = unknown>(endpoint: string) => apiRequest<T>(endpoint),
  post: <T = unknown>(endpoint: string, body?: unknown) =>
    apiRequest<T>(endpoint, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  put: <T = unknown>(endpoint: string, body?: unknown) =>
    apiRequest<T>(endpoint, { method: 'PUT', body: JSON.stringify(body ?? {}) }),
  patch: <T = unknown>(endpoint: string, body?: unknown) =>
    apiRequest<T>(endpoint, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  del: <T = unknown>(endpoint: string) => apiRequest<T>(endpoint, { method: 'DELETE' }),

  /** Build a query string, dropping empty values. */
  qs: (params: Record<string, string | number | boolean | null | undefined>) => {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      if (v !== null && v !== undefined && v !== '') q.set(k, String(v))
    }
    const s = q.toString()
    return s ? `?${s}` : ''
  },
}
