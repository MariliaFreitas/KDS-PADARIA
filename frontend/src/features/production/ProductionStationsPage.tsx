import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { ApiError } from "../../services/apiClient.js";
import { listProductionStations } from "./productionApi.js";
import type { ProductionStation } from "./production.types.js";

function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : "Não foi possível conectar ao servidor.";
}

export default function ProductionStationsPage() {
  const { token } = useAuth();
  const navigate = useNavigate();

  const [stations, setStations] = useState<ProductionStation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setStations(await listProductionStations(token));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 px-4 py-10">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Preparo</h1>
          <Link to="/" className="text-sm text-neutral-400 hover:text-neutral-200">
            Voltar
          </Link>
        </div>

        <p className="text-neutral-400">Escolha a estação para ver a fila de preparo.</p>

        {error && (
          <p
            role="alert"
            className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2"
          >
            {error}
          </p>
        )}

        {loading && <p className="text-neutral-400">Carregando...</p>}

        {!loading && !error && stations.length === 0 && (
          <p className="text-neutral-400 bg-neutral-900 border border-neutral-800 rounded-2xl p-4">
            Nenhuma estação disponível para preparo no momento.
          </p>
        )}

        {!loading && stations.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {stations.map((station) => (
              <button
                key={station.id}
                type="button"
                onClick={() => navigate(`/production/stations/${station.id}`)}
                className="text-left rounded-2xl bg-neutral-900 border border-neutral-800 hover:border-emerald-700 hover:bg-neutral-800/80 px-5 py-6 transition-colors"
              >
                <p className="text-xl font-semibold text-neutral-100">{station.name}</p>
                {!station.active && (
                  <p className="text-sm text-amber-400 mt-1">
                    Estação inativa — finalizando itens em andamento
                  </p>
                )}
              </button>
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
