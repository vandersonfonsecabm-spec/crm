import { useState } from "react";
import Dashboard from "./pages/Dashboard";
import { Login } from "./pages/Login";
import { clearAuthSession, getAuthToken } from "./services/crmApi";

function App() {
  const [autenticado, setAutenticado] = useState(() => Boolean(getAuthToken()));

  function entrar() {
    setAutenticado(true);
  }

  function sair() {
    clearAuthSession();
    setAutenticado(false);
  }

  if (!autenticado) {
    return <Login onLogin={entrar} />;
  }

  return <Dashboard onLogout={sair} />;
}

export default App;
