import { useEffect, useState } from "react";
import { ErrorState } from "./components/ui";
import Dashboard from "./pages/Dashboard";
import { Login } from "./pages/Login";
import {
  cleanupLegacyBypassStorage,
  clearAuthSession,
  fetchAuthMe,
  getAuthSession,
  shouldInvalidateAuthSession,
} from "./services/crmApi";

function App() {
  const [authState, setAuthState] = useState<"checking" | "authenticated" | "unauthenticated" | "unavailable">("checking");
  const [authCheckAttempt, setAuthCheckAttempt] = useState(0);

  useEffect(() => {
    let active = true;

    async function validateStoredSession() {
      cleanupLegacyBypassStorage();
      if (!getAuthSession()) {
        if (active) setAuthState("unauthenticated");
        return;
      }

      try {
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

  function sair() {
    clearAuthSession();
    setAuthState("unauthenticated");
  }

  if (authState === "checking") {
    return (
      <main className="login-shell flex min-h-screen items-center justify-center px-4" aria-busy="true">
        <p aria-live="polite" className="text-sm text-slate-400" role="status">Validando acesso...</p>
      </main>
    );
  }

  if (authState === "unauthenticated") {
    return <Login onLogin={entrar} />;
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
