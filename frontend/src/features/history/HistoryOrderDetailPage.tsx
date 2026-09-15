import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { ApiError } from "../../services/apiClient.js";
import { getHistoryOrderDetail } from "./historyApi.js";
import type { HistoryOrderDetail } from "./history.types.js";
import {
  CHANNEL_LABEL,
  CONSUMPTION_LABEL,
  ITEM_STATUS_LABEL,
  PAYMENT_LABEL,
  ROLE_LABEL,
  actionLabel,
  formatCents,
  formatDateTime,
} from "./history.labels.js";

function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : "Não foi possível conectar ao servidor.";
}

function itemQuantityLabel(item: HistoryOrderDetail["items"][number]): string {
  if (item.weightGrams !== null) {
    return `${item.weightGrams} g`;
  }
  return `${item.quantity}x`;
}

export default function HistoryOrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const { token } = useAuth();

  const [order, setOrder] = useState<HistoryOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !orderId) return;
    setLoading(true);
    setError(null);
    try {
      setOrder(await getHistoryOrderDetail(token, orderId));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [token, orderId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 px-4 py-10">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">
            {order ? `Pedido #${order.serviceNumber}` : "Pedido"}
          </h1>
          <Link to="/history" className="text-sm text-neutral-400 hover:text-neutral-200">
            Voltar ao histórico
          </Link>
        </div>

        {error && (
          <p
            role="alert"
            className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2"
          >
            {error}
          </p>
        )}

        {loading && <p className="text-neutral-400">Carregando...</p>}

        {!loading && !error && order && (
          <>
            <section className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={
                    "text-xs font-medium uppercase tracking-wide rounded-full px-2 py-0.5 border " +
                    (order.cancelledAt !== null
                      ? "text-red-400 bg-red-950 border-red-800"
                      : "text-emerald-400 bg-emerald-950 border-emerald-800")
                  }
                >
                  {order.cancelledAt !== null ? "Cancelado" : "Entregue"}
                </span>
                <span
                  className={
                    "text-xs font-medium uppercase tracking-wide rounded-full px-2 py-0.5 border " +
                    (order.paymentStatus === "PAGO"
                      ? "text-emerald-400 bg-emerald-950 border-emerald-800"
                      : "text-amber-400 bg-amber-950 border-amber-800")
                  }
                >
                  {PAYMENT_LABEL[order.paymentStatus]}
                </span>
              </div>
              <p className="text-lg text-neutral-100">{order.customerName}</p>
              <p className="text-sm text-neutral-400">
                {CHANNEL_LABEL[order.channel]} • {CONSUMPTION_LABEL[order.consumptionType]}
              </p>
              <dl className="text-sm text-neutral-400 space-y-1 pt-2">
                <div className="flex justify-between">
                  <dt>Criado em</dt>
                  <dd className="text-neutral-200">{formatDateTime(order.createdAt)}</dd>
                </div>
                {order.paidAt && (
                  <div className="flex justify-between">
                    <dt>Pago em</dt>
                    <dd className="text-neutral-200">{formatDateTime(order.paidAt)}</dd>
                  </div>
                )}
                {order.deliveredAt && (
                  <div className="flex justify-between">
                    <dt>Entregue em</dt>
                    <dd className="text-neutral-200">{formatDateTime(order.deliveredAt)}</dd>
                  </div>
                )}
                {order.cancelledAt && (
                  <div className="flex justify-between">
                    <dt>Cancelado em</dt>
                    <dd className="text-neutral-200">{formatDateTime(order.cancelledAt)}</dd>
                  </div>
                )}
                {order.cancelReason && (
                  <div className="flex justify-between gap-4">
                    <dt>Motivo do cancelamento</dt>
                    <dd className="text-neutral-200 text-right">{order.cancelReason}</dd>
                  </div>
                )}
                <div className="flex justify-between pt-1 border-t border-neutral-800 font-medium text-neutral-100">
                  <dt>Total</dt>
                  <dd>{formatCents(order.totalCents)}</dd>
                </div>
              </dl>
            </section>

            <section className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5">
              <h2 className="text-sm font-semibold text-neutral-300 uppercase tracking-wide mb-3">
                Itens
              </h2>
              <ul className="text-neutral-300 text-sm space-y-3">
                {order.items.map((item) => {
                  const isCancelled = item.status === "CANCELADO";
                  return (
                    <li key={item.id} className="flex items-start justify-between gap-3">
                      <div className={isCancelled ? "opacity-50" : undefined}>
                        <span className={isCancelled ? "line-through" : undefined}>
                          {itemQuantityLabel(item)} {item.productNameSnapshot}
                          {item.variationNameSnapshot && (
                            <span className="text-neutral-500"> — {item.variationNameSnapshot}</span>
                          )}
                        </span>
                        {item.additionals.length > 0 && (
                          <ul
                            className={"pl-4 text-neutral-500" + (isCancelled ? " line-through" : "")}
                          >
                            {item.additionals.map((additional, index) => (
                              <li key={index}>
                                + {additional.quantity > 1 ? `${additional.quantity}x ` : ""}
                                {additional.nameSnapshot} ({formatCents(additional.priceCentsSnapshot)})
                              </li>
                            ))}
                          </ul>
                        )}
                        <p className="text-xs text-neutral-500 mt-1">
                          {isCancelled ? "Item cancelado" : ITEM_STATUS_LABEL[item.status]}
                          {item.deliveredAt && !isCancelled && " • Entregue"}
                        </p>
                      </div>
                      <span className={"shrink-0 " + (isCancelled ? "opacity-50 line-through" : "")}>
                        {formatCents(item.totalCents)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5">
              <h2 className="text-sm font-semibold text-neutral-300 uppercase tracking-wide mb-3">
                Linha do tempo
              </h2>
              {order.history.length === 0 ? (
                <p className="text-neutral-500 text-sm">
                  Nenhum evento registrado para este pedido.
                </p>
              ) : (
                <ol className="space-y-4">
                  {order.history.map((event) => (
                    <li key={event.id} className="border-l-2 border-neutral-800 pl-4">
                      <p className="text-neutral-100 text-sm font-medium">{actionLabel(event.action)}</p>
                      <p className="text-xs text-neutral-500">
                        {formatDateTime(event.createdAt)} • {event.user.name} (
                        {ROLE_LABEL[event.user.role]})
                      </p>
                      {event.item && (
                        <p className="text-xs text-neutral-500">Item: {event.item.productNameSnapshot}</p>
                      )}
                      {(event.previousState || event.newState) && (
                        <p className="text-xs text-neutral-500">
                          {event.previousState ?? "—"} → {event.newState ?? "—"}
                        </p>
                      )}
                      {event.reason && (
                        <p className="text-xs text-neutral-500">Motivo: {event.reason}</p>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
