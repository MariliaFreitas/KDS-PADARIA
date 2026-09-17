import type { Request, Response } from "express";
import { subscribeToRealtimeEvents } from "./realtime.service.js";
import { filterEventForRole } from "./realtime.permissions.js";
import type { RealtimeEvent } from "./realtime.types.js";

/** Mantém a conexão viva atrás de proxies que fecham sockets ociosos. */
const HEARTBEAT_INTERVAL_MS = 25_000;

/**
 * Abre o stream SSE (`GET /api/realtime/events`). REST continua sendo a
 * fonte da verdade — este endpoint só empurra sinais de invalidação.
 *
 * Cada evento é reduzido aos escopos do papel autenticado
 * (filterEventForRole) antes de ser escrito no socket.
 *
 * A promise só resolve quando a conexão fecha — por qualquer motivo:
 * desconexão normal (req "close"), erro assíncrono de socket (req/res
 * "error"), ou falha síncrona ao escrever (safeWrite). Todos os caminhos
 * passam por close(), que é idempotente e remove os próprios listeners de
 * req/res — nenhum fica preso depois do encerramento.
 */
export function streamEventsHandler(req: Request, res: Response): Promise<void> {
  // authenticate garante req.user aqui (roda antes na cadeia de middlewares).
  const role = req.user!.role;

  return new Promise((resolve) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    // Sem isto, o Node só manda os headers junto do primeiro write().
    res.flushHeaders();

    let closed = false;

    function close(): void {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      unsubscribe();
      req.off("close", close);
      req.off("error", close);
      res.off("close", close);
      res.off("error", close);
      resolve();
    }

    /** Uma escrita que falha (socket já morto) encerra só esta conexão. */
    function safeWrite(chunk: string): void {
      try {
        res.write(chunk);
      } catch {
        close();
      }
    }

    const unsubscribe = subscribeToRealtimeEvents((event: RealtimeEvent) => {
      const filtered = filterEventForRole(event, role);
      if (!filtered) return;
      safeWrite(`data: ${JSON.stringify(filtered)}\n\n`);
    });

    const heartbeat = setInterval(() => {
      safeWrite(": heartbeat\n\n");
    }, HEARTBEAT_INTERVAL_MS);

    req.on("close", close);
    req.on("error", close);
    res.on("close", close);
    res.on("error", close);
  });
}
