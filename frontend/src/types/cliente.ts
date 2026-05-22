export type StatusCliente =
  | "Lead"
  | "Cliente ativo"
  | "Pendente";

export type Cliente = {
  id: number;
  nome: string;
  status: StatusCliente;
};