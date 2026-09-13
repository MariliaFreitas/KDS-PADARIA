import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { ApiError } from "../../services/apiClient.js";
import { listProducts } from "../products/productsService.js";
import type { Product } from "../products/types.js";
import { createVariation, listVariations, updateVariation } from "./variationsService.js";
import type { ProductVariation } from "./types.js";

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

export default function ProductVariationsPage() {
  const { productId } = useParams<{ productId: string }>();
  const { token } = useAuth();

  const [product, setProduct] = useState<Product | null>(null);
  const [variations, setVariations] = useState<ProductVariation[]>([]);
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

  async function loadData() {
    if (!token || !productId) return;
    setLoading(true);
    setError(null);
    try {
      const [products, variationsResult] = await Promise.all([
        listProducts(token),
        listVariations(token, productId),
      ]);
      setProduct(products.find((item) => item.id === productId) ?? null);
      setVariations(variationsResult);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, productId]);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!token || !productId) return;
    setError(null);
    setCreating(true);
    try {
      const priceCents = reaisInputToCents(newPrice);
      const created = await createVariation(token, productId, {
        name: newName,
        priceCents: priceCents ?? 0,
      });
      setVariations((current) =>
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

  function startEdit(variation: ProductVariation) {
    setError(null);
    setEditingId(variation.id);
    setEditName(variation.name);
    setEditPrice(centsToReaisInput(variation.priceCents));
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditPrice("");
  }

  async function handleSaveEdit(event: FormEvent, variationId: string) {
    event.preventDefault();
    if (!token || !productId) return;
    setError(null);
    setSavingId(variationId);
    try {
      const priceCents = reaisInputToCents(editPrice);
      const updated = await updateVariation(token, productId, variationId, {
        name: editName,
        ...(priceCents !== null ? { priceCents } : {}),
      });
      setVariations((current) =>
        current
          .map((variation) => (variation.id === variationId ? updated : variation))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      setEditingId(null);
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
          <div>
            <h1 className="text-2xl font-semibold">Variações do produto</h1>
            <p className="text-sm text-neutral-400">
              {product ? product.name : loading ? "Carregando..." : "Produto não encontrado"}
            </p>
          </div>
          <Link to="/admin/products" className="text-sm text-neutral-400 hover:text-neutral-200">
            Voltar para produtos
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
            <label className="text-sm text-neutral-300">Nome da variação</label>
            <input
              type="text"
              required
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="Ex: Grande"
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

          {!loading && variations.length === 0 && (
            <p className="p-4 text-sm text-neutral-400">Nenhuma variação cadastrada ainda.</p>
          )}

          {!loading &&
            variations.map((variation) => {
              const isEditing = editingId === variation.id;
              const isSaving = savingId === variation.id;

              if (isEditing) {
                return (
                  <form
                    key={variation.id}
                    onSubmit={(event) => handleSaveEdit(event, variation.id)}
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
                <div key={variation.id} className="p-4 flex items-center gap-3">
                  <span className="flex-1">{variation.name}</span>
                  <span className="text-neutral-300">{formatBRL(variation.priceCents)}</span>
                  <button
                    type="button"
                    onClick={() => startEdit(variation)}
                    className="text-sm rounded-lg border border-neutral-700 px-3 py-1.5 hover:bg-neutral-800 transition-colors"
                  >
                    Editar
                  </button>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
