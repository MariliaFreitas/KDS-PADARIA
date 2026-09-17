import type { RealtimeStatus } from "./realtime.types.js";

interface RealtimeIndicatorProps {
  status: RealtimeStatus;
}

/**
 * Indicador discreto — nunca bloqueia a tela nem vira modal. "stopped"
 * (sessão expirada) fica silencioso de propósito: quem trata isso é o
 * fluxo de autenticação já existente.
 */
export function RealtimeIndicator({ status }: RealtimeIndicatorProps) {
  if (status === "connected") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-emerald-500">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Atualização automática ativa
      </span>
    );
  }

  if (status === "reconnecting") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-amber-500">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
        Reconectando...
      </span>
    );
  }

  return null;
}
