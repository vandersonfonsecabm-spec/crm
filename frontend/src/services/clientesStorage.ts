import type { Cliente } from "../types/cliente";

const STORAGE_KEY = "clientes-crm-saas";

export function buscarClientes(): Cliente[] {
  const clientes = localStorage.getItem(STORAGE_KEY);

  if (!clientes) {
    return [];
  }

  return JSON.parse(clientes);
}

export function salvarClientes(clientes: Cliente[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(clientes));
}