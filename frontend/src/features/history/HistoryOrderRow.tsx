import { Link } from "react-router-dom";
import type { HistoryOrderSummary } from "./history.types.js";
import {
  CHANNEL_LABEL,
  CONSUMPTION_LABEL,
  PAYMENT_LABEL,
  formatCents,
  formatDateTime,
  operationalStatusLabel,
} from "./history.labels.js";

interface HistoryOrderRowProps {
  order: HistoryOrderSummary;
}

export function HistoryOrderRow({ order }: HistoryOrderRowProps) {
  const status = operationalStatusLabel(order);
  const statusClass =
    order.cancelledAt !== null
      ? "text-red-400 bg-red-950 border-red-800"
      : "text-emerald-400 bg-emerald-950 border-emerald-800";

  return (
    <Link
      to={`/history/orders/${order.id}`}
      className="block bg-neutral-900 border border-neutral-800 rounded-2xl p-5 hover:border-neutral-700 transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-lg font-semibold text-neutral-100">Pedido #{order.serviceNumber}</p>
            <span
              className={`text-xs font-medium uppercase tracking-wide rounded-full px-2 py-0.5 border ${statusClass}`}
            >
              {status}
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
          <p className="text-neutral-400">{order.customerName}</p>
          <p className="text-sm text-neutral-500">
            {CHANNEL_LABEL[order.channel]} • {CONSUMPTION_LABEL[order.consumptionType]}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm text-neutral-500">{formatDateTime(order.createdAt)}</p>
          <p className="text-neutral-100 font-medium mt-1">{formatCents(order.totalCents)}</p>
        </div>
      </div>
    </Link>
  );
}
