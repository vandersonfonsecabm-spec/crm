type LoginProps = {
  onLogin: () => void;
};

export function Login({ onLogin }: LoginProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#080b12] px-4 text-white">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-2xl">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold">CRM Enterprise</h1>
          <p className="mt-1 text-sm text-slate-400">Acesso operacional</p>
        </div>

        <button
          onClick={onLogin}
          className="w-full rounded-xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-slate-200"
        >
          Entrar no CRM
        </button>
      </div>
    </div>
  );
}