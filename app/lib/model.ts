export type Person = "Beto" | "Mari" | "Beto + Mari";
export type Payment = "Pix" | "Débito" | "Crédito" | "Dinheiro" | "Outro";

export type Expense = {
  id: string;
  description: string;
  amount: number;
  spentAt: string;
  category: string;
  person: Person;
  author: "Beto" | "Mari";
  payment: Payment;
  note: string;
  installment: number;
  installmentCount: number;
  seriesId?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  syncStatus: "synced" | "pending" | "conflict";
};

export type AuditEntry = {
  id: string;
  expenseId: string;
  action: "Criada" | "Editada" | "Excluída" | "Restaurada";
  author: "Beto" | "Mari";
  at: string;
  summary: string;
};

export const defaultCategories = ["Alimentação", "Mercado", "Transporte", "Moradia", "Saúde", "Lazer", "Compras", "Assinaturas", "Outros"];

export const categoryEmoji: Record<string, string> = {
  "Alimentação": "🍝", Mercado: "🛒", Transporte: "🚙", Moradia: "🏡",
  "Saúde": "💊", Lazer: "🎟️", Compras: "🛍️", Assinaturas: "📱", Outros: "•",
};

export const money = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

export const uid = () => crypto.randomUUID();
