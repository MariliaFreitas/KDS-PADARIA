import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { ApiError } from "../../services/apiClient.js";
import { addOrderItem, getCatalog, getOrder } from "./ordersService.js";
import type { Catalog, CatalogProduct, OrderWithItems } from "./types.js";

function formatBRL(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    cents / 100,
  );
}

function productPriceHint(product: CatalogProduct): string {
  if (product.saleType === "UNIT") {
    return product.unitPriceCents !== null ? formatBRL(product.unitPriceCents) : "";
  }
  if (product.saleType === "WEIGHT") {
    return product.pricePerKgCents !== null ? `${formatBRL(product.pricePerKgCents)}/kg` : "";
  }
  // VARIATION: mostra o menor preço entre as variações, como referência.
  if (product.variations.length === 0) return "";
  const min = Math.min(...product.variations.map((variation) => variation.priceCents));
  return `a partir de ${formatBRL(min)}`;
}

function Stepper({
  value,
  onChange,
}: {
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, value - 1))}
        className="w-12 h-12 rounded-xl border border-neutral-700 text-xl text-neutral-200 hover:bg-neutral-800 transition-colors"
        aria-label="Diminuir quantidade"
      >
        −
      </button>
      <span className="w-10 text-center text-xl font-semibold">{value}</span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        className="w-12 h-12 rounded-xl border border-neutral-700 text-xl text-neutral-200 hover:bg-neutral-800 transition-colors"
        aria-label="Aumentar quantidade"
      >
        +
      </button>
    </div>
  );
}

export default function AddItemPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const { token } = useAuth();
  const navigate = useNavigate();

  const [order, setOrder] = useState<OrderWithItems | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<CatalogProduct | null>(null);

  const [quantity, setQuantity] = useState(1);
  const [variationId, setVariationId] = useState<string | null>(null);
  const [weightGrams, setWeightGrams] = useState("");
  const [selectedAdditionals, setSelectedAdditionals] = useState<Record<string, number>>({});
  const [observation, setObservation] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function errorMessage(err: unknown): string {
    return err instanceof ApiError ? err.message : "Não foi possível conectar ao servidor.";
  }

  useEffect(() => {
    if (!token || !orderId) return;

    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    Promise.all([getOrder(token, orderId), getCatalog(token)])
      .then(([orderResult, catalogResult]) => {
        if (cancelled) return;
        setOrder(orderResult);
        setCatalog(catalogResult);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, orderId]);

  const filteredProducts = useMemo(() => {
    if (!catalog) return [];
    const query = search.trim().toLowerCase();
    if (query === "") return catalog.products;
    return catalog.products.filter((product) => product.name.toLowerCase().includes(query));
  }, [catalog, search]);

  function selectProduct(product: CatalogProduct) {
    setSelectedProduct(product);
    setQuantity(1);
    setVariationId(null);
    setWeightGrams("");
    setSelectedAdditionals({});
    setObservation("");
    setSubmitError(null);
  }

  function toggleAdditional(additionalId: string) {
    setSelectedAdditionals((current) => {
      const next = { ...current };
      if (next[additionalId]) {
        delete next[additionalId];
      } else {
        next[additionalId] = 1;
      }
      return next;
    });
  }

  function setAdditionalQuantity(additionalId: string, value: number) {
    setSelectedAdditionals((current) => ({ ...current, [additionalId]: Math.max(1, value) }));
  }

  const canSubmit =
    !!selectedProduct &&
    (selectedProduct.saleType !== "VARIATION" || variationId !== null) &&
    (selectedProduct.saleType !== "WEIGHT" || /^[1-9]\d*$/.test(weightGrams.trim()));

  async function handleSubmit() {
    if (!token || !orderId || !selectedProduct || !canSubmit) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const additionalsInput = Object.entries(selectedAdditionals).map(
        ([additionalId, additionalQuantity]) => ({
          additionalId,
          quantity: additionalQuantity,
        }),
      );

      await addOrderItem(token, orderId, {
        productId: selectedProduct.id,
        ...(selectedProduct.saleType === "WEIGHT"
          ? { weightGrams: Number(weightGrams.trim()) }
          : { quantity }),
        ...(selectedProduct.saleType === "VARIATION" && variationId
          ? { variationId }
          : {}),
        additionals: additionalsInput,
        observation: observation.trim() === "" ? null : observation.trim(),
      });

      navigate(`/orders/${orderId}`);
    } catch (err) {
      setSubmitError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 px-4 py-8">
      <div className="max-w-md mx-auto space-y-6">
        {loading && <p className="text-neutral-400 text-center">Carregando...</p>}

        {!loading && loadError && (
          <p
            role="alert"
            className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2"
          >
            {loadError}
          </p>
        )}

        {!loading && !loadError && order && catalog && (
          <>
            <div>
              <h1 className="text-2xl font-semibold">Pedido #{order.serviceNumber}</h1>
              <p className="text-neutral-400">{order.customerName}</p>
            </div>

            {order.paymentStatus === "PAGO" && (
              <p className="text-sm text-neutral-300 bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3">
                Esta conta já foi fechada e não aceita novos itens.
              </p>
            )}

            {order.paymentStatus === "PENDENTE" && (
              <>
                {submitError && (
                  <p
                    role="alert"
                    className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2"
                  >
                    {submitError}
                  </p>
                )}

                {!selectedProduct && (
              <>
                <input
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar produto..."
                  autoFocus
                  className="w-full rounded-xl bg-neutral-900 border border-neutral-700 px-4 py-4 text-lg text-neutral-100 outline-none focus:ring-2 focus:ring-emerald-500"
                />

                <div className="space-y-2">
                  {filteredProducts.length === 0 && (
                    <p className="text-sm text-neutral-500 text-center py-6">
                      Nenhum produto encontrado.
                    </p>
                  )}

                  {filteredProducts.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => selectProduct(product)}
                      className="w-full flex items-center justify-between gap-3 rounded-xl bg-neutral-900 border border-neutral-800 px-4 py-4 text-left hover:bg-neutral-800 transition-colors"
                    >
                      <span className="text-lg">{product.name}</span>
                      <span className="text-sm text-neutral-400 whitespace-nowrap">
                        {productPriceHint(product)}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {selectedProduct && (
              <div className="space-y-6">
                <button
                  type="button"
                  onClick={() => setSelectedProduct(null)}
                  className="text-sm text-neutral-400 hover:text-neutral-200"
                >
                  ‹ Trocar produto
                </button>

                <h2 className="text-xl font-semibold">{selectedProduct.name}</h2>

                {selectedProduct.saleType === "UNIT" && (
                  <div className="space-y-2">
                    <span className="text-base text-neutral-300">Quantidade</span>
                    <Stepper value={quantity} onChange={setQuantity} />
                  </div>
                )}

                {selectedProduct.saleType === "VARIATION" && (
                  <>
                    <div className="space-y-2">
                      <span className="text-base text-neutral-300">Variação</span>
                      <div className="flex flex-wrap gap-2">
                        {selectedProduct.variations.map((variation) => (
                          <button
                            key={variation.id}
                            type="button"
                            onClick={() => setVariationId(variation.id)}
                            className={
                              "rounded-xl border px-4 py-3 text-base transition-colors " +
                              (variationId === variation.id
                                ? "border-emerald-500 bg-emerald-950/40 text-emerald-300"
                                : "border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800")
                            }
                          >
                            {variation.name} • {formatBRL(variation.priceCents)}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <span className="text-base text-neutral-300">Quantidade</span>
                      <Stepper value={quantity} onChange={setQuantity} />
                    </div>
                  </>
                )}

                {selectedProduct.saleType === "WEIGHT" && (
                  <div className="space-y-2">
                    <label htmlFor="weightGrams" className="text-base text-neutral-300">
                      Peso (g)
                    </label>
                    <input
                      id="weightGrams"
                      type="number"
                      inputMode="numeric"
                      min="1"
                      step="1"
                      value={weightGrams}
                      onChange={(event) => setWeightGrams(event.target.value)}
                      placeholder="Ex: 250"
                      className="w-full rounded-xl bg-neutral-900 border border-neutral-700 px-4 py-4 text-lg text-neutral-100 outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                )}

                {catalog.additionals.length > 0 && (
                  <div className="space-y-2 border-t border-neutral-800 pt-4">
                    <span className="text-sm text-neutral-400">Adicionais</span>
                    <div className="space-y-2">
                      {catalog.additionals.map((additional) => {
                        const isSelected = Boolean(selectedAdditionals[additional.id]);
                        return (
                          <div
                            key={additional.id}
                            className="flex items-center justify-between gap-3 rounded-xl bg-neutral-900 border border-neutral-800 px-3 py-2"
                          >
                            <button
                              type="button"
                              onClick={() => toggleAdditional(additional.id)}
                              className="flex-1 flex items-center justify-between text-left"
                            >
                              <span
                                className={isSelected ? "text-emerald-300" : "text-neutral-300"}
                              >
                                {additional.name}
                              </span>
                              <span className="text-sm text-neutral-500">
                                {formatBRL(additional.priceCents)}
                              </span>
                            </button>
                            {isSelected && (
                              <Stepper
                                value={selectedAdditionals[additional.id]}
                                onChange={(next) => setAdditionalQuantity(additional.id, next)}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <label htmlFor="observation" className="text-base text-neutral-300">
                    Observação (opcional)
                  </label>
                  <input
                    id="observation"
                    type="text"
                    value={observation}
                    onChange={(event) => setObservation(event.target.value)}
                    placeholder="Ex: bem quente"
                    className="w-full rounded-xl bg-neutral-900 border border-neutral-700 px-4 py-3 text-neutral-100 outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!canSubmit || submitting}
                  className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-lg px-4 py-4 transition-colors"
                >
                  {submitting ? "Adicionando..." : "Adicionar ao pedido"}
                </button>
              </div>
            )}
              </>
            )}

            <div className="text-center">
              <Link
                to={`/orders/${orderId}`}
                className="text-sm text-neutral-400 hover:text-neutral-200"
              >
                Ver pedido
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
