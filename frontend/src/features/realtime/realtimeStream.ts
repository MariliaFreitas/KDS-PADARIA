import type { RealtimeEvent, RealtimeStatus } from "./realtime.types.js";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3333";

// Backoff curto e limitado: 1s, 2s, 5s, 10s — depois repete no teto.
const RECONNECT_DELAYS_MS = [1000, 2000, 5000, 10000];

interface ConnectRealtimeStreamOptions {
  token: string;
  onEvent: (event: RealtimeEvent) => void;
  onStatusChange: (status: RealtimeStatus) => void;
}

export interface RealtimeConnection {
  close: () => void;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/**
 * Abre o stream com fetch + ReadableStream — nunca EventSource nativo, que
 * não manda header nenhum e exigiria o token na URL. Reconecta sozinho com
 * backoff curto; em 401/403 (sessão inválida/expirada) para de tentar.
 */
export function connectRealtimeStream(options: ConnectRealtimeStreamOptions): RealtimeConnection {
  const { token, onEvent, onStatusChange } = options;

  let closed = false;
  let attempt = 0;
  let controller: AbortController | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  function handleRawEvent(rawEvent: string): void {
    for (const line of rawEvent.split("\n")) {
      // Linhas de comentário (heartbeat) começam com ":" — não são dado.
      if (!line.startsWith("data:")) continue;

      const json = line.slice("data:".length).trim();
      if (!json) continue;

      try {
        onEvent(JSON.parse(json) as RealtimeEvent);
      } catch {
        // Linha malformada isolada não deveria derrubar a conexão inteira.
      }
    }
  }

  function scheduleReconnect(): void {
    if (closed) return;
    onStatusChange("reconnecting");
    const delay = RECONNECT_DELAYS_MS[Math.min(attempt, RECONNECT_DELAYS_MS.length - 1)];
    attempt += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void connect();
    }, delay);
  }

  async function connect(): Promise<void> {
    if (closed) return;

    controller = new AbortController();

    try {
      const response = await fetch(`${API_URL}/api/realtime/events`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });

      if (response.status === 401 || response.status === 403) {
        onStatusChange("stopped");
        return;
      }

      if (!response.ok || !response.body) {
        throw new Error(`Stream em tempo real respondeu com status ${response.status}.`);
      }

      attempt = 0;
      onStatusChange("connected");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (!closed) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let separatorIndex = buffer.indexOf("\n\n");
        while (separatorIndex !== -1) {
          handleRawEvent(buffer.slice(0, separatorIndex));
          buffer = buffer.slice(separatorIndex + 2);
          separatorIndex = buffer.indexOf("\n\n");
        }
      }
    } catch (error) {
      if (closed || isAbortError(error)) {
        return;
      }
      // Erro de rede/parse — cai pro reconnect abaixo.
    }

    if (closed) return;
    scheduleReconnect();
  }

  void connect();

  return {
    close() {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      controller?.abort();
    },
  };
}
