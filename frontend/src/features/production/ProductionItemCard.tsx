import { useEffect, useState } from "react";
import type { ProductionItem } from "./production.types.js";

const STATUS_LABEL: Record<ProductionItem["status"], string> = {
  PENDENTE: "Pendente",
  EM_PREPARO: "Em preparo",
  PRONTO: "Pronto",
  CANCELADO: "Cancelado",
};

const STATUS_BADGE_CLASS: Record<ProductionItem["status"], string> = {
  PENDENTE: "text-amber-400 border-amber-900 bg-amber-950/40",
  EM_PREPARO: "text-sky-400 border-sky-900 bg-sky-950/40",
  PRONTO: "text-emerald-400 border-emerald-900 bg-emerald-950/40",
  CANCELADO: "text-neutral-400 border-neutral-700 bg-neutral-800/60",
};

function quantityLabel(item: ProductionItem): string {
  if (item.saleType === "WEIGHT") {
    return `${item.weightGrams} g`;
  }
  return `${item.quantity}x`;
}

function elapsedLabel(includedAt: string, nowMs: number): string {
  const elapsedMinutes = Math.max(0, Math.floor((nowMs - new Date(includedAt).getTime()) / 60000));
  if (elapsedMinutes < 1) return "agora mesmo";
  if (elapsedMinutes < 60) return `há ${elapsedMinutes} min`;
  const hours = Math.floor(elapsedMinutes / 60);
  const minutes = elapsedMinutes % 60;
  return minutes > 0 ? `há ${hours}h ${minutes}min` : `há ${hours}h`;
}

function useElapsedLabel(includedAt: string): string {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, []);

  return elapsedLabel(includedAt, nowMs);
}

interface ProductionItemCardProps {
  item: ProductionItem;
  onAdvance: (item: ProductionItem) => void;
  advancing: boolean;
}

export function ProductionItemCard({ item, onAdvance, advancing }: ProductionItemCardProps) {
  const elapsed = useElapsedLabel(item.includedAt);

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-semibold text-neutral-100">
            Pedido #{item.order.orderNumber}
          </p>
          <p className="text-neutral-400">{item.order.customerName}</p>
        </div>
        <span className="text-sm text-neutral-500 whitespace-nowrap">{elapsed}</span>
      </div>

      <div>
        <p className="text-xl font-semibold text-neutral-100">
          {quantityLabel(item)} {item.productNameSnapshot}
        </p>
        {item.variationNameSnapshot && (
          <p className="text-neutral-400">{item.variationNameSnapshot}</p>
        )}
      </div>

      {item.additionals.length > 0 && (
        <ul className="text-neutral-300 text-sm space-y-0.5">
          {item.additionals.map((additional) => (
            <li key={additional.id}>
              + {additional.quantity > 1 ? `${additional.quantity}x ` : ""}
              {additional.nameSnapshot}
            </li>
          ))}
        </ul>
      )}

      {item.observation && (
        <p className="text-base font-medium text-amber-300 bg-amber-950/50 border border-amber-900 rounded-lg px-3 py-2">
          Obs: {item.observation}
        </p>
      )}

      <div className="flex items-center justify-between gap-3 pt-1">
        <span
          className={
            "text-xs px-2 py-1 rounded-full border " + STATUS_BADGE_CLASS[item.status]
          }
        >
          {STATUS_LABEL[item.status]}
        </span>

        {item.status === "PENDENTE" && (
          <button
            type="button"
            onClick={() => onAdvance(item)}
            disabled={advancing}
            className="rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold px-5 py-3 text-base transition-colors"
          >
            {advancing ? "Iniciando..." : "Iniciar preparo"}
          </button>
        )}

        {item.status === "EM_PREPARO" && (
          <button
            type="button"
            onClick={() => onAdvance(item)}
            disabled={advancing}
            className="rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold px-5 py-3 text-base transition-colors"
          >
            {advancing ? "Marcando..." : "Marcar como pronto"}
          </button>
        )}
      </div>
    </div>
  );
}
