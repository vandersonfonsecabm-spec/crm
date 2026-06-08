import { useState } from "react";
import Dashboard from "./pages/Dashboard";
import { Login } from "./pages/Login";

function App() {
  const [autenticado, setAutenticado] = useState(false);

  function entrar() {
    setAutenticado(true);
  }

  if (!autenticado) {
    return <Login onLogin={entrar} />;
  }

  return <Dashboard />;
}

export default App;
