import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Request, Response } from "express";
import type { UserRole } from "@prisma/client";
import { streamEventsHandler } from "../realtime.controller.js";
import { publishRealtimeEvent, realtimeListenerCount } from "../realtime.service.js";

/**
 * Fake mínimo de emitter (on/off/emit) — o bastante pra registrar e
 * disparar "close"/"error" do jeito que req/res de verdade fariam, sem
 * subir socket nenhum.
 */
function createFakeEmitter() {
  const listenersByEvent: Record<string, Array<() => void>> = {};
  return {
    on(event: string, listener: () => void) {
      (listenersByEvent[event] ??= []).push(listener);
      return this;
    },
    off(event: string, listener: () => void) {
      listenersByEvent[event] = (listenersByEvent[event] ?? []).filter((l) => l !== listener);
      return this;
    },
    emit(event: string) {
      for (const listener of listenersByEvent[event] ?? []) listener();
    },
  };
}

function createFakeReq(role: UserRole = "ATENDENTE") {
  const emitter = createFakeEmitter();
  return {
    user: { id: "user-1", username: "user", name: "Usuário", role },
    on: emitter.on.bind(emitter),
    off: emitter.off.bind(emitter),
    emitClose() {
      emitter.emit("close");
    },
    emitError() {
      emitter.emit("error");
    },
  };
}

function createFakeRes() {
  const emitter = createFakeEmitter();
  return {
    writeHead: vi.fn(),
    flushHeaders: vi.fn(),
    write: vi.fn(),
    on: emitter.on.bind(emitter),
    off: emitter.off.bind(emitter),
    emitError() {
      emitter.emit("error");
    },
  };
}

function dataChunks(res: ReturnType<typeof createFakeRes>): unknown[] {
  return res.write.mock.calls
    .map((call) => call[0] as string)
    .filter((chunk) => chunk.startsWith("data: "))
    .map((chunk) => JSON.parse(chunk.slice("data: ".length).trim()) as unknown);
}

describe("realtime.controller — streamEventsHandler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("escreve os headers de SSE corretos e flusha na hora", () => {
    const req = createFakeReq();
    const res = createFakeRes();

    void streamEventsHandler(req as unknown as Request, res as unknown as Response);

    expect(res.writeHead).toHaveBeenCalledWith(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    expect(res.flushHeaders).toHaveBeenCalledTimes(1);

    req.emitClose();
  });

  it("assina o hub de eventos enquanto a conexão está aberta", () => {
    const req = createFakeReq();
    const res = createFakeRes();

    expect(realtimeListenerCount()).toBe(0);
    void streamEventsHandler(req as unknown as Request, res as unknown as Response);
    expect(realtimeListenerCount()).toBe(1);

    req.emitClose();
  });

  it("cancela a assinatura assim que a conexão fecha — sem vazar listener", () => {
    const req = createFakeReq();
    const res = createFakeRes();

    void streamEventsHandler(req as unknown as Request, res as unknown as Response);
    expect(realtimeListenerCount()).toBe(1);

    req.emitClose();

    expect(realtimeListenerCount()).toBe(0);
  });

  it("resolve a promise do handler quando a conexão fecha", async () => {
    const req = createFakeReq();
    const res = createFakeRes();

    const pending = streamEventsHandler(req as unknown as Request, res as unknown as Response);
    req.emitClose();

    await expect(pending).resolves.toBeUndefined();
  });

  it("repassa um evento publicado como uma linha `data: ...` em formato SSE", () => {
    const req = createFakeReq("ATENDENTE");
    const res = createFakeRes();

    void streamEventsHandler(req as unknown as Request, res as unknown as Response);

    publishRealtimeEvent({ scopes: ["orders"], orderId: "order-1" });

    const chunks = dataChunks(res);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ scopes: ["orders"], orderId: "order-1" });

    req.emitClose();
  });

  it("manda heartbeat periódico (comentário SSE, sem dado nenhum)", () => {
    const req = createFakeReq();
    const res = createFakeRes();

    void streamEventsHandler(req as unknown as Request, res as unknown as Response);

    vi.advanceTimersByTime(25_000);

    expect(res.write).toHaveBeenCalledWith(": heartbeat\n\n");

    req.emitClose();
  });

  it("para o heartbeat ao fechar a conexão — sem timer solto", () => {
    const req = createFakeReq();
    const res = createFakeRes();

    void streamEventsHandler(req as unknown as Request, res as unknown as Response);
    req.emitClose();
    res.write.mockClear();

    vi.advanceTimersByTime(120_000);

    expect(res.write).not.toHaveBeenCalled();
  });

  it("depois de fechado, não escreve mais nada mesmo se um evento for publicado", () => {
    const req = createFakeReq();
    const res = createFakeRes();

    void streamEventsHandler(req as unknown as Request, res as unknown as Response);
    req.emitClose();
    res.write.mockClear();

    publishRealtimeEvent({ scopes: ["orders"], orderId: "order-2" });

    expect(res.write).not.toHaveBeenCalled();
  });

  describe("filtro de escopos por papel", () => {
    it("ATENDENTE recebe orders mas não cashier/delivery/production", () => {
      const req = createFakeReq("ATENDENTE");
      const res = createFakeRes();

      void streamEventsHandler(req as unknown as Request, res as unknown as Response);
      publishRealtimeEvent({ scopes: ["cashier", "orders", "delivery"], orderId: "order-1" });

      const chunks = dataChunks(res);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toMatchObject({ scopes: ["orders"], orderId: "order-1" });

      req.emitClose();
    });

    it("PRODUCAO recebe production", () => {
      const req = createFakeReq("PRODUCAO");
      const res = createFakeRes();

      void streamEventsHandler(req as unknown as Request, res as unknown as Response);
      publishRealtimeEvent({ scopes: ["production", "orders"], stationId: "station-1" });

      const chunks = dataChunks(res);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toMatchObject({ scopes: ["production"], stationId: "station-1" });

      req.emitClose();
    });

    it("CAIXA recebe cashier e delivery", () => {
      const req = createFakeReq("CAIXA");
      const res = createFakeRes();

      void streamEventsHandler(req as unknown as Request, res as unknown as Response);
      publishRealtimeEvent({ scopes: ["cashier", "orders", "delivery"], orderId: "order-1" });

      const chunks = dataChunks(res);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toMatchObject({ scopes: ["cashier", "delivery"], orderId: "order-1" });

      req.emitClose();
    });

    it("ADMIN recebe orders/production/cashier, mas não delivery (mesma restrição do REST — ver delivery.routes.ts)", () => {
      const req = createFakeReq("ADMIN");
      const res = createFakeRes();

      void streamEventsHandler(req as unknown as Request, res as unknown as Response);
      publishRealtimeEvent({ scopes: ["cashier", "orders", "delivery", "production"], orderId: "order-1" });

      const chunks = dataChunks(res);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toMatchObject({
        scopes: ["cashier", "orders", "production"],
        orderId: "order-1",
      });

      req.emitClose();
    });

    it("evento multiescopo chega reduzido à interseção com os escopos do papel", () => {
      const req = createFakeReq("CAIXA");
      const res = createFakeRes();

      void streamEventsHandler(req as unknown as Request, res as unknown as Response);
      publishRealtimeEvent({ scopes: ["cashier", "orders", "delivery"], orderId: "order-9" });

      const chunks = dataChunks(res);
      expect(chunks[0]).toEqual(
        expect.objectContaining({ scopes: ["cashier", "delivery"], orderId: "order-9" }),
      );

      req.emitClose();
    });

    it("evento sem nenhum escopo permitido para o papel não é enviado", () => {
      const req = createFakeReq("PRODUCAO");
      const res = createFakeRes();

      void streamEventsHandler(req as unknown as Request, res as unknown as Response);
      publishRealtimeEvent({ scopes: ["cashier", "delivery"], orderId: "order-1" });

      expect(dataChunks(res)).toHaveLength(0);

      req.emitClose();
    });

    it("ATENDENTE não recebe stationId mesmo quando o evento original tinha production+stationId", () => {
      const req = createFakeReq("ATENDENTE");
      const res = createFakeRes();

      void streamEventsHandler(req as unknown as Request, res as unknown as Response);
      publishRealtimeEvent({
        scopes: ["orders", "production"],
        orderId: "order-1",
        stationId: "station-1",
      });

      const chunks = dataChunks(res);
      expect(chunks[0]).toMatchObject({ scopes: ["orders"], orderId: "order-1" });
      expect(chunks[0]).not.toHaveProperty("stationId");

      req.emitClose();
    });

    it("CAIXA não recebe stationId mesmo quando o evento original tinha production+stationId", () => {
      const req = createFakeReq("CAIXA");
      const res = createFakeRes();

      void streamEventsHandler(req as unknown as Request, res as unknown as Response);
      publishRealtimeEvent({
        scopes: ["cashier", "production"],
        orderId: "order-1",
        stationId: "station-1",
      });

      const chunks = dataChunks(res);
      expect(chunks[0]).toMatchObject({ scopes: ["cashier"], orderId: "order-1" });
      expect(chunks[0]).not.toHaveProperty("stationId");

      req.emitClose();
    });

    it("PRODUCAO recebe stationId quando production sobrevive ao filtro", () => {
      const req = createFakeReq("PRODUCAO");
      const res = createFakeRes();

      void streamEventsHandler(req as unknown as Request, res as unknown as Response);
      publishRealtimeEvent({ scopes: ["production", "orders"], stationId: "station-1" });

      const chunks = dataChunks(res);
      expect(chunks[0]).toMatchObject({ scopes: ["production"], stationId: "station-1" });

      req.emitClose();
    });

    it("ADMIN recebe stationId quando production sobrevive ao filtro", () => {
      const req = createFakeReq("ADMIN");
      const res = createFakeRes();

      void streamEventsHandler(req as unknown as Request, res as unknown as Response);
      publishRealtimeEvent({
        scopes: ["orders", "production", "cashier"],
        stationId: "station-1",
      });

      const chunks = dataChunks(res);
      expect(chunks[0]).toMatchObject({
        scopes: ["orders", "production", "cashier"],
        stationId: "station-1",
      });

      req.emitClose();
    });
  });

  describe("isolamento de falha do realtime", () => {
    it("uma falha ao escrever no socket encerra só esta conexão, sem lançar", () => {
      const req = createFakeReq();
      const res = createFakeRes();
      res.write.mockImplementation(() => {
        throw new Error("socket destruído");
      });

      expect(() => {
        void streamEventsHandler(req as unknown as Request, res as unknown as Response);
        publishRealtimeEvent({ scopes: ["orders"], orderId: "order-1" });
      }).not.toThrow();

      expect(realtimeListenerCount()).toBe(0);
    });

    it("outra conexão continua recebendo mesmo quando a primeira falha ao escrever", () => {
      const brokenReq = createFakeReq();
      const brokenRes = createFakeRes();
      brokenRes.write.mockImplementation(() => {
        throw new Error("socket destruído");
      });

      const healthyReq = createFakeReq();
      const healthyRes = createFakeRes();

      void streamEventsHandler(brokenReq as unknown as Request, brokenRes as unknown as Response);
      void streamEventsHandler(healthyReq as unknown as Request, healthyRes as unknown as Response);

      publishRealtimeEvent({ scopes: ["orders"], orderId: "order-1" });

      expect(dataChunks(healthyRes)).toHaveLength(1);

      healthyReq.emitClose();
    });

    it("erro assíncrono no req encerra a conexão e libera o listener do hub", async () => {
      const req = createFakeReq();
      const res = createFakeRes();

      const pending = streamEventsHandler(req as unknown as Request, res as unknown as Response);
      expect(realtimeListenerCount()).toBe(1);

      req.emitError();

      await expect(pending).resolves.toBeUndefined();
      expect(realtimeListenerCount()).toBe(0);
    });

    it("erro assíncrono no res encerra a conexão sem lançar e para o heartbeat", async () => {
      const req = createFakeReq();
      const res = createFakeRes();

      const pending = streamEventsHandler(req as unknown as Request, res as unknown as Response);

      expect(() => res.emitError()).not.toThrow();
      await expect(pending).resolves.toBeUndefined();

      res.write.mockClear();
      vi.advanceTimersByTime(120_000);
      expect(res.write).not.toHaveBeenCalled();
    });

    it("close/error repetidos depois do encerramento não religam listener nem resolvem duas vezes", async () => {
      const req = createFakeReq();
      const res = createFakeRes();

      const pending = streamEventsHandler(req as unknown as Request, res as unknown as Response);
      req.emitClose();
      await expect(pending).resolves.toBeUndefined();
      expect(realtimeListenerCount()).toBe(0);

      // Os listeners já foram removidos por close() — emitir de novo não
      // deve fazer nada (nem os fakes têm mais nada registrado pra chamar).
      req.emitError();
      res.emitError();
      expect(realtimeListenerCount()).toBe(0);
    });
  });
});
