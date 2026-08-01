import { useEffect, useState } from "react";
import { ErrorState } from "./components/ui";
import Dashboard from "./pages/Dashboard";
import { Login } from "./pages/Login";
import PublicSecurityFlow from "./pages/PublicSecurityFlow";
import {
  cleanupLegacyBypassStorage,
  clearAuthSession,
  fetchAuthMe,
  getAuthSession,
  logoutFromBackend,
  refreshAuthSession,
  shouldInvalidateAuthSession,
} from "./services/crmApi";

function App() {
  const [authState, setAuthState] = useState<"checking" | "authenticated" | "unauthenticated" | "unavailable">("checking");
  const [authCheckAttempt, setAuthCheckAttempt] = useState(0);
  const [publicPath, setPublicPath] = useState(() => window.location.pathname);

  useEffect(() => {
    const handlePopState = () => setPublicPath(window.location.pathname);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    let active = true;

    async function validateStoredSession() {
      cleanupLegacyBypassStorage();
      try {
        if (!getAuthSession()) await refreshAuthSession();
        await fetchAuthMe();
        if (active) setAuthState("authenticated");
      } catch (error) {
        if (shouldInvalidateAuthSession(error)) {
          clearAuthSession();
          if (active) setAuthState("unauthenticated");
          return;
        }
        if (active) setAuthState("unavailable");
      }
    }

    void validateStoredSession();
    return () => {
      active = false;
    };
  }, [authCheckAttempt]);

  function entrar() {
    setAuthState("authenticated");
  }

  function navigatePublic(pathname: string) {
    window.history.pushState({}, document.title, pathname);
    setPublicPath(pathname);
  }

  async function sair() {
    try {
      await logoutFromBackend();
    } catch {
      // A local logout still clears the browser session if the server is unavailable.
    } finally {
      clearAuthSession();
      setAuthState("unauthenticated");
    }
  }

  if (authState === "checking") {
    return (
      <main className="login-shell flex min-h-screen items-center justify-center px-4" aria-busy="true">
        <p aria-live="polite" className="text-sm text-slate-400" role="status">Validando acesso...</p>
      </main>
    );
  }

  if (authState === "unauthenticated") {
    const securityMode = publicPath === "/recuperar-senha"
      ? "recovery"
      : publicPath === "/redefinir-senha"
        ? "reset"
        : publicPath === "/aceitar-convite"
          ? "invite"
          : null;
    if (securityMode) return <PublicSecurityFlow mode={securityMode} onBack={() => navigatePublic("/")} />;
    return <Login onLogin={entrar} onOpenRecovery={() => navigatePublic("/recuperar-senha")} />;
  }

  if (authState === "unavailable") {
    return (
      <main className="login-shell flex min-h-screen items-center justify-center px-4">
        <ErrorState
          description="Sua sessão foi preservada. Verifique a conexão e tente validar o acesso novamente."
          onRetry={() => {
            setAuthState("checking");
            setAuthCheckAttempt((attempt) => attempt + 1);
          }}
          role="alert"
          title="Não foi possível validar o acesso agora"
        />
      </main>
    );
  }

  return <Dashboard onLogout={sair} />;
}

export default App;
