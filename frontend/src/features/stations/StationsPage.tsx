import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { ApiError } from "../../services/apiClient.js";
import { createStation, listStations, updateStation } from "./stationsService.js";
import type { Station } from "./types.js";

export default function StationsPage() {
  const { token } = useAuth();
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  async function loadStations() {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const result = await listStations(token);
      setStations(result);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function errorMessage(err: unknown): string {
    return err instanceof ApiError ? err.message : "Não foi possível conectar ao servidor.";
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    setError(null);
    setCreating(true);
    try {
      const created = await createStation(token, { name: newName });
      setStations((current) =>
        [...current, created].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setNewName("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCreating(false);
    }
  }

  function startEdit(station: Station) {
    setError(null);
    setEditingId(station.id);
    setEditName(station.name);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
  }

  async function handleSaveName(id: string) {
    if (!token) return;
    setError(null);
    setSavingId(id);
    try {
      const updated = await updateStation(token, id, { name: editName });
      setStations((current) =>
        current
          .map((station) => (station.id === id ? updated : station))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      setEditingId(null);
      setEditName("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSavingId(null);
    }
  }

  async function handleToggleActive(station: Station) {
    if (!token) return;
    setError(null);
    setSavingId(station.id);
    try {
      const updated = await updateStation(token, station.id, { active: !station.active });
      setStations((current) =>
        current.map((item) => (item.id === station.id ? updated : item)),
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 px-4 py-10">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Cadastro de estações</h1>
          <Link to="/" className="text-sm text-neutral-400 hover:text-neutral-200">
            Voltar
          </Link>
        </div>

        {error && (
          <p
            role="alert"
            className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2"
          >
            {error}
          </p>
        )}

        <form
          onSubmit={handleCreate}
          className="flex gap-2 bg-neutral-900 border border-neutral-800 rounded-2xl p-4"
        >
          <input
            type="text"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="Nome da nova estação"
            className="flex-1 rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2 text-neutral-100 outline-none focus:ring-2 focus:ring-emerald-500"
            required
          />
          <button
            type="submit"
            disabled={creating}
            className="rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium px-4 py-2 transition-colors"
          >
            {creating ? "Adicionando..." : "Adicionar"}
          </button>
        </form>

        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl divide-y divide-neutral-800">
          {loading && <p className="p-4 text-sm text-neutral-400">Carregando...</p>}

          {!loading && stations.length === 0 && (
            <p className="p-4 text-sm text-neutral-400">Nenhuma estação cadastrada ainda.</p>
          )}

          {!loading &&
            stations.map((station) => {
              const isEditing = editingId === station.id;
              const isSaving = savingId === station.id;

              return (
                <div key={station.id} className="p-4 flex items-center gap-3">
                  {isEditing ? (
                    <input
                      type="text"
                      value={editName}
                      onChange={(event) => setEditName(event.target.value)}
                      className="flex-1 rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-1.5 text-neutral-100 outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  ) : (
                    <span className="flex-1">{station.name}</span>
                  )}

                  <span
                    className={
                      "text-xs px-2 py-1 rounded-full border " +
                      (station.active
                        ? "text-emerald-400 border-emerald-900 bg-emerald-950/40"
                        : "text-neutral-400 border-neutral-700 bg-neutral-800/60")
                    }
                  >
                    {station.active ? "Ativa" : "Inativa"}
                  </span>

                  {isEditing ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleSaveName(station.id)}
                        disabled={isSaving}
                        className="text-sm rounded-lg border border-emerald-700 text-emerald-400 px-3 py-1.5 hover:bg-emerald-950/40 disabled:opacity-60 transition-colors"
                      >
                        {isSaving ? "Salvando..." : "Salvar"}
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        disabled={isSaving}
                        className="text-sm rounded-lg border border-neutral-700 px-3 py-1.5 hover:bg-neutral-800 disabled:opacity-60 transition-colors"
                      >
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => startEdit(station)}
                        className="text-sm rounded-lg border border-neutral-700 px-3 py-1.5 hover:bg-neutral-800 transition-colors"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleActive(station)}
                        disabled={isSaving}
                        className="text-sm rounded-lg border border-neutral-700 px-3 py-1.5 hover:bg-neutral-800 disabled:opacity-60 transition-colors"
                      >
                        {isSaving
                          ? "Salvando..."
                          : station.active
                            ? "Desativar"
                            : "Ativar"}
                      </button>
                    </>
                  )}
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
