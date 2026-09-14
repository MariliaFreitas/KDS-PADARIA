import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { ApiError } from "../../services/apiClient.js";
import { advanceItem, getStationQueue } from "./productionApi.js";
import { ProductionItemCard } from "./ProductionItemCard.js";
import type { ProductionItem } from "./production.types.js";

function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : "Não foi possível conectar ao servidor.";
}

export default function ProductionKdsPage() {
  const { stationId } = useParams<{ stationId: string }>();
  const { token } = useAuth();

  const [items, setItems] = useState<ProductionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [advancingItemId, setAdvancingItemId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !stationId) return;
    setLoading(true);
    setError(null);
    try {
      setItems(await getStationQueue(token, stationId));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [token, stationId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAdvance(item: ProductionItem) {
    if (!token || !stationId) return;
    setError(null);
    setAdvancingItemId(item.id);
    try {
      await advanceItem(token, stationId, item.id);
      // PENDENTE/EM_PREPARO -> PRONTO tiram o item da fila ativa, então
      // recarregamos do servidor em vez de tentar adivinhar o novo estado.
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setAdvancingItemId(null);
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 px-4 py-10">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">Preparo</h1>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={load}
              className="text-sm text-neutral-400 hover:text-neutral-200"
            >
              Atualizar
            </button>
            <Link to="/production" className="text-sm text-neutral-400 hover:text-neutral-200">
              Trocar estação
            </Link>
          </div>
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

        {!loading && !error && items.length === 0 && (
          <p className="text-neutral-400 bg-neutral-900 border border-neutral-800 rounded-2xl p-6 text-lg">
            Nenhum item aguardando preparo nesta estação.
          </p>
        )}

        {!loading && items.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <ProductionItemCard
                key={item.id}
                item={item}
                onAdvance={handleAdvance}
                advancing={advancingItemId === item.id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
