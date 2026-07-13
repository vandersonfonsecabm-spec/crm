import { useEffect, useState } from "react";
import Dashboard from "./pages/Dashboard";
import { Login } from "./pages/Login";
import {
  cleanupLegacyBypassStorage,
  clearAuthSession,
  fetchAuthMe,
  getAuthSession,
} from "./services/crmApi";

function App() {
  const [authState, setAuthState] = useState<"checking" | "authenticated" | "unauthenticated">("checking");

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
      } catch {
        clearAuthSession();
        if (active) setAuthState("unauthenticated");
      }
    }

    void validateStoredSession();
    return () => {
      active = false;
    };
  }, []);

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
        <p className="text-sm text-slate-400">Validando acesso...</p>
      </main>
    );
  }

  if (authState === "unauthenticated") {
    return <Login onLogin={entrar} />;
  }

  return <Dashboard onLogout={sair} />;
}

export default App;
