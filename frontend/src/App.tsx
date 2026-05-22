import { useState } from "react";
import Dashboard from "./pages/Dashboard";

function App() {
  const [logado, setLogado] = useState(() => {
    return localStorage.getItem("crm_logado") === "sim";
  });

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");

  function entrar() {
    if (email === "admin@crm.com" && senha === "123456") {
      localStorage.setItem("crm_logado", "sim");
      setLogado(true);
      setErro("");
      return;
    }

    setErro("E-mail ou senha inválidos");
  }

  function sair() {
    localStorage.removeItem("crm_logado");
    setLogado(false);
  }

  if (logado) {
    return <Dashboard onLogout={sair} />;
  }

  return (
    <div className="min-h-screen bg-[#050816] text-white flex items-center justify-center px-6">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0b1024] p-8 shadow-2xl">
        <h1 className="text-5xl font-black bg-gradient-to-r from-fuchsia-400 to-violet-500 bg-clip-text text-transparent">
          CRM
        </h1>

        <p className="mt-2 text-sm text-slate-400">
          Entre para acessar seu painel comercial.
        </p>

        <div className="mt-8 space-y-4">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="E-mail"
            className="h-12 w-full rounded-xl border border-white/10 bg-slate-950 px-4 text-sm outline-none focus:border-fuchsia-500"
          />

          <input
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") entrar();
            }}
            placeholder="Senha"
            type="password"
            className="h-12 w-full rounded-xl border border-white/10 bg-slate-950 px-4 text-sm outline-none focus:border-fuchsia-500"
          />

          {erro && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-300">
              {erro}
            </div>
          )}

          <button
            onClick={entrar}
            className="h-12 w-full rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-500 text-sm font-bold hover:opacity-90 transition"
          >
            Entrar
          </button>

          <div className="rounded-xl bg-slate-950 p-4 text-xs text-slate-400">
            <p>
              <strong className="text-slate-200">E-mail:</strong>{" "}
              admin@crm.com
            </p>
            <p className="mt-1">
              <strong className="text-slate-200">Senha:</strong> 123456
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;