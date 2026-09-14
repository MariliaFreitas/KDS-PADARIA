import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { ApiError } from "../../services/apiClient.js";
import { createOrder } from "./ordersService.js";
import type { ConsumptionType, OrderChannel } from "./types.js";

function toggleButtonClasses(active: boolean): string {
  return (
    "flex-1 rounded-xl border px-4 py-4 text-lg font-medium transition-colors " +
    (active
      ? "border-emerald-500 bg-emerald-950/40 text-emerald-300"
      : "border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800")
  );
}

export default function NewOrderPage() {
  const { token } = useAuth();
  const navigate = useNavigate();

  const [customerName, setCustomerName] = useState("");
  const [channel, setChannel] = useState<OrderChannel>("BALCAO");
  const [consumptionType, setConsumptionType] = useState<ConsumptionType>("LOCAL");
  const [pickupTime, setPickupTime] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function errorMessage(err: unknown): string {
    return err instanceof ApiError ? err.message : "Não foi possível conectar ao servidor.";
  }

  function handleSelectChannel(next: OrderChannel) {
    setChannel(next);
    if (next !== "WHATSAPP") {
      // Regra explícita: ao voltar para BALCAO, o horário de retirada é
      // limpo da tela antes de qualquer envio.
      setPickupTime("");
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!token) return;

    setError(null);
    setSubmitting(true);
    try {
      const pickupTimeIso =
        channel === "WHATSAPP" && pickupTime.trim() !== ""
          ? new Date(pickupTime).toISOString()
          : null;

      const order = await createOrder(token, {
        customerName,
        channel,
        consumptionType,
        pickupTime: pickupTimeIso,
      });

      // Em vez de parar numa tela de pedido praticamente vazia, o
      // atendente já cai direto na inclusão do primeiro item.
      navigate(`/orders/${order.id}/items/new`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 px-4 py-10">
      <div className="max-w-md mx-auto space-y-8">
        <h1 className="text-3xl font-semibold text-center">Novo pedido</h1>

        {error && (
          <p
            role="alert"
            className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2"
          >
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="space-y-2">
            <label htmlFor="customerName" className="text-base text-neutral-300">
              Nome do cliente
            </label>
            <input
              id="customerName"
              type="text"
              required
              autoFocus
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              placeholder="Ex: Maria"
              className="w-full rounded-xl bg-neutral-900 border border-neutral-700 px-4 py-4 text-lg text-neutral-100 outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="space-y-2">
            <span className="text-base text-neutral-300">Canal</span>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => handleSelectChannel("BALCAO")}
                className={toggleButtonClasses(channel === "BALCAO")}
              >
                Balcão
              </button>
              <button
                type="button"
                onClick={() => handleSelectChannel("WHATSAPP")}
                className={toggleButtonClasses(channel === "WHATSAPP")}
              >
                WhatsApp
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-base text-neutral-300">Consumo</span>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConsumptionType("LOCAL")}
                className={toggleButtonClasses(consumptionType === "LOCAL")}
              >
                Local
              </button>
              <button
                type="button"
                onClick={() => setConsumptionType("VIAGEM")}
                className={toggleButtonClasses(consumptionType === "VIAGEM")}
              >
                Viagem
              </button>
            </div>
          </div>

          {channel === "WHATSAPP" && (
            <div className="space-y-2">
              <label htmlFor="pickupTime" className="text-base text-neutral-300">
                Horário de retirada (opcional)
              </label>
              <input
                id="pickupTime"
                type="datetime-local"
                value={pickupTime}
                onChange={(event) => setPickupTime(event.target.value)}
                className="w-full rounded-xl bg-neutral-900 border border-neutral-700 px-4 py-4 text-lg text-neutral-100 outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-lg px-4 py-4 transition-colors"
          >
            {submitting ? "Criando..." : "Continuar"}
          </button>
        </form>
      </div>
    </div>
  );
}
