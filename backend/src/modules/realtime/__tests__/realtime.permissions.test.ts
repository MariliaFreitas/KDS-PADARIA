import { describe, it, expect } from "vitest";
import { filterEventForRole } from "../realtime.permissions.js";
import type { RealtimeEvent } from "../realtime.types.js";

function event(overrides: Partial<RealtimeEvent> = {}): RealtimeEvent {
  return { scopes: ["orders"], timestamp: "2026-01-01T00:00:00.000Z", ...overrides };
}

describe("realtime.permissions — filterEventForRole", () => {
  it("reduz scopes à interseção com o papel", () => {
    const filtered = filterEventForRole(
      event({ scopes: ["orders", "cashier", "production"], orderId: "order-1" }),
      "ATENDENTE",
    );

    expect(filtered).toMatchObject({ scopes: ["orders"], orderId: "order-1" });
  });

  it("devolve null quando não sobra nenhum scope autorizado", () => {
    const filtered = filterEventForRole(event({ scopes: ["cashier", "delivery"] }), "PRODUCAO");

    expect(filtered).toBeNull();
  });

  it("mantém orderId mesmo sem o scope production", () => {
    const filtered = filterEventForRole(
      event({ scopes: ["orders", "production"], orderId: "order-1", stationId: "station-1" }),
      "ATENDENTE",
    );

    expect(filtered?.orderId).toBe("order-1");
  });

  it("remove stationId quando production não sobrevive ao filtro", () => {
    const filtered = filterEventForRole(
      event({ scopes: ["orders", "production"], orderId: "order-1", stationId: "station-1" }),
      "ATENDENTE",
    );

    expect(filtered).not.toHaveProperty("stationId");
  });

  it("mantém stationId quando production sobrevive ao filtro", () => {
    const filtered = filterEventForRole(
      event({ scopes: ["orders", "production"], stationId: "station-1" }),
      "PRODUCAO",
    );

    expect(filtered).toMatchObject({ scopes: ["production"], stationId: "station-1" });
  });

  it("nunca inventa stationId quando o evento original não tinha um", () => {
    const filtered = filterEventForRole(event({ scopes: ["production"] }), "PRODUCAO");

    expect(filtered).not.toHaveProperty("stationId");
  });

  it("preserva o timestamp original", () => {
    const filtered = filterEventForRole(
      event({ scopes: ["orders"], timestamp: "2026-03-01T10:00:00.000Z" }),
      "ATENDENTE",
    );

    expect(filtered?.timestamp).toBe("2026-03-01T10:00:00.000Z");
  });
});
