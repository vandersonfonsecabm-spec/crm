import { useState } from "react";
import Dashboard from "./pages/Dashboard";
import { Login } from "./pages/Login";
import { getAuthToken } from "./services/crmApi";

function App() {
  const [autenticado, setAutenticado] = useState(() => Boolean(getAuthToken()));

  function entrar() {
    setAutenticado(true);
  }

  if (!autenticado) {
    return <Login onLogin={entrar} />;
  }

  return <Dashboard />;
}

export default App;
