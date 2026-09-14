import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { ApiError } from "../../services/apiClient.js";
import { confirmPayment as requestConfirmPayment, listCashierOrders } from "./cashierApi.js";
import { CashierOrderCard } from "./CashierOrderCard.js";
import type { CashierOrder } from "./cashier.types.js";

function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : "Não foi possível conectar ao servidor.";
}

export default function CashierPage() {
  const { token } = useAuth();

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [orders, setOrders] = useState<CashierOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmingOrderId, setConfirmingOrderId] = useState<string | null>(null);
  const [confirmationMessage, setConfirmationMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setOrders(await listCashierOrders(token, search));
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
    setConfirmationMessage(null);
    setSearch(searchInput.trim());
  }

  function clearSearch() {
    setConfirmationMessage(null);
    setSearchInput("");
    setSearch("");
  }

  async function handleConfirm(order: CashierOrder) {
    if (!token) return;
    setError(null);
    setConfirmationMessage(null);
    setConfirmingOrderId(order.id);
    try {
      await requestConfirmPayment(token, order.id);
      // O card do pedido some da lista assim que ela recarrega (conta
      // fechada não é mais "aberta"), então o retorno fica na página, não
      // no card que está prestes a desaparecer.
      setConfirmationMessage(`Pagamento do pedido #${order.serviceNumber} confirmado.`);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setConfirmingOrderId(null);
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 px-4 py-10">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Caixa</h1>
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

        {confirmationMessage && (
          <p className="text-sm text-emerald-400 bg-emerald-950/40 border border-emerald-900 rounded-lg px-3 py-2">
            {confirmationMessage}
          </p>
        )}

        {loading && <p className="text-neutral-400">Carregando...</p>}

        {!loading && !error && orders.length === 0 && (
          <p className="text-neutral-400 bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
            Nenhuma conta aberta no momento.
          </p>
        )}

        {!loading && orders.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            {orders.map((order) => (
              <CashierOrderCard
                key={order.id}
                order={order}
                onConfirm={handleConfirm}
                confirming={confirmingOrderId === order.id}
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
