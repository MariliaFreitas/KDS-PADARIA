import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { ApiError } from "../../services/apiClient.js";
import { deliverItem as requestDeliverItem, listDeliveryOrders } from "./deliveryApi.js";
import { DeliveryOrderCard } from "./DeliveryOrderCard.js";
import type { DeliveryOrder, DeliveryOrderItem } from "./delivery.types.js";

function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : "Não foi possível conectar ao servidor.";
}

export default function DeliveryPage() {
  const { token } = useAuth();

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deliveringItemId, setDeliveringItemId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setOrders(await listDeliveryOrders(token, search));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [token, search]);

  useEffect(() => {
    load();
  }, [load]);

  function handleSearchSubmit(event: FormEvent) {
    event.preventDefault();
    setFeedback(null);
    setSearch(searchInput.trim());
  }

  function clearSearch() {
    setFeedback(null);
    setSearchInput("");
    setSearch("");
  }

  async function handleDeliver(order: DeliveryOrder, item: DeliveryOrderItem) {
    if (!token) return;
    setError(null);
    setFeedback(null);
    setDeliveringItemId(item.id);
    try {
      await requestDeliverItem(token, order.id, item.id);
      // O pedido some da lista sozinho quando ela recarrega, se esse era o
      // último item válido pendente — por isso o retorno fica na página,
      // não num card que pode estar prestes a desaparecer.
      setFeedback(`Item "${item.productNameSnapshot}" do pedido #${order.serviceNumber} entregue.`);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setDeliveringItemId(null);
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 px-4 py-10">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Retirada/Entrega</h1>
          <Link to="/" className="text-sm text-neutral-400 hover:text-neutral-200">
            Voltar
          </Link>
        </div>

        <form onSubmit={handleSearchSubmit} className="flex gap-3">
          <input
            type="text"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Buscar por número do pedido ou nome do cliente..."
            className="flex-1 rounded-xl bg-neutral-900 border border-neutral-700 px-4 py-3 text-neutral-100 outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button
            type="submit"
            className="rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-100 font-medium px-5 py-3 transition-colors"
          >
            Buscar
          </button>
          {search !== "" && (
            <button
              type="button"
              onClick={clearSearch}
              className="text-sm text-neutral-400 hover:text-neutral-200"
            >
              Limpar
            </button>
          )}
        </form>

        {error && (
          <p
            role="alert"
            className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2"
          >
            {error}
          </p>
        )}

        {feedback && (
          <p className="text-sm text-emerald-400 bg-emerald-950/40 border border-emerald-900 rounded-lg px-3 py-2">
            {feedback}
          </p>
        )}

        {loading && <p className="text-neutral-400">Carregando...</p>}

        {!loading && !error && orders.length === 0 && (
          <p className="text-neutral-400 bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
            Nenhum pedido com retirada/entrega pendente no momento.
          </p>
        )}

        {!loading && orders.length > 0 && (
          <div className="grid gap-4">
            {orders.map((order) => (
              <DeliveryOrderCard
                key={order.id}
                order={order}
                onDeliver={handleDeliver}
                deliveringItemId={deliveringItemId}
              />
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={load}
          className="text-sm text-neutral-400 hover:text-neutral-200"
        >
          Atualizar
        </button>
      </div>
    </div>
  );
}
