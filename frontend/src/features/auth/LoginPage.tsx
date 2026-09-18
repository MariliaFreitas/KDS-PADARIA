import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext.js";
import { login } from "./authService.js";
import { ApiError } from "../../services/apiClient.js";
import mascotMain from "../../assets/kds/mascot/mascot-main.png";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { setAuth } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await login(username, password);
      setAuth(result);
      navigate("/", { replace: true });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Não foi possível conectar ao servidor.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen w-full flex flex-col md:grid md:grid-cols-[44%_56%] overflow-x-hidden bg-[var(--background)]">
      <div className="flex flex-col items-center justify-between gap-4 min-h-[280px] md:min-h-0 px-6 py-8 md:px-12 md:py-12 bg-[var(--brand-soft)]">
        <div className="w-full text-center md:text-left">
          <span className="text-lg font-semibold tracking-[0.18em] text-[var(--brand-dark)]">
            KDS
          </span>

          <p className="mt-3 max-w-[260px] md:max-w-xs mx-auto md:mx-0 text-2xl md:text-3xl font-semibold leading-tight text-[var(--brand-dark)]">
            Operação organizada,
            <br />
            do pedido à entrega.
          </p>
        </div>

        <div className="flex flex-1 items-center justify-center w-full">
          <img
            src={mascotMain}
            alt="Mascote do KDS"
            className="w-36 sm:w-40 md:w-56 lg:w-80 xl:w-[360px] 2xl:w-[380px] max-h-[42vh] md:max-h-[48vh] h-auto object-contain"
          />
        </div>

        <div className="flex items-center justify-center gap-4 md:gap-5 text-xs text-[var(--text-secondary)]">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[var(--status-waiting)]" />
            Aguardando
          </span>

          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[var(--status-preparing)]" />
            Em preparo
          </span>

          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[var(--status-ready)]" />
            Pronto
          </span>
        </div>
      </div>

      <div className="flex items-center justify-center px-6 py-10 md:py-0 bg-[var(--background)]">
        <form onSubmit={handleSubmit} className="w-full max-w-[400px] space-y-5">
          <div className="space-y-1">
            <h2 className="text-2xl font-semibold text-[var(--text-primary)]">
              Bem-vindo de volta!
            </h2>

            <p className="text-sm text-[var(--text-secondary)]">
              Acesse sua conta para continuar.
            </p>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="username"
              className="text-sm font-medium text-[var(--text-primary)]"
            >
              Usuário
            </label>

            <input
              id="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="w-full h-[45px] rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-3.5 text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary)]"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="password"
              className="text-sm font-medium text-[var(--text-primary)]"
            >
              Senha
            </label>

            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full h-[45px] rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-3.5 text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary)]"
              required
            />
          </div>

          {error && (
            <p
              role="alert"
              className="text-sm rounded-lg border border-[var(--status-danger)] bg-[#fceaea] text-[var(--status-danger)] px-3.5 py-2.5"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full h-[45px] rounded-lg bg-[var(--brand-primary)] hover:bg-[var(--brand-dark)] disabled:opacity-60 disabled:cursor-not-allowed text-[var(--text-primary)] hover:text-white font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-dark)] focus-visible:ring-offset-2"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>

          <div className="flex items-center justify-center gap-1.5 pt-1 text-xs text-[var(--text-secondary)]">
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              fill="none"
              className="h-3.5 w-3.5 shrink-0"
            >
              <rect
                x="4"
                y="9"
                width="12"
                height="8"
                rx="1.5"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <path
                d="M7 9V6a3 3 0 0 1 6 0v3"
                stroke="currentColor"
                strokeWidth="1.5"
              />
            </svg>

            <span>Acesso restrito a usuários autorizados.</span>
          </div>
        </form>
      </div>
    </div>
  );
}
