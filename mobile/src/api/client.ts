// Thin typed fetch wrapper. Attaches the JWT (via an injected getter so this
// module never has to import the auth store directly) and normalizes errors
// into the { message, code } shape described in API_CONTRACT.md.

// Default target: the Android emulator's special alias for the host
// machine's localhost, where a locally-run backend listens on port 4000.
//   - Physical Android device on the same Wi-Fi as your dev machine: set
//     EXPO_PUBLIC_API_URL=http://<your-machine-lan-ip>:4000/api
//   - iOS simulator: http://localhost:4000/api works directly.
//   - Production / staging: point at the deployed backend's https URL.
// Set EXPO_PUBLIC_API_URL in a `.env` file (see README) to override.
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:4000/api';

type TokenGetter = () => string | null;

let getToken: TokenGetter = () => null;

/** Wired up once by the auth store so this module can read the current JWT. */
export function setTokenGetter(fn: TokenGetter): void {
  getToken = fn;
}

export class ApiRequestError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = 'ApiRequestError';
    this.code = code;
    this.status = status;
  }
}

type QueryValue = string | number | boolean | undefined;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
  body?: unknown;
  isFormData?: boolean;
  query?: Record<string, QueryValue>;
}

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const params: string[] = [];
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        params.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
      }
    }
  }
  const qs = params.length > 0 ? `?${params.join('&')}` : '';
  return `${API_URL}${path}${qs}`;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, isFormData, query } = options;
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload: BodyInit | undefined;
  if (body !== undefined) {
    if (isFormData) {
      payload = body as FormData;
    } else {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), { method, headers, body: payload });
  } catch {
    throw new ApiRequestError(
      'Could not reach the server. Check your connection and API URL.',
      'NETWORK_ERROR',
      0,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = undefined;
  }

  if (!response.ok) {
    const errBody = data as { error?: { message?: string; code?: string } } | undefined;
    const message = errBody?.error?.message ?? `Request failed with status ${response.status}`;
    const code = errBody?.error?.code ?? 'UNKNOWN_ERROR';
    throw new ApiRequestError(message, code, response.status);
  }

  return data as T;
}

export const api = {
  get: <T,>(path: string, query?: Record<string, QueryValue>) =>
    request<T>(path, { method: 'GET', query }),
  post: <T,>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  postForm: <T,>(path: string, form: FormData) =>
    request<T>(path, { method: 'POST', body: form, isFormData: true }),
  patch: <T,>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T,>(path: string, body?: unknown) => request<T>(path, { method: 'DELETE', body }),
};
