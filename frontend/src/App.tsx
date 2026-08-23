import { useEffect, useState } from "react";
import { Button, ErrorState } from "./components/ui";
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
  restoreAuthTokenFromSession,
  shouldInvalidateAuthSession,
} from "./services/crmApi";

type PublicSecurityMode = "recovery" | "reset" | "invite";

function getPublicSecurityMode(pathname: string): PublicSecurityMode | null {
  if (pathname === "/recuperar-senha") return "recovery";
  if (pathname === "/redefinir-senha") return "reset";
  if (pathname === "/aceitar-convite") return "invite";
  return null;
}

function App() {
  const [authState, setAuthState] = useState<"checking" | "authenticated" | "unauthenticated" | "unavailable">("checking");
  const [authCheckAttempt, setAuthCheckAttempt] = useState(0);
  const [publicPath, setPublicPath] = useState(() => window.location.pathname);
  const securityMode = getPublicSecurityMode(publicPath);

  useEffect(() => {
    const handlePopState = () => setPublicPath(window.location.pathname);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (securityMode) return;
    let active = true;

    async function validateStoredSession() {
      cleanupLegacyBypassStorage();
      try {
        if (!getAuthSession()) {
          try {
            await refreshAuthSession();
          } catch (refreshError) {
            if (!restoreAuthTokenFromSession()) throw refreshError;
          }
        }
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
  }, [authCheckAttempt, securityMode]);

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

  function returnToLogin() {
    clearAuthSession();
    setAuthState("unauthenticated");
  }

  if (securityMode) return <PublicSecurityFlow mode={securityMode} onBack={() => navigatePublic("/")} />;

  if (authState === "checking") {
    return (
      <main className="login-shell flex min-h-screen items-center justify-center px-4" aria-busy="true">
        <p aria-live="polite" className="text-sm text-slate-400" role="status">Validando acesso...</p>
      </main>
    );
  }

  if (authState === "unauthenticated") {
    return <Login onLogin={entrar} onOpenRecovery={() => navigatePublic("/recuperar-senha")} />;
  }

  if (authState === "unavailable") {
    return (
      <main className="login-shell flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-md">
          <ErrorState
            description="Sua sessão foi preservada. Verifique a conexão e tente validar o acesso novamente."
            onRetry={() => {
              setAuthState("checking");
              setAuthCheckAttempt((attempt) => attempt + 1);
            }}
            role="alert"
            title="Não foi possível validar o acesso agora"
          />
          <div className="mt-2 flex justify-center">
            <Button onClick={returnToLogin} size="sm" variant="ghost">Voltar ao login</Button>
          </div>
        </div>
      </main>
    );
  }

  return <Dashboard onLogout={sair} />;
}

export default App;
