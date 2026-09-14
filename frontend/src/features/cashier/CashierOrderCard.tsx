import { useState } from "react";
import type { CashierOrder, CashierOrderItem } from "./cashier.types.js";

const CHANNEL_LABEL: Record<CashierOrder["channel"], string> = {
  BALCAO: "Balcão",
  WHATSAPP: "WhatsApp",
};

const CONSUMPTION_LABEL: Record<CashierOrder["consumptionType"], string> = {
  LOCAL: "Consumo no local",
  VIAGEM: "Para viagem",
};

function formatBRL(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    cents / 100,
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function itemQuantityLabel(item: CashierOrderItem): string {
  if (item.weightGrams !== null) {
    return `${item.weightGrams} g`;
  }
  return `${item.quantity}x`;
}

interface CashierOrderCardProps {
  order: CashierOrder;
  onConfirm: (order: CashierOrder) => void;
  confirming: boolean;
}

export function CashierOrderCard({ order, onConfirm, confirming }: CashierOrderCardProps) {
  const [askingConfirmation, setAskingConfirmation] = useState(false);

  const isLocal = order.consumptionType === "LOCAL";
  const primaryButtonLabel = isLocal ? "Fechar conta e confirmar pagamento" : "Confirmar pagamento";
  const confirmQuestion = isLocal
    ? `Fechar a conta do pedido #${order.serviceNumber} e confirmar o pagamento de ${formatBRL(order.totalCents)}?`
    : `Confirmar pagamento do pedido #${order.serviceNumber} no valor de ${formatBRL(order.totalCents)}?`;

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-lg font-semibold text-neutral-100">Pedido #{order.serviceNumber}</p>
            {isLocal && (
              <span className="text-xs font-medium uppercase tracking-wide text-amber-400 bg-amber-950 border border-amber-800 rounded-full px-2 py-0.5">
                Conta aberta
              </span>
            )}
          </div>
          <p className="text-neutral-400">{order.customerName}</p>
          <p className="text-sm text-neutral-500">
            {CHANNEL_LABEL[order.channel]} • {CONSUMPTION_LABEL[order.consumptionType]}
          </p>
        </div>
        <span className="text-sm text-neutral-500 whitespace-nowrap">
          desde {formatTime(order.createdAt)}
        </span>
      </div>

      {order.items.length > 0 && (
        <ul className="text-neutral-300 text-sm space-y-1.5 border-t border-neutral-800 pt-3">
          {order.items.map((item) => (
            <li key={item.id}>
              <span>
                {itemQuantityLabel(item)} {item.productNameSnapshot}
                {item.variationNameSnapshot && (
                  <span className="text-neutral-500"> — {item.variationNameSnapshot}</span>
                )}
              </span>
              {item.additionals.length > 0 && (
                <ul className="pl-4 text-neutral-500">
                  {item.additionals.map((additional, index) => (
                    <li key={index}>
                      + {additional.quantity > 1 ? `${additional.quantity}x ` : ""}
                      {additional.nameSnapshot}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="text-2xl font-semibold text-neutral-100">{formatBRL(order.totalCents)}</p>

      {!askingConfirmation && (
        <button
          type="button"
          onClick={() => setAskingConfirmation(true)}
          disabled={confirming}
          className="rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold px-5 py-3 text-base transition-colors"
        >
          {primaryButtonLabel}
        </button>
      )}

      {askingConfirmation && (
        <div className="space-y-3">
          <p className="text-sm text-neutral-300">{confirmQuestion}</p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => onConfirm(order)}
              disabled={confirming}
              className="flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold px-4 py-3 text-base transition-colors"
            >
              {confirming ? "Confirmando..." : "Confirmar"}
            </button>
            <button
              type="button"
              onClick={() => setAskingConfirmation(false)}
              disabled={confirming}
              className="flex-1 rounded-xl border border-neutral-700 text-neutral-300 hover:bg-neutral-800 disabled:opacity-60 disabled:cursor-not-allowed px-4 py-3 text-base transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
