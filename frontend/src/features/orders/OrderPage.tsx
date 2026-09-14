import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { ApiError } from "../../services/apiClient.js";
import { getOrder } from "./ordersService.js";
import type { ConsumptionType, OrderChannel, OrderItem, OrderWithItems } from "./types.js";

const CHANNEL_LABEL: Record<OrderChannel, string> = {
  BALCAO: "Balcão",
  WHATSAPP: "WhatsApp",
};

const CONSUMPTION_LABEL: Record<ConsumptionType, string> = {
  LOCAL: "Local",
  VIAGEM: "Viagem",
};

function formatBRL(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    cents / 100,
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function itemQuantityLabel(item: OrderItem): string {
  if (item.saleType === "WEIGHT") {
    return `${item.weightGrams} g`;
  }
  return `${item.quantity}x`;
}

function ItemRow({ item }: { item: OrderItem }) {
  return (
    <div className="py-3 space-y-1">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-neutral-100">
          {itemQuantityLabel(item)} {item.productNameSnapshot}
          {item.variationNameSnapshot && (
            <span className="text-neutral-400"> — {item.variationNameSnapshot}</span>
          )}
        </span>
        <span className="text-neutral-200 whitespace-nowrap">{formatBRL(item.totalCents)}</span>
      </div>

      {item.additionals.map((additional) => (
        <div key={additional.id} className="flex items-baseline justify-between gap-3 pl-4">
          <span className="text-sm text-neutral-400">
            + {additional.quantity > 1 ? `${additional.quantity}x ` : ""}
            {additional.nameSnapshot}
          </span>
          <span className="text-sm text-neutral-500 whitespace-nowrap">
            {formatBRL(additional.priceCentsSnapshot * additional.quantity)}
          </span>
        </div>
      ))}

      {item.observation && (
        <p className="text-sm text-neutral-500 pl-4">Obs: {item.observation}</p>
      )}
    </div>
  );
}

export default function OrderPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const { token } = useAuth();

  const [order, setOrder] = useState<OrderWithItems | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function errorMessage(err: unknown): string {
    return err instanceof ApiError ? err.message : "Não foi possível conectar ao servidor.";
  }

  useEffect(() => {
    if (!token || !orderId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    getOrder(token, orderId)
      .then((result) => {
        if (!cancelled) setOrder(result);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, orderId]);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 px-4 py-10">
      <div className="max-w-md mx-auto space-y-6">
        {loading && <p className="text-neutral-400 text-center">Carregando...</p>}

        {!loading && error && (
          <p
            role="alert"
            className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2"
          >
            {error}
          </p>
        )}

        {!loading && !error && order && (
          <>
            <div>
              <h1 className="text-2xl font-semibold">Pedido #{order.serviceNumber}</h1>
              <p className="text-neutral-300">{order.customerName}</p>
              <p className="text-sm text-neutral-500">
                {CHANNEL_LABEL[order.channel]} • {CONSUMPTION_LABEL[order.consumptionType]}
              </p>
              {order.paymentStatus === "PENDENTE" ? (
                <p className="text-sm text-emerald-400 mt-1">
                  Conta aberta desde {formatTime(order.createdAt)}
                </p>
              ) : (
                <p className="text-sm text-neutral-400 mt-1">Conta fechada • PAGO</p>
              )}
            </div>

            {order.items.length === 0 ? (
              <p className="text-sm text-neutral-400 bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3">
                Nenhum item adicionado ainda.
              </p>
            ) : (
              <div className="bg-neutral-900 border border-neutral-800 rounded-xl px-4 divide-y divide-neutral-800">
                {order.items.map((item) => (
                  <ItemRow key={item.id} item={item} />
                ))}
              </div>
            )}

            {order.paymentStatus === "PENDENTE" && (
              <Link
                to={`/orders/${order.id}/items/new`}
                className="block w-full text-center rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-4 py-4 transition-colors"
              >
                + Adicionar outro item
              </Link>
            )}

            <div className="text-center">
              <Link to="/" className="text-sm text-neutral-400 hover:text-neutral-200">
                Voltar
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
