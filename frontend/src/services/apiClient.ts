const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3333";

/**
 * Erro devolvido pela API.
 *
 * Prefira decidir o fluxo pelo `code`, não pela `message`: o texto é de
 * interface e pode mudar, o código é contrato. A lista de códigos vive em
 * backend/src/lib/error-codes.ts.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string | null = null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions extends RequestInit {
  token?: string | null;
}

interface ApiErrorBody {
  error?: string;
  code?: string;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { token, headers, ...rest } = options;

  const response = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const body = data as ApiErrorBody | null;
    const message = body?.error ?? "Erro inesperado. Tente novamente.";
    throw new ApiError(message, response.status, body?.code ?? null);
  }

  return data as T;
}
