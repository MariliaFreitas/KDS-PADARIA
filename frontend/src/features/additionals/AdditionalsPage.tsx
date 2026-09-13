import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { ApiError } from "../../services/apiClient.js";
import { createAdditional, listAdditionals, updateAdditional } from "./additionalsService.js";
import type { Additional } from "./types.js";

function centsToReaisInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

function reaisInputToCents(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value.replace(",", "."));
  if (Number.isNaN(parsed)) return null;
  return Math.round(parsed * 100);
}

function formatBRL(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    cents / 100,
  );
}

export default function AdditionalsPage() {
  const { token } = useAuth();
  const [additionals, setAdditionals] = useState<Additional[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  function errorMessage(err: unknown): string {
    return err instanceof ApiError ? err.message : "Não foi possível conectar ao servidor.";
  }

  async function loadAdditionals() {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const result = await listAdditionals(token);
      setAdditionals(result);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAdditionals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    setError(null);
    setCreating(true);
    try {
      const priceCents = reaisInputToCents(newPrice);
      const created = await createAdditional(token, {
        name: newName,
        priceCents: priceCents ?? 0,
      });
      setAdditionals((current) =>
        [...current, created].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setNewName("");
      setNewPrice("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCreating(false);
    }
  }

  function startEdit(additional: Additional) {
    setError(null);
    setEditingId(additional.id);
    setEditName(additional.name);
    setEditPrice(centsToReaisInput(additional.priceCents));
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditPrice("");
  }

  async function handleSaveEdit(event: FormEvent, additionalId: string) {
    event.preventDefault();
    if (!token) return;
    setError(null);
    setSavingId(additionalId);
    try {
      const priceCents = reaisInputToCents(editPrice);
      const updated = await updateAdditional(token, additionalId, {
        name: editName,
        ...(priceCents !== null ? { priceCents } : {}),
      });
      setAdditionals((current) =>
        current
          .map((additional) => (additional.id === additionalId ? updated : additional))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      setEditingId(null);
      setEditPrice("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSavingId(null);
    }
  }

  async function handleToggleActive(additional: Additional) {
    if (!token) return;
    setError(null);
    setSavingId(additional.id);
    try {
      const updated = await updateAdditional(token, additional.id, {
        active: !additional.active,
      });
      setAdditionals((current) =>
        current.map((item) => (item.id === additional.id ? updated : item)),
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
          <h1 className="text-2xl font-semibold">Cadastro de adicionais</h1>
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
          className="grid gap-3 sm:grid-cols-[1fr_auto_auto] items-end bg-neutral-900 border border-neutral-800 rounded-2xl p-4"
        >
          <div className="space-y-1">
            <label className="text-sm text-neutral-300">Nome do adicional</label>
            <input
              type="text"
              required
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="Ex: Queijo extra"
              className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2 text-neutral-100 outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-neutral-300">Preço (R$)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              required
              value={newPrice}
              onChange={(event) => setNewPrice(event.target.value)}
              className="w-full sm:w-32 rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2 text-neutral-100 outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <button
            type="submit"
            disabled={creating}
            className="rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium px-4 py-2 text-sm transition-colors"
          >
            {creating ? "Adicionando..." : "Adicionar"}
          </button>
        </form>

        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl divide-y divide-neutral-800">
          {loading && <p className="p-4 text-sm text-neutral-400">Carregando...</p>}

          {!loading && additionals.length === 0 && (
            <p className="p-4 text-sm text-neutral-400">Nenhum adicional cadastrado ainda.</p>
          )}

          {!loading &&
            additionals.map((additional) => {
              const isEditing = editingId === additional.id;
              const isSaving = savingId === additional.id;

              if (isEditing) {
                return (
                  <form
                    key={additional.id}
                    onSubmit={(event) => handleSaveEdit(event, additional.id)}
                    className="p-4 grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] items-end"
                  >
                    <input
                      type="text"
                      required
                      value={editName}
                      onChange={(event) => setEditName(event.target.value)}
                      className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2 text-neutral-100 outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={editPrice}
                      onChange={(event) => setEditPrice(event.target.value)}
                      className="w-full sm:w-32 rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2 text-neutral-100 outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <button
                      type="submit"
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
                  </form>
                );
              }

              return (
                <div key={additional.id} className="p-4 flex items-center gap-3">
                  <span className="flex-1">{additional.name}</span>
                  <span className="text-neutral-300">{formatBRL(additional.priceCents)}</span>

                  <span
                    className={
                      "text-xs px-2 py-1 rounded-full border " +
                      (additional.active
                        ? "text-emerald-400 border-emerald-900 bg-emerald-950/40"
                        : "text-neutral-400 border-neutral-700 bg-neutral-800/60")
                    }
                  >
                    {additional.active ? "Ativo" : "Inativo"}
                  </span>

                  <button
                    type="button"
                    onClick={() => startEdit(additional)}
                    className="text-sm rounded-lg border border-neutral-700 px-3 py-1.5 hover:bg-neutral-800 transition-colors"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleActive(additional)}
                    disabled={isSaving}
                    className="text-sm rounded-lg border border-neutral-700 px-3 py-1.5 hover:bg-neutral-800 disabled:opacity-60 transition-colors"
                  >
                    {isSaving
                      ? "Salvando..."
                      : additional.active
                        ? "Desativar"
                        : "Ativar"}
                  </button>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
