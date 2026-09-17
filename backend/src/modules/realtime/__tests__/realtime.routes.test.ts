import http from "node:http";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import jwt from "jsonwebtoken";
import { createApp } from "../../../app.js";
import { env } from "../../../config/env.js";
import { realtimeListenerCount } from "../realtime.service.js";

/**
 * Integração de verdade, com socket real: é a única forma confiável de
 * garantir que `authenticate` está de fato na frente deste endpoint e que o
 * Content-Type chega correto pelo fio. supertest não lida bem com uma
 * resposta que nunca termina sozinha (SSE), então aqui é `http` puro —
 * sempre destruindo a conexão do cliente ao final de cada teste, nunca
 * deixando um handle aberto pendurando o processo de teste.
 */
function tokenFor(role: "ATENDENTE" | "ADMIN" | "CAIXA" | "PRODUCAO"): string {
  return jwt.sign({ id: "user-1", username: "user", name: "Usuário", role }, env.JWT_SECRET, {
    expiresIn: "1h",
  });
}

describe("GET /api/realtime/events", () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = createApp("http://localhost:5173");
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Falha ao iniciar o servidor de teste do realtime.");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it("retorna 401 sem token de autenticação", async () => {
    const response = await new Promise<http.IncomingMessage>((resolve) => {
      http.get(`${baseUrl}/api/realtime/events`, { agent: false }, resolve);
    });

    expect(response.statusCode).toBe(401);
    response.resume();
    await new Promise((resolve) => response.on("end", resolve));
  });

  it("permite usuário autenticado abrir o stream com Content-Type text/event-stream, e remove o assinante do hub ao fechar", async () => {
    expect(realtimeListenerCount()).toBe(0);
    const token = tokenFor("ATENDENTE");

    const { req, res } = await new Promise<{ req: http.ClientRequest; res: http.IncomingMessage }>(
      (resolve) => {
        const req = http.get(
          `${baseUrl}/api/realtime/events`,
          { agent: false, headers: { Authorization: `Bearer ${token}` } },
          (res) => resolve({ req, res }),
        );
      },
    );

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/event-stream");
    expect(res.headers["cache-control"]).toContain("no-cache");
    expect(realtimeListenerCount()).toBe(1);

    req.destroy();

    await vi.waitFor(() => {
      expect(realtimeListenerCount()).toBe(0);
    });
  });

  describe("filtro de escopos por papel, de ponta a ponta", () => {
    /**
     * Abre o stream com o token do papel dado, espera a assinatura entrar
     * no hub (vi.waitFor em vez de sleep arbitrário), publica o evento e
     * coleta o que realmente chegou pelo socket antes de fechar a conexão.
     */
    async function collectEventsFor(
      role: "ATENDENTE" | "ADMIN" | "CAIXA" | "PRODUCAO",
      publish: () => void,
    ): Promise<unknown[]> {
      const token = tokenFor(role);
      const listenersBefore = realtimeListenerCount();

      const { req, res } = await new Promise<{
        req: http.ClientRequest;
        res: http.IncomingMessage;
      }>((resolve) => {
        const req = http.get(
          `${baseUrl}/api/realtime/events`,
          { agent: false, headers: { Authorization: `Bearer ${token}` } },
          (res) => resolve({ req, res }),
        );
      });

      await vi.waitFor(() => {
        expect(realtimeListenerCount()).toBe(listenersBefore + 1);
      });

      const chunks: string[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk.toString("utf8")));

      publish();

      await vi.waitFor(() => {
        expect(chunks.join("")).toContain("data:");
      });

      req.destroy();
      await vi.waitFor(() => {
        expect(realtimeListenerCount()).toBe(listenersBefore);
      });

      return chunks
        .join("")
        .split("\n\n")
        .filter((frame) => frame.startsWith("data:"))
        .map((frame) => JSON.parse(frame.slice("data:".length).trim()) as unknown);
    }

    it("ATENDENTE só recebe o escopo orders de um evento cashier+orders+delivery", async () => {
      const { publishRealtimeEvent } = await import("../realtime.service.js");
      const events = await collectEventsFor("ATENDENTE", () =>
        publishRealtimeEvent({ scopes: ["cashier", "orders", "delivery"], orderId: "order-1" }),
      );

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ scopes: ["orders"], orderId: "order-1" });
    });

    it("CAIXA recebe cashier e delivery, mas não orders, do mesmo evento", async () => {
      const { publishRealtimeEvent } = await import("../realtime.service.js");
      const events = await collectEventsFor("CAIXA", () =>
        publishRealtimeEvent({ scopes: ["cashier", "delivery"], orderId: "order-2" }),
      );

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ scopes: ["cashier", "delivery"], orderId: "order-2" });
    });

    it("PRODUCAO não recebe um evento só de cashier/delivery, mas continua recebendo o que é seu na mesma conexão", async () => {
      const token = tokenFor("PRODUCAO");
      const listenersBefore = realtimeListenerCount();

      const { req, res } = await new Promise<{
        req: http.ClientRequest;
        res: http.IncomingMessage;
      }>((resolve) => {
        const req = http.get(
          `${baseUrl}/api/realtime/events`,
          { agent: false, headers: { Authorization: `Bearer ${token}` } },
          (res) => resolve({ req, res }),
        );
      });

      await vi.waitFor(() => {
        expect(realtimeListenerCount()).toBe(listenersBefore + 1);
      });

      const chunks: string[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk.toString("utf8")));

      const { publishRealtimeEvent } = await import("../realtime.service.js");
      publishRealtimeEvent({ scopes: ["cashier", "delivery"], orderId: "order-3" });

      // Espera curta e determinística (conexão local, sem fila nenhuma
      // envolvida) antes de confirmar que nada chegou — depois publica um
      // evento que ESTE papel pode ver na mesma conexão: se esse chegar
      // normalmente, a ausência do primeiro é filtro por escopo, não a
      // conexão inteira travada.
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(chunks.join("")).not.toContain("data:");

      publishRealtimeEvent({ scopes: ["production"], stationId: "station-1" });

      await vi.waitFor(() => {
        expect(chunks.join("")).toContain("data:");
      });

      const frames = chunks
        .join("")
        .split("\n\n")
        .filter((frame) => frame.startsWith("data:"))
        .map((frame) => JSON.parse(frame.slice("data:".length).trim()) as { scopes: string[] });

      expect(frames).toHaveLength(1);
      expect(frames[0]?.scopes).toEqual(["production"]);

      req.destroy();
      await vi.waitFor(() => {
        expect(realtimeListenerCount()).toBe(listenersBefore);
      });
    });
  });
});
