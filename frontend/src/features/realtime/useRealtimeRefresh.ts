import { useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext.js";
import { connectRealtimeStream } from "./realtimeStream.js";
import type { RealtimeEvent, RealtimeScope, RealtimeStatus } from "./realtime.types.js";

// Janela curta pra juntar eventos que chegam em rajada (ex: pagamento
// confirmado publica cashier+orders+delivery de uma vez) num único refetch,
// em vez de um GET por evento.
const BURST_COALESCE_MS = 200;

interface UseRealtimeRefreshOptions {
  /** A tela assina estes escopos — qualquer evento fora deles é ignorado. */
  scopes: RealtimeScope[];
  /**
   * Filtro fino por evento (orderId/stationId da própria tela). Ausente =
   * todo evento nos escopos assinados dispara refresh.
   */
  shouldRefresh?: (event: RealtimeEvent) => boolean;
  /** GET que a tela já faz normalmente — nunca recebe dado do evento em si. */
  onRefresh: () => void | Promise<void>;
}

/**
 * Abstração única de tempo real pra todas as telas operacionais: abre um
 * stream, filtra por escopo, junta rajadas de eventos num só refetch, e
 * refaz o GET sozinho sempre que a conexão volta de uma instabilidade —
 * mesmo quando essa instabilidade é anterior à primeira conexão bem-sucedida
 * (rede caiu antes do primeiro connect). Sem replay: o refetch completo
 * substitui reproduzir eventos perdidos. Fecha a conexão no unmount.
 *
 * onRefresh/shouldRefresh vivem em refs: só token e escopos reabrem a
 * conexão, nunca uma nova identidade de callback a cada render.
 */
export function useRealtimeRefresh({
  scopes,
  shouldRefresh,
  onRefresh,
}: UseRealtimeRefreshOptions): RealtimeStatus {
  const { token } = useAuth();
  const [status, setStatus] = useState<RealtimeStatus>("connecting");

  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  const shouldRefreshRef = useRef(shouldRefresh);
  shouldRefreshRef.current = shouldRefresh;

  const scopesKey = scopes.join(",");

  useEffect(() => {
    if (!token) return;

    const activeScopes = scopesKey.split(",").filter(Boolean) as RealtimeScope[];

    // true assim que o status passar por "reconnecting" — inclusive antes
    // da primeira conexão bem-sucedida. É esse flag que decide se um
    // "connected" precisa refazer o GET, não "já conectou antes".
    let everReconnected = false;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let refreshInFlight = false;
    let refreshPendingAfter = false;
    // true no cleanup: não cancela um onRefresh já em andamento, só impede
    // que ele dispare um novo refresh ao terminar e bloqueia schedule/run novos.
    let disposed = false;

    function runRefresh(): void {
      if (disposed) return;
      if (refreshInFlight) {
        refreshPendingAfter = true;
        return;
      }
      refreshInFlight = true;
      Promise.resolve(onRefreshRef.current())
        .catch(() => {
          // A própria tela já mostra erro de REST no fluxo normal de
          // carregamento — não é papel do realtime duplicar isso.
        })
        .finally(() => {
          refreshInFlight = false;
          if (disposed) return;
          if (refreshPendingAfter) {
            refreshPendingAfter = false;
            runRefresh();
          }
        });
    }

    function scheduleRefresh(): void {
      if (disposed || refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        runRefresh();
      }, BURST_COALESCE_MS);
    }

    const connection = connectRealtimeStream({
      token,
      onEvent: (event) => {
        if (!event.scopes.some((scope) => activeScopes.includes(scope))) return;
        if (shouldRefreshRef.current && !shouldRefreshRef.current(event)) return;
        scheduleRefresh();
      },
      onStatusChange: (nextStatus) => {
        setStatus(nextStatus);
        if (nextStatus === "reconnecting") {
          everReconnected = true;
        }
        if (nextStatus === "connected" && everReconnected) {
          scheduleRefresh();
        }
      },
    });

    return () => {
      disposed = true;
      connection.close();
      if (refreshTimer) clearTimeout(refreshTimer);
    };
  }, [token, scopesKey]);

  return status;
}
