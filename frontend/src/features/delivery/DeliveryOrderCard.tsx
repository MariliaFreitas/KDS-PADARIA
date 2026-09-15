import type { DeliveryOrder, DeliveryOrderItem } from "./delivery.types.js";

const CHANNEL_LABEL: Record<DeliveryOrder["channel"], string> = {
  BALCAO: "Balcão",
  WHATSAPP: "WhatsApp",
};

const CONSUMPTION_LABEL: Record<DeliveryOrder["consumptionType"], string> = {
  LOCAL: "Consumo no local",
  VIAGEM: "Para viagem",
};

const PAYMENT_LABEL: Record<DeliveryOrder["paymentStatus"], string> = {
  PENDENTE: "Pagamento pendente",
  PAGO: "Pago",
};

const ITEM_STATUS_LABEL: Record<DeliveryOrderItem["status"], string> = {
  PENDENTE: "Pendente",
  EM_PREPARO: "Em preparo",
  PRONTO: "Pronto",
  CANCELADO: "Cancelado",
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function itemQuantityLabel(item: DeliveryOrderItem): string {
  if (item.weightGrams !== null) {
    return `${item.weightGrams} g`;
  }
  return `${item.quantity}x`;
}

/**
 * Decide, só para a interface, se o botão de entregar deste item deve
 * aparecer habilitado e com qual texto — nenhuma dessas contas é a
 * autoridade: o backend reconfere tudo de novo em deliverItem, mesmo que
 * esta função erre ou seja contornada.
 */
function deliveryState(
  item: DeliveryOrderItem,
  order: DeliveryOrder,
): { canDeliver: boolean; reason: string | null } {
  if (item.status === "CANCELADO") {
    return { canDeliver: false, reason: null };
  }
  if (item.deliveredAt !== null) {
    return { canDeliver: false, reason: null };
  }
  if (item.requiresProductionSnapshot && item.status !== "PRONTO") {
    return { canDeliver: false, reason: "Aguardando o preparo terminar" };
  }
  if (order.consumptionType === "VIAGEM" && order.paymentStatus !== "PAGO") {
    return { canDeliver: false, reason: "Aguardando confirmação do pagamento" };
  }
  return { canDeliver: true, reason: null };
}

interface DeliveryOrderCardProps {
  order: DeliveryOrder;
  onDeliver: (order: DeliveryOrder, item: DeliveryOrderItem) => void;
  deliveringItemId: string | null;
}

export function DeliveryOrderCard({ order, onDeliver, deliveringItemId }: DeliveryOrderCardProps) {
  const isViagem = order.consumptionType === "VIAGEM";
  const paymentBlocksDelivery = isViagem && order.paymentStatus !== "PAGO";

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-lg font-semibold text-neutral-100">Pedido #{order.serviceNumber}</p>
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
        <span className="text-sm text-neutral-500 whitespace-nowrap">
          desde {formatTime(order.createdAt)}
        </span>
      </div>

      {paymentBlocksDelivery && (
        <p className="text-sm text-amber-300 bg-amber-950/40 border border-amber-900 rounded-lg px-3 py-2">
          Pedido para viagem: a entrega só libera depois do pagamento confirmado no Caixa.
        </p>
      )}

      <ul className="text-neutral-300 text-sm space-y-3 border-t border-neutral-800 pt-3">
        {order.items.map((item) => {
          const { canDeliver, reason } = deliveryState(item, order);
          const isCancelled = item.status === "CANCELADO";
          const isDelivered = item.deliveredAt !== null;
          const delivering = deliveringItemId === item.id;

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
                  <ul className={"pl-4 text-neutral-500" + (isCancelled ? " line-through" : "")}>
                    {item.additionals.map((additional, index) => (
                      <li key={index}>
                        + {additional.quantity > 1 ? `${additional.quantity}x ` : ""}
                        {additional.nameSnapshot}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-xs text-neutral-500 mt-1">
                  {isCancelled
                    ? "Item cancelado"
                    : item.requiresProductionSnapshot
                      ? ITEM_STATUS_LABEL[item.status]
                      : "Sem preparo"}
                  {reason && !isCancelled && !isDelivered && ` • ${reason}`}
                </p>
              </div>

              <div className="shrink-0">
                {isDelivered && (
                  <span className="text-xs font-medium uppercase tracking-wide text-emerald-400 bg-emerald-950 border border-emerald-800 rounded-full px-2 py-1">
                    Entregue
                  </span>
                )}

                {!isDelivered && !isCancelled && (
                  <button
                    type="button"
                    onClick={() => onDeliver(order, item)}
                    disabled={!canDeliver || delivering}
                    className="rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium px-3 py-2 text-sm transition-colors"
                  >
                    {delivering ? "Entregando..." : "Marcar como entregue"}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
