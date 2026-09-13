import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { ApiError } from "../../services/apiClient.js";
import { getOrder } from "./ordersService.js";
import type { ConsumptionType, OrderChannel, OrderWithItems } from "./types.js";

const CHANNEL_LABEL: Record<OrderChannel, string> = {
  BALCAO: "Balcão",
  WHATSAPP: "WhatsApp",
};

const CONSUMPTION_LABEL: Record<ConsumptionType, string> = {
  LOCAL: "Local",
  VIAGEM: "Viagem",
};

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
    <div className="min-h-screen bg-neutral-950 text-neutral-100 px-4 py-10 flex items-center justify-center">
      <div className="max-w-sm w-full space-y-6 text-center">
        {loading && <p className="text-neutral-400">Carregando...</p>}

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
            <h1 className="text-3xl font-semibold">Pedido #{order.orderNumber}</h1>
            <p className="text-xl text-neutral-200">{order.customerName}</p>
            <p className="text-neutral-400">
              {CHANNEL_LABEL[order.channel]} • {CONSUMPTION_LABEL[order.consumptionType]}
            </p>

            <p className="text-sm text-neutral-400 bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3">
              Pedido criado. Na próxima etapa você poderá adicionar os itens.
            </p>

            <button
              type="button"
              disabled
              title="Disponível na próxima etapa"
              className="w-full rounded-xl border border-neutral-800 text-neutral-600 font-medium px-4 py-3 cursor-not-allowed"
            >
              Adicionar item (em breve)
            </button>

            <Link
              to="/"
              className="inline-block rounded-xl border border-neutral-700 px-4 py-3 text-sm hover:bg-neutral-800 transition-colors"
            >
              Voltar
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
