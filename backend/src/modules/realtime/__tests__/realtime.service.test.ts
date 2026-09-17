import { describe, it, expect, vi, afterEach } from "vitest";
import {
  publishRealtimeEvent,
  realtimeListenerCount,
  subscribeToRealtimeEvents,
} from "../realtime.service.js";
import type { RealtimeEvent } from "../realtime.types.js";

describe("realtime.service", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("entrega o evento publicado para quem está assinado", () => {
    const received: unknown[] = [];
    const unsubscribe = subscribeToRealtimeEvents((event) => received.push(event));

    publishRealtimeEvent({ scopes: ["orders"], orderId: "order-1" });

    expect(received).toHaveLength(1);
    unsubscribe();
  });

  it("não entrega nada pra quem já cancelou a assinatura", () => {
    const received: unknown[] = [];
    const unsubscribe = subscribeToRealtimeEvents((event) => received.push(event));
    unsubscribe();

    publishRealtimeEvent({ scopes: ["orders"], orderId: "order-1" });

    expect(received).toHaveLength(0);
  });

  it("entrega o mesmo evento pra múltiplos assinantes", () => {
    const receivedA: unknown[] = [];
    const receivedB: unknown[] = [];
    const unsubscribeA = subscribeToRealtimeEvents((event) => receivedA.push(event));
    const unsubscribeB = subscribeToRealtimeEvents((event) => receivedB.push(event));

    publishRealtimeEvent({ scopes: ["production"], stationId: "station-1" });

    expect(receivedA).toHaveLength(1);
    expect(receivedB).toHaveLength(1);
    unsubscribeA();
    unsubscribeB();
  });

  it("realtimeListenerCount reflete assinaturas ativas", () => {
    expect(realtimeListenerCount()).toBe(0);
    const unsubscribe = subscribeToRealtimeEvents(() => {});
    expect(realtimeListenerCount()).toBe(1);
    unsubscribe();
    expect(realtimeListenerCount()).toBe(0);
  });

  it("o evento traz só scopes/orderId/stationId/timestamp — nunca dado comercial", () => {
    const received: RealtimeEvent[] = [];
    const unsubscribe = subscribeToRealtimeEvents((event) => received.push(event));

    publishRealtimeEvent({ scopes: ["cashier", "orders"], orderId: "order-9" });
    unsubscribe();

    expect(received).toHaveLength(1);
    const captured = received[0];
    expect(Object.keys(captured).sort()).toEqual(["orderId", "scopes", "timestamp"].sort());
    expect(typeof captured.timestamp).toBe("string");
    expect(Number.isNaN(Date.parse(captured.timestamp))).toBe(false);
  });

  it("scopes chegam exatamente como publicados", () => {
    const received: RealtimeEvent[] = [];
    const unsubscribe = subscribeToRealtimeEvents((event) => received.push(event));

    publishRealtimeEvent({ scopes: ["production", "delivery"], stationId: "station-2" });
    unsubscribe();

    expect(received[0]?.scopes).toEqual(["production", "delivery"]);
  });

  it("um assinante que lança não impede publishRealtimeEvent de terminar nem os demais de receber o evento", () => {
    const unsubscribeA = subscribeToRealtimeEvents(() => {
      throw new Error("assinante quebrado");
    });
    const receivedB: RealtimeEvent[] = [];
    const unsubscribeB = subscribeToRealtimeEvents((event) => receivedB.push(event));

    expect(() => {
      publishRealtimeEvent({ scopes: ["orders"], orderId: "order-1" });
    }).not.toThrow();

    expect(receivedB).toHaveLength(1);
    unsubscribeA();
    unsubscribeB();
  });

  it("mesmo com o assinante quebrado registrado por último, os demais ainda recebem o evento", () => {
    const receivedA: RealtimeEvent[] = [];
    const unsubscribeA = subscribeToRealtimeEvents((event) => receivedA.push(event));
    const unsubscribeB = subscribeToRealtimeEvents(() => {
      throw new Error("assinante quebrado");
    });

    expect(() => {
      publishRealtimeEvent({ scopes: ["orders"], orderId: "order-1" });
    }).not.toThrow();

    expect(receivedA).toHaveLength(1);
    unsubscribeA();
    unsubscribeB();
  });
});
