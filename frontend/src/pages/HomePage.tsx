import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../features/auth/AuthContext.js";

type HealthStatus = "checking" | "ok" | "error";

export default function HomePage() {
  const { user, logout } = useAuth();
  const [status, setStatus] = useState<HealthStatus>("checking");

  useEffect(() => {
    const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3333";
    fetch(`${apiUrl}/health`)
      .then((res) => setStatus(res.ok ? "ok" : "error"))
      .catch(() => setStatus("error"));
  }, []);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-semibold">KDS da Padaria</h1>
      <p className="text-neutral-400">
        Olá, {user?.name} — perfil: {user?.role}
      </p>
      <p className="text-sm">
        Backend:{" "}
        {status === "checking" && "verificando..."}
        {status === "ok" && <span className="text-emerald-400">conectado ✓</span>}
        {status === "error" && (
          <span className="text-red-400">não foi possível conectar</span>
        )}
      </p>
      {(user?.role === "ATENDENTE" || user?.role === "ADMIN") && (
        <Link
          to="/orders/new"
          className="mt-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-6 py-3 text-base transition-colors"
        >
          Novo pedido
        </Link>
      )}

      {(user?.role === "PRODUCAO" || user?.role === "ADMIN") && (
        <Link
          to="/production"
          className="mt-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold px-6 py-3 text-base transition-colors"
        >
          Preparo
        </Link>
      )}

      {user?.role === "ADMIN" && (
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <Link
            to="/admin/stations"
            className="rounded-lg border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-800 transition-colors"
          >
            Cadastro de estações
          </Link>
          <Link
            to="/admin/products"
            className="rounded-lg border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-800 transition-colors"
          >
            Cadastro de produtos
          </Link>
          <Link
            to="/admin/additionals"
            className="rounded-lg border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-800 transition-colors"
          >
            Cadastro de adicionais
          </Link>
        </div>
      )}

      <button
        onClick={logout}
        className="mt-4 rounded-lg border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-800 transition-colors"
      >
        Sair
      </button>
    </div>
  );
}
