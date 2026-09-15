import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { ApiError } from "../../services/apiClient.js";
import { listHistoryOrders } from "./historyApi.js";
import { HistoryOrderRow } from "./HistoryOrderRow.js";
import type { HistoryOrderSummary, HistoryStatusFilter } from "./history.types.js";

function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : "Não foi possível conectar ao servidor.";
}

const PAGE_SIZE = 20;

export default function HistoryPage() {
  const { token } = useAuth();

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<HistoryStatusFilter | "">("");
  const [page, setPage] = useState(1);

  const [orders, setOrders] = useState<HistoryOrderSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const result = await listHistoryOrders(token, {
        search,
        status: statusFilter || undefined,
        page,
        pageSize: PAGE_SIZE,
      });
      setOrders(result.orders);
      setTotal(result.total);
      setTotalPages(result.totalPages);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [token, search, statusFilter, page]);

  useEffect(() => {
    load();
  }, [load]);

  function handleSearchSubmit(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  function clearSearch() {
    setSearchInput("");
    setSearch("");
    setPage(1);
  }

  function handleStatusChange(value: HistoryStatusFilter | "") {
    setStatusFilter(value);
    setPage(1);
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 px-4 py-10">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Histórico</h1>
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

        <div className="flex gap-2">
          {(
            [
              { value: "", label: "Todos" },
              { value: "ENTREGUE", label: "Entregues" },
              { value: "CANCELADO", label: "Cancelados" },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => handleStatusChange(option.value)}
              className={
                "rounded-lg px-3 py-2 text-sm border transition-colors " +
                (statusFilter === option.value
                  ? "bg-neutral-100 text-neutral-900 border-neutral-100"
                  : "bg-neutral-900 text-neutral-300 border-neutral-800 hover:border-neutral-700")
              }
            >
              {option.label}
            </button>
          ))}
        </div>

        {/* Lembrete visível de que o número operacional é reutilizável: uma
            busca por "#27" pode legitimamente trazer mais de um pedido
            histórico diferente. */}
        {search !== "" && orders.length > 1 && /^#?\d+$/.test(search) && (
          <p className="text-xs text-neutral-500">
            O número operacional é reaproveitado — esta busca encontrou {orders.length} pedidos
            diferentes que já usaram esse número.
          </p>
        )}

        {error && (
          <p
            role="alert"
            className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2"
          >
            {error}
          </p>
        )}

        {loading && <p className="text-neutral-400">Carregando...</p>}

        {!loading && !error && orders.length === 0 && (
          <p className="text-neutral-400 bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
            Nenhum pedido encontrado no histórico.
          </p>
        )}

        {!loading && orders.length > 0 && (
          <div className="grid gap-4">
            {orders.map((order) => (
              <HistoryOrderRow key={order.id} order={order} />
            ))}
          </div>
        )}

        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1}
              className="rounded-lg border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Anterior
            </button>
            <p className="text-sm text-neutral-400">
              Página {page} de {totalPages} • {total} pedido{total === 1 ? "" : "s"}
            </p>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={page >= totalPages}
              className="rounded-lg border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Próxima
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
