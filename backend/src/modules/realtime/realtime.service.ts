import { EventEmitter } from "node:events";
import type { RealtimeEvent, RealtimeEventInput } from "./realtime.types.js";

const EVENT_NAME = "event";

/**
 * Hub de invalidação em processo único, sem fila nem persistência: um
 * evento só chega a quem já estava assinado — sem replay, de propósito
 * (a tela sempre refaz o GET ao reconectar).
 *
 * setMaxListeners(0): múltiplas conexões simultâneas (uma por tela aberta)
 * são o caso normal aqui, não um memory leak.
 */
const emitter = new EventEmitter();
emitter.setMaxListeners(0);

/**
 * Publica um evento para todos os assinantes atuais. Quem chama esta
 * função é responsável por só chamá-la DEPOIS que a mutação já foi
 * confirmada no banco (transação commitada) — nunca antes, e nunca quando
 * a operação falhou.
 */
export function publishRealtimeEvent(event: RealtimeEventInput): void {
  const fullEvent: RealtimeEvent = { ...event, timestamp: new Date().toISOString() };
  emitter.emit(EVENT_NAME, fullEvent);
}

/**
 * Assina o hub. Devolve a função de cancelamento — quem abre uma conexão
 * SSE deve chamá-la ao fechar, pra não vazar listener.
 *
 * O listener roda protegido: uma exceção de UM assinante nunca deve
 * impedir os demais de receber o evento, nem propagar pra quem publicou.
 */
export function subscribeToRealtimeEvents(listener: (event: RealtimeEvent) => void): () => void {
  function safeListener(event: RealtimeEvent): void {
    try {
      listener(event);
    } catch {
      // Falha isolada — os demais listeners continuam sendo chamados.
    }
  }

  emitter.on(EVENT_NAME, safeListener);
  return () => {
    emitter.off(EVENT_NAME, safeListener);
  };
}

/** Só para teste inspecionar o hub sem expor o EventEmitter em si. */
export function realtimeListenerCount(): number {
  return emitter.listenerCount(EVENT_NAME);
}
