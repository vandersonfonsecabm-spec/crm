import type { StatusCliente } from "../types/cliente";

type CustomerFiltersProps = {
  search: string;
  status: StatusCliente | "Todos";
  onSearchChange: (value: string) => void;
  onStatusChange: (
    value: StatusCliente | "Todos"
  ) => void;
};

export function CustomerFilters({
  search,
  status,
  onSearchChange,
  onStatusChange,
}: CustomerFiltersProps) {
  return (
    <div className="flex items-center gap-5">
      <input
        type="text"
        placeholder="Buscar cliente..."
        value={search}
        onChange={(event) =>
          onSearchChange(event.target.value)
        }
        className="
          flex-1
          h-16
          rounded-3xl
          border
          border-[#1f2937]
          bg-[#0f172a]
          px-6
          text-xl
          text-white
          outline-none
          transition-all
          duration-300
          focus:border-fuchsia-500
          focus:shadow-lg
          focus:shadow-fuchsia-500/10
        "
      />

      <select
        value={status}
        onChange={(event) =>
          onStatusChange(
            event.target.value as
              | StatusCliente
              | "Todos"
          )
        }
        className="
          w-[260px]
          h-16
          rounded-3xl
          border
          border-[#1f2937]
          bg-[#0f172a]
          px-6
          text-xl
          text-white
          outline-none
          transition-all
          duration-300
          focus:border-fuchsia-500
          focus:shadow-lg
          focus:shadow-fuchsia-500/10
        "
      >
        <option value="Todos">
          Todos os status
        </option>

        <option value="Lead">
          Lead
        </option>

        <option value="Cliente ativo">
          Cliente ativo
        </option>

        <option value="Pendente">
          Pendente
        </option>
      </select>
    </div>
  );
}