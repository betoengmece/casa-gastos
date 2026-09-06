import type { AuditEntry, Expense } from "./model";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const householdToken = process.env.NEXT_PUBLIC_HOUSEHOLD_TOKEN;
const SESSION_KEY = "casa-supabase-session";

type Session = { access_token: string; refresh_token: string; expires_at?: number };

export const remoteEnabled = Boolean(url && key && householdToken);

async function session(): Promise<Session> {
  const saved = localStorage.getItem(SESSION_KEY);
  if (saved) {
    const current = JSON.parse(saved) as Session;
    if (!current.expires_at || current.expires_at * 1000 > Date.now() + 60_000) return current;
    const refreshed = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, { method: "POST", headers: { apikey: key!, "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: current.refresh_token }) });
    if (refreshed.ok) { const next = await refreshed.json(); localStorage.setItem(SESSION_KEY, JSON.stringify(next)); return next; }
  }
  const response = await fetch(`${url}/auth/v1/signup`, { method: "POST", headers: { apikey: key!, "Content-Type": "application/json" }, body: "{}" });
  if (!response.ok) throw new Error("Não foi possível iniciar a sessão silenciosa");
  const next = await response.json(); localStorage.setItem(SESSION_KEY, JSON.stringify(next)); return next;
}

async function request(path: string, init: RequestInit = {}) {
  const auth = await session();
  return fetch(`${url}${path}`, { ...init, headers: { apikey: key!, Authorization: `Bearer ${auth.access_token}`, "Content-Type": "application/json", ...init.headers } });
}

const toRemote = (e: Expense) => ({ id: e.id, description: e.description, amount_cents: Math.round(e.amount * 100), spent_at: e.spentAt, category: e.category, person: e.person, author: e.author, payment: e.payment, note: e.note, installment: e.installment, installment_count: e.installmentCount, series_id: e.seriesId || null, version: e.version, created_at: e.createdAt, updated_at: e.updatedAt, deleted_at: e.deletedAt || null });
const fromRemote = (e: Record<string, unknown>): Expense => ({ id: String(e.id), description: String(e.description), amount: Number(e.amount_cents) / 100, spentAt: String(e.spent_at), category: String(e.category), person: e.person as Expense["person"], author: e.author as Expense["author"], payment: e.payment as Expense["payment"], note: String(e.note || ""), installment: Number(e.installment), installmentCount: Number(e.installment_count), seriesId: e.series_id ? String(e.series_id) : undefined, version: Number(e.version), createdAt: String(e.created_at), updatedAt: String(e.updated_at), deletedAt: e.deleted_at ? String(e.deleted_at) : undefined, syncStatus: "synced" });

export async function connectDevice(person: "Beto" | "Mari") {
  const response = await request("/rest/v1/rpc/bootstrap_household", { method: "POST", body: JSON.stringify({ p_token: householdToken, p_person: person }) });
  if (!response.ok) throw new Error(await response.text());
}

export async function pullRemote(): Promise<{ expenses: Expense[]; audit: AuditEntry[] }> {
  const [expenseResponse, auditResponse] = await Promise.all([
    request("/rest/v1/expenses?select=*&order=updated_at.desc"),
    request("/rest/v1/audit_logs?select=*&order=created_at.desc"),
  ]);
  if (!expenseResponse.ok || !auditResponse.ok) throw new Error("Falha ao baixar alterações");
  const rows = await expenseResponse.json(); const logs = await auditResponse.json();
  return { expenses: rows.map(fromRemote), audit: logs.map((log: Record<string, unknown>) => ({ id: String(log.id), expenseId: String(log.expense_id), action: String(log.action) as AuditEntry["action"], author: String(log.author) as AuditEntry["author"], at: String(log.created_at), summary: String(log.summary) })) };
}

export async function pushRemote(expense: Expense): Promise<Expense> {
  const response = await request("/rest/v1/rpc/sync_expense", { method: "POST", body: JSON.stringify({ p_expense: toRemote(expense), p_expected_version: Math.max(0, expense.version - 1) }) });
  if (!response.ok) {
    const detail = await response.text();
    if (response.status === 409 || detail.includes("version conflict") || detail.includes("40001")) throw new Error("conflict");
    throw new Error(detail);
  }
  return fromRemote(await response.json());
}
