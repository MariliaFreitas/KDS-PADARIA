import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { ApiError } from "../../services/apiClient.js";
import { listStations } from "../stations/stationsService.js";
import type { Station } from "../stations/types.js";
import { createProduct, listProducts, updateProduct } from "./productsService.js";
import type { Product, SaleType } from "./types.js";

const SALE_TYPE_LABEL: Record<SaleType, string> = {
  UNIT: "Por unidade",
  WEIGHT: "Por peso (kg)",
  VARIATION: "Por variação/tamanho",
};

function centsToReaisInput(cents: number | null): string {
  if (cents === null || cents === undefined) return "";
  return (cents / 100).toFixed(2);
}

function reaisInputToCents(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value.replace(",", "."));
  if (Number.isNaN(parsed)) return null;
  return Math.round(parsed * 100);
}

function formatBRL(cents: number | null): string {
  if (cents === null || cents === undefined) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    cents / 100,
  );
}

interface ProductFormValue {
  name: string;
  saleType: SaleType;
  priceInput: string;
  requiresProduction: boolean;
  stationId: string;
}

const EMPTY_FORM: ProductFormValue = {
  name: "",
  saleType: "UNIT",
  priceInput: "",
  requiresProduction: false,
  stationId: "",
};

function productToFormValue(product: Product): ProductFormValue {
  return {
    name: product.name,
    saleType: product.saleType,
    priceInput:
      product.saleType === "UNIT"
        ? centsToReaisInput(product.unitPriceCents)
        : product.saleType === "WEIGHT"
          ? centsToReaisInput(product.pricePerKgCents)
          : "",
    requiresProduction: product.requiresProduction,
    stationId: product.stationId ?? "",
  };
}

interface ProductFormProps {
  value: ProductFormValue;
  onChange: (value: ProductFormValue) => void;
  onSubmit: (event: FormEvent) => void;
  stations: Station[];
  submitLabel: string;
  submitting: boolean;
  onCancel?: () => void;
}

function ProductForm({
  value,
  onChange,
  onSubmit,
  stations,
  submitLabel,
  submitting,
  onCancel,
}: ProductFormProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-sm text-neutral-300">Nome</label>
          <input
            type="text"
            required
            value={value.name}
            onChange={(event) => onChange({ ...value, name: event.target.value })}
            className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2 text-neutral-100 outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm text-neutral-300">Forma de venda</label>
          <select
            value={value.saleType}
            onChange={(event) =>
              onChange({
                ...value,
                saleType: event.target.value as SaleType,
                priceInput: "",
              })
            }
            className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2 text-neutral-100 outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="UNIT">Por unidade</option>
            <option value="WEIGHT">Por peso (kg)</option>
            <option value="VARIATION">Por variação/tamanho</option>
          </select>
        </div>
      </div>

      {value.saleType === "UNIT" && (
        <div className="space-y-1">
          <label className="text-sm text-neutral-300">Preço unitário (R$)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            required
            value={value.priceInput}
            onChange={(event) => onChange({ ...value, priceInput: event.target.value })}
            className="w-full sm:w-48 rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2 text-neutral-100 outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      )}

      {value.saleType === "WEIGHT" && (
        <div className="space-y-1">
          <label className="text-sm text-neutral-300">Preço por kg (R$)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            required
            value={value.priceInput}
            onChange={(event) => onChange({ ...value, priceInput: event.target.value })}
            className="w-full sm:w-48 rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2 text-neutral-100 outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      )}

      {value.saleType === "VARIATION" && (
        <p className="text-sm text-neutral-400 bg-neutral-800/60 border border-neutral-700 rounded-lg px-3 py-2">
          Os tamanhos e variações desse produto serão configurados separadamente
          (cadastro de variações, Etapa 6). Por enquanto o produto pode ser criado
          sem preço.
        </p>
      )}

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm text-neutral-300">
          <input
            type="checkbox"
            checked={value.requiresProduction}
            onChange={(event) =>
              onChange({
                ...value,
                requiresProduction: event.target.checked,
                stationId: event.target.checked ? value.stationId : "",
              })
            }
            className="rounded border-neutral-700 bg-neutral-800"
          />
          Este produto exige produção (vai para uma estação)
        </label>

        {value.requiresProduction && (
          <select
            required
            value={value.stationId}
            onChange={(event) => onChange({ ...value, stationId: event.target.value })}
            className="w-full sm:w-64 rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2 text-neutral-100 outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">Selecione uma estação</option>
            {stations.map((station) => (
              <option key={station.id} value={station.id}>
                {station.name}
                {!station.active ? " (inativa)" : ""}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium px-4 py-2 text-sm transition-colors"
        >
          {submitting ? "Salvando..." : submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="rounded-lg border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-800 disabled:opacity-60 transition-colors"
          >
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}

export default function ProductsPage() {
  const { token } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createForm, setCreateForm] = useState<ProductFormValue>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ProductFormValue>(EMPTY_FORM);
  const [savingId, setSavingId] = useState<string | null>(null);

  function errorMessage(err: unknown): string {
    return err instanceof ApiError ? err.message : "Não foi possível conectar ao servidor.";
  }

  async function loadData() {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [productsResult, stationsResult] = await Promise.all([
        listProducts(token),
        listStations(token),
      ]);
      setProducts(productsResult);
      setStations(stationsResult);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function buildPayload(form: ProductFormValue) {
    return {
      name: form.name.trim(),
      saleType: form.saleType,
      requiresProduction: form.requiresProduction,
      stationId: form.requiresProduction ? form.stationId || null : null,
      unitPriceCents: form.saleType === "UNIT" ? reaisInputToCents(form.priceInput) : null,
      pricePerKgCents: form.saleType === "WEIGHT" ? reaisInputToCents(form.priceInput) : null,
    };
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    setError(null);
    setCreating(true);
    try {
      const created = await createProduct(token, buildPayload(createForm));
      setProducts((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name)));
      setCreateForm(EMPTY_FORM);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCreating(false);
    }
  }

  function startEdit(product: Product) {
    setError(null);
    setEditingId(product.id);
    setEditForm(productToFormValue(product));
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(EMPTY_FORM);
  }

  async function handleSaveEdit(event: FormEvent, id: string) {
    event.preventDefault();
    if (!token) return;
    setError(null);
    setSavingId(id);
    try {
      const updated = await updateProduct(token, id, buildPayload(editForm));
      setProducts((current) =>
        current
          .map((product) => (product.id === id ? updated : product))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      setEditingId(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSavingId(null);
    }
  }

  async function handleToggleActive(product: Product) {
    if (!token) return;
    setError(null);
    setSavingId(product.id);
    try {
      const updated = await updateProduct(token, product.id, { active: !product.active });
      setProducts((current) => current.map((item) => (item.id === product.id ? updated : item)));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSavingId(null);
    }
  }

  async function handleToggleAvailable(product: Product) {
    if (!token) return;
    setError(null);
    setSavingId(product.id);
    try {
      const updated = await updateProduct(token, product.id, { available: !product.available });
      setProducts((current) => current.map((item) => (item.id === product.id ? updated : item)));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSavingId(null);
    }
  }

  function priceLabel(product: Product): string {
    if (product.saleType === "UNIT") return formatBRL(product.unitPriceCents);
    if (product.saleType === "WEIGHT") return `${formatBRL(product.pricePerKgCents)} / kg`;
    return "definido por variação";
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 px-4 py-10">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Cadastro de produtos</h1>
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

        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4">
          <h2 className="text-sm font-medium text-neutral-300 mb-3">Novo produto</h2>
          <ProductForm
            value={createForm}
            onChange={setCreateForm}
            onSubmit={handleCreate}
            stations={stations}
            submitLabel="Adicionar"
            submitting={creating}
          />
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl divide-y divide-neutral-800">
          {loading && <p className="p-4 text-sm text-neutral-400">Carregando...</p>}

          {!loading && products.length === 0 && (
            <p className="p-4 text-sm text-neutral-400">Nenhum produto cadastrado ainda.</p>
          )}

          {!loading &&
            products.map((product) => {
              const isEditing = editingId === product.id;
              const isSaving = savingId === product.id;

              if (isEditing) {
                return (
                  <div key={product.id} className="p-4">
                    <ProductForm
                      value={editForm}
                      onChange={setEditForm}
                      onSubmit={(event) => handleSaveEdit(event, product.id)}
                      stations={stations}
                      submitLabel="Salvar"
                      submitting={isSaving}
                      onCancel={cancelEdit}
                    />
                  </div>
                );
              }

              return (
                <div key={product.id} className="p-4 flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-[10rem]">
                    <p className="font-medium">{product.name}</p>
                    <p className="text-sm text-neutral-400">
                      {SALE_TYPE_LABEL[product.saleType]} — {priceLabel(product)}
                      {product.requiresProduction && (
                        <>
                          {" "}
                          — estação:{" "}
                          {product.station ? product.station.name : "não definida"}
                        </>
                      )}
                    </p>
                  </div>

                  <span
                    className={
                      "text-xs px-2 py-1 rounded-full border " +
                      (product.active
                        ? "text-emerald-400 border-emerald-900 bg-emerald-950/40"
                        : "text-neutral-400 border-neutral-700 bg-neutral-800/60")
                    }
                  >
                    {product.active ? "Ativo" : "Inativo"}
                  </span>

                  <span
                    className={
                      "text-xs px-2 py-1 rounded-full border " +
                      (product.available
                        ? "text-sky-400 border-sky-900 bg-sky-950/40"
                        : "text-amber-400 border-amber-900 bg-amber-950/40")
                    }
                  >
                    {product.available ? "Disponível" : "Indisponível"}
                  </span>

                  <button
                    type="button"
                    onClick={() => startEdit(product)}
                    className="text-sm rounded-lg border border-neutral-700 px-3 py-1.5 hover:bg-neutral-800 transition-colors"
                  >
                    Editar
                  </button>
                  {product.saleType === "VARIATION" && (
                    <Link
                      to={`/admin/products/${product.id}/variations`}
                      className="text-sm rounded-lg border border-neutral-700 px-3 py-1.5 hover:bg-neutral-800 transition-colors"
                    >
                      Gerenciar variações
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={() => handleToggleActive(product)}
                    disabled={isSaving}
                    className="text-sm rounded-lg border border-neutral-700 px-3 py-1.5 hover:bg-neutral-800 disabled:opacity-60 transition-colors"
                  >
                    {product.active ? "Desativar" : "Ativar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleAvailable(product)}
                    disabled={isSaving}
                    className="text-sm rounded-lg border border-neutral-700 px-3 py-1.5 hover:bg-neutral-800 disabled:opacity-60 transition-colors"
                  >
                    {product.available ? "Marcar indisponível" : "Marcar disponível"}
                  </button>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
