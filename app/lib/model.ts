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

export const seedExpenses: Expense[] = [
  { id: uid(), description: "Supermercado", amount: 287.4, spentAt: "2026-09-06", category: "Mercado", person: "Beto + Mari", author: "Beto", payment: "Crédito", note: "Compras da semana", installment: 1, installmentCount: 1, version: 1, createdAt: "2026-09-06T13:20:00.000Z", updatedAt: "2026-09-06T13:20:00.000Z", syncStatus: "synced" },
  { id: uid(), description: "Posto Shell", amount: 250, spentAt: "2026-09-05", category: "Transporte", person: "Beto", author: "Beto", payment: "Pix", note: "", installment: 1, installmentCount: 1, version: 1, createdAt: "2026-09-05T20:05:00.000Z", updatedAt: "2026-09-05T20:05:00.000Z", syncStatus: "synced" },
  { id: uid(), description: "Jantar", amount: 118.9, spentAt: "2026-09-04", category: "Alimentação", person: "Mari", author: "Mari", payment: "Crédito", note: "", installment: 1, installmentCount: 1, version: 1, createdAt: "2026-09-04T23:40:00.000Z", updatedAt: "2026-09-04T23:40:00.000Z", syncStatus: "synced" },
  { id: uid(), description: "Farmácia", amount: 79.8, spentAt: "2026-09-03", category: "Saúde", person: "Mari", author: "Mari", payment: "Débito", note: "", installment: 1, installmentCount: 1, version: 1, createdAt: "2026-09-03T17:15:00.000Z", updatedAt: "2026-09-03T17:15:00.000Z", syncStatus: "synced" },
];
