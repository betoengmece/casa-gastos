"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { AuditEntry, categoryEmoji, defaultCategories, Expense, money, Payment, Person, uid } from "./lib/model";
import { localDB } from "./lib/local-db";
import { connectDevice, pullRemote, pushRemote, remoteEnabled } from "./lib/remote";

type Tab = "home" | "history" | "reports" | "settings";
type Draft = { description: string; amount: string; spentAt: string; category: string; person: Person; payment: Payment; installments: string; editSeries: "one" | "all"; note: string };

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const emptyDraft = (person: "Beto" | "Mari", payment: Payment): Draft => ({ description: "", amount: "", spentAt: today(), category: "Mercado", person, payment, installments: "1", editSeries: "one", note: "" });
const parseAmount = (value: string) => Number(value.replace(/\./g, "").replace(",", "."));
const formatDay = (date: string) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(new Date(`${date}T12:00:00`)).replace(".", "");
const formatMoment = (date: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(date));
const formatMonth = (month: string) => new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "America/Sao_Paulo" }).format(new Date(`${month}-15T12:00:00`));

function personShare(expense: Expense, person: "Beto" | "Mari") {
  if (expense.person === person) return expense.amount;
  if (expense.person === "Beto + Mari") return expense.amount / 2;
  return 0;
}

export default function Home() {
  const [tab, setTab] = useState<Tab>("home");
  const [devicePerson, setDevicePerson] = useState<"Beto" | "Mari" | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [categories, setCategories] = useState(defaultCategories);
  const [loaded, setLoaded] = useState(false);
  const [online, setOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine);
  const [composer, setComposer] = useState(false);
  const [selected, setSelected] = useState<Expense | null>(null);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [showTrash, setShowTrash] = useState(false);
  const [reportMonth, setReportMonth] = useState(() => today().slice(0, 7));
  const [toast, setToast] = useState("");
  const [syncing, setSyncing] = useState(false);
  const syncLock = useRef(false);
  const connected = useRef(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft("Beto", "Pix"));

  useEffect(() => {
    const boot = async () => {
      const savedPerson = localStorage.getItem("casa-person") as "Beto" | "Mari" | null;
      const savedCategories = localStorage.getItem("casa-categories");
      const rows = await localDB.loadExpenses();
      const logs = await localDB.loadAudit();
      setDevicePerson(savedPerson);
      if (savedCategories) setCategories(JSON.parse(savedCategories));
      setExpenses(rows);
      setAudit(logs);
      setLoaded(true);
    };
    boot();
    const on = () => setOnline(true), off = () => setOnline(false);
    addEventListener("online", on); addEventListener("offline", off);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    return () => { removeEventListener("online", on); removeEventListener("offline", off); };
  }, []);

  useEffect(() => { if (loaded) localDB.saveExpenses(expenses); }, [expenses, loaded]);
  useEffect(() => { if (loaded) localDB.saveAudit(audit); }, [audit, loaded]);

  useEffect(() => {
    if (!loaded || !devicePerson || !online || !remoteEnabled || syncLock.current) return;
    const unsynced = expenses.filter((e) => e.syncStatus === "pending");
    if (connected.current && !unsynced.length) return;
    syncLock.current = true; setSyncing(true);
    (async () => {
      try {
        await connectDevice(devicePerson); connected.current = true;
        for (const item of unsynced) {
          try {
            const saved = await pushRemote(item);
            setExpenses((old) => old.map((e) => e.id === saved.id ? saved : e));
          } catch (error) {
            if (error instanceof Error && error.message === "conflict") setExpenses((old) => old.map((e) => e.id === item.id ? { ...e, syncStatus: "conflict" } : e));
          }
        }
        const remote = await pullRemote();
        setExpenses((local) => {
          const protectedLocal = local.filter((e) => e.syncStatus !== "synced");
          const protectedIds = new Set(protectedLocal.map((e) => e.id));
          return [...protectedLocal, ...remote.expenses.filter((e) => !protectedIds.has(e.id))];
        });
        setAudit(remote.audit);
      } catch { /* permanece na fila offline e tenta novamente quando a conexão mudar */ }
      finally { syncLock.current = false; setSyncing(false); }
    })();
  }, [loaded, devicePerson, online, expenses]);

  const active = useMemo(() => expenses.filter((e) => !e.deletedAt).sort((a, b) => b.spentAt.localeCompare(a.spentAt) || b.createdAt.localeCompare(a.createdAt)), [expenses]);
  const trashed = useMemo(() => expenses.filter((e) => e.deletedAt), [expenses]);
  const monthKey = today().slice(0, 7);
  const monthLabel = formatMonth(monthKey);
  const month = active.filter((e) => e.spentAt.startsWith(monthKey));
  const total = month.reduce((sum, e) => sum + e.amount, 0);
  const beto = month.reduce((sum, e) => sum + personShare(e, "Beto"), 0);
  const mari = month.reduce((sum, e) => sum + personShare(e, "Mari"), 0);
  const reportExpenses = active.filter((e) => e.spentAt.startsWith(reportMonth));
  const reportTotal = reportExpenses.reduce((sum, e) => sum + e.amount, 0);
  const reportBeto = reportExpenses.reduce((sum, e) => sum + personShare(e, "Beto"), 0);
  const reportMari = reportExpenses.reduce((sum, e) => sum + personShare(e, "Mari"), 0);
  const reportMonths = useMemo(() => {
    const values = new Set(active.map((e) => e.spentAt.slice(0, 7)));
    const cursor = new Date(`${monthKey}-15T12:00:00`);
    for (let index = 0; index < 12; index += 1) {
      values.add(cursor.toISOString().slice(0, 7));
      cursor.setMonth(cursor.getMonth() - 1);
    }
    return [...values].sort((a, b) => b.localeCompare(a));
  }, [active, monthKey]);
  const pending = expenses.filter((e) => e.syncStatus === "pending").length;

  const recentPayment = (person: Person): Payment => {
    const history = active.filter((e) => e.person === person || e.person === "Beto + Mari").slice(0, 10);
    const count = new Map<Payment, number>();
    history.forEach((e) => count.set(e.payment, (count.get(e.payment) || 0) + 1));
    return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "Pix";
  };

  const openNew = () => {
    const person = devicePerson || "Beto";
    setEditing(null); setDraft(emptyDraft(person, recentPayment(person))); setComposer(true);
  };

  const openEdit = (expense: Expense, all = false) => {
    setEditing(expense);
    setDraft({ description: expense.description, amount: expense.amount.toFixed(2).replace(".", ","), spentAt: expense.spentAt, category: expense.category, person: expense.person, payment: expense.payment, installments: "1", editSeries: all ? "all" : "one", note: expense.note });
    setSelected(null); setComposer(true);
  };

  const addLog = (expenseId: string, action: AuditEntry["action"], summary: string) => {
    setAudit((old) => [{ id: uid(), expenseId, action, author: devicePerson || "Beto", at: new Date().toISOString(), summary }, ...old]);
  };

  const saveExpense = (event: FormEvent) => {
    event.preventDefault();
    const amount = parseAmount(draft.amount);
    if (!draft.description.trim() || !amount || amount <= 0) return;
    const now = new Date().toISOString();
    if (editing) {
      const targetIds = new Set(draft.editSeries === "all" && editing.seriesId ? expenses.filter((e) => e.seriesId === editing.seriesId).map((e) => e.id) : [editing.id]);
      setExpenses((old) => old.map((e) => targetIds.has(e.id) ? { ...e, description: draft.description, amount, spentAt: draft.editSeries === "all" && e.id !== editing.id ? e.spentAt : draft.spentAt, category: draft.category, person: draft.person, payment: draft.payment, note: draft.note, updatedAt: now, version: e.version + 1, syncStatus: "pending" } : e));
      expenses.filter((e) => targetIds.has(e.id)).forEach((e) => addLog(e.id, "Editada", `${e.description}: ${money(e.amount)} → ${money(amount)}`));
      setToast(targetIds.size > 1 ? "Todas as parcelas foram atualizadas" : "Despesa atualizada");
    } else {
      const count = Math.max(1, Math.min(48, Number(draft.installments) || 1));
      const seriesId = count > 1 ? uid() : undefined;
      const firstDate = new Date(`${draft.spentAt}T12:00:00`);
      const perInstallment = Math.round((amount / count) * 100) / 100;
      const rows: Expense[] = Array.from({ length: count }, (_, index) => {
        const date = new Date(firstDate); date.setMonth(date.getMonth() + index);
        const row: Expense = { id: uid(), description: draft.description.trim(), amount: index === count - 1 ? Math.round((amount - perInstallment * (count - 1)) * 100) / 100 : perInstallment, spentAt: date.toISOString().slice(0, 10), category: draft.category, person: draft.person, author: devicePerson || "Beto", payment: draft.payment, note: draft.note.trim(), installment: index + 1, installmentCount: count, seriesId, version: 1, createdAt: now, updatedAt: now, syncStatus: "pending" };
        return row;
      });
      setExpenses((old) => [...rows, ...old]); rows.forEach((row) => addLog(row.id, "Criada", count > 1 ? `Parcela ${row.installment}/${count} de ${money(amount)}` : `${draft.description} por ${money(amount)}`));
      setToast(count > 1 ? `${count} parcelas criadas` : "Despesa adicionada");
    }
    setComposer(false); setTimeout(() => setToast(""), 2200);
  };

  const deleteExpense = (expense: Expense) => {
    const at = new Date().toISOString();
    setExpenses((old) => old.map((e) => e.id === expense.id ? { ...e, deletedAt: at, updatedAt: at, version: e.version + 1, syncStatus: "pending" } : e));
    addLog(expense.id, "Excluída", `${expense.description} foi movida para a lixeira`); setSelected(null); setToast("Movida para a lixeira"); setTimeout(() => setToast(""), 2200);
  };

  const restoreExpense = (expense: Expense) => {
    const at = new Date().toISOString();
    setExpenses((old) => old.map((e) => e.id === expense.id ? { ...e, deletedAt: undefined, updatedAt: at, version: e.version + 1, syncStatus: "pending" } : e));
    addLog(expense.id, "Restaurada", `${expense.description} voltou aos lançamentos`);
  };

  const choosePerson = (person: "Beto" | "Mari") => {
    localStorage.setItem("casa-person", person); setDevicePerson(person); setDraft((d) => ({ ...d, person }));
  };

  const addCategory = () => {
    const name = prompt("Nome da nova categoria");
    if (name?.trim() && !categories.includes(name.trim())) { const next = [...categories, name.trim()]; setCategories(next); localStorage.setItem("casa-categories", JSON.stringify(next)); }
  };

  if (!loaded) return <main className="loading"><div className="brand-mark">C</div><span>Organizando a casa…</span></main>;

  return (
    <main className="app-shell">
      {!devicePerson && <Setup onChoose={choosePerson} />}
      <header className="topbar">
        <button className="brand-mark" onClick={() => setTab("home")}>C</button>
        <div className="brand-copy"><strong>Casa</strong><span>{tab === "home" ? monthLabel : tab === "history" ? "Histórico de despesas" : tab === "reports" ? "Relatórios" : "Preferências"}</span></div>
        <span className={`sync-pill ${online ? "" : "offline"}`}><i />{!online ? "Offline" : syncing ? "Sincronizando" : pending ? `${pending} pendente${pending > 1 ? "s" : ""}` : "Em dia"}</span>
        <button className="profile" onClick={() => choosePerson(devicePerson === "Beto" ? "Mari" : "Beto")} aria-label="Trocar pessoa"><span>{devicePerson === "Mari" ? "M" : "B"}</span><span className="online-dot" /></button>
      </header>

      {tab === "home" && <HomeView total={total} beto={beto} mari={mari} expenses={month} onSelect={setSelected} onHistory={() => setTab("history")} />}
      {tab === "history" && <HistoryView expenses={showTrash ? trashed : active} trash={showTrash} onToggleTrash={() => setShowTrash(!showTrash)} onSelect={setSelected} onRestore={restoreExpense} />}
      {tab === "reports" && <ReportsView expenses={reportExpenses} total={reportTotal} beto={reportBeto} mari={reportMari} categories={categories} month={reportMonth} months={reportMonths} onMonth={setReportMonth} onSelect={setSelected} />}
      {tab === "settings" && <SettingsView person={devicePerson || "Beto"} categories={categories} onPerson={choosePerson} onAddCategory={addCategory} auditCount={audit.length} />}

      <button className="fab" onClick={openNew} aria-label="Adicionar despesa">＋</button>
      <nav className="bottom-nav" aria-label="Navegação principal">
        <NavButton active={tab === "home"} icon="⌂" label="Início" onClick={() => setTab("home")} />
        <NavButton active={tab === "history"} icon="◷" label="Histórico" onClick={() => setTab("history")} />
        <span />
        <NavButton active={tab === "reports"} icon="▥" label="Relatórios" onClick={() => setTab("reports")} />
        <NavButton active={tab === "settings"} icon="⚙" label="Ajustes" onClick={() => setTab("settings")} />
      </nav>

      {composer && <ExpenseComposer draft={draft} setDraft={setDraft} categories={categories} editing={!!editing} onClose={() => setComposer(false)} onSubmit={saveExpense} />}
      {selected && <ExpenseDetail expense={selected} audit={audit.filter((log) => log.expenseId === selected.id)} onClose={() => setSelected(null)} onEdit={(all) => openEdit(selected, all)} onDelete={() => deleteExpense(selected)} />}
      {toast && <div className="toast">✓ {toast}</div>}
    </main>
  );
}

function NavButton({ active, icon, label, onClick }: { active: boolean; icon: string; label: string; onClick: () => void }) { return <button className={active ? "active" : ""} onClick={onClick}><span>{icon}</span>{label}</button>; }

function Setup({ onChoose }: { onChoose: (person: "Beto" | "Mari") => void }) {
  return <div className="setup"><section><div className="brand-mark">C</div><small>BEM-VINDOS À CASA</small><h1>Quem está usando este iPhone?</h1><p>Escolha uma vez. O app lembrará automaticamente nos próximos lançamentos.</p><div className="setup-choices"><button onClick={() => onChoose("Beto")}><span className="avatar beto">B</span><strong>Beto</strong><small>iPhone 16 Pro Max</small></button><button onClick={() => onChoose("Mari")}><span className="avatar mari">M</span><strong>Mari</strong><small>iPhone 16</small></button></div><em>Você poderá trocar isso a qualquer momento.</em></section></div>;
}

function HomeView({ total, beto, mari, expenses, onSelect, onHistory }: { total: number; beto: number; mari: number; expenses: Expense[]; onSelect: (e: Expense) => void; onHistory: () => void }) {
  return <>
    <section className="hero-card"><div className="hero-label"><span>Gasto no mês</span><span>Meta: R$ 18.000</span></div><div className="hero-amount">{money(total)}</div><div className="hero-foot"><span><i className="trend">↘</i> Acompanhe o ritmo do casal</span><span>{Math.round(total / 180)}% da meta</span></div><div className="progress"><span style={{ width: `${Math.min(100, total / 180)}%` }} /></div></section>
    <section className="split-grid"><PersonCard name="Beto" value={beto} total={total} /><PersonCard name="Mari" value={mari} total={total} /></section>
    <section className="activity"><div className="section-title"><div><span>Lançamentos do mês</span><small>Role a lista e toque para ver detalhes</small></div><button onClick={onHistory}>Histórico</button></div><ExpenseList expenses={expenses} onSelect={onSelect} /></section>
  </>;
}

function PersonCard({ name, value, total }: { name: "Beto" | "Mari"; value: number; total: number }) { return <article className="person-card"><span className={`avatar ${name.toLowerCase()}`}>{name[0]}</span><div><small>{name}</small><strong>{money(value)}</strong></div><span className="percent">{total ? Math.round(value / total * 100) : 0}%</span></article>; }

function ExpenseList({ expenses, onSelect }: { expenses: Expense[]; onSelect: (e: Expense) => void }) {
  return <div className="expense-list">{expenses.length ? expenses.map((e) => <button className="expense-row" key={e.id} onClick={() => onSelect(e)}><span className="expense-icon">{categoryEmoji[e.category] || "•"}</span><span className="expense-copy"><strong>{e.description}{e.installmentCount > 1 ? ` · ${e.installment}/${e.installmentCount}` : ""}</strong><small>{e.category} · {formatDay(e.spentAt)} · {e.payment}</small></span><span className="expense-value"><strong>− {money(e.amount)}</strong><small>{e.person}</small></span></button>) : <div className="empty">Nenhum lançamento por aqui.</div>}</div>;
}

function HistoryView({ expenses, trash, onToggleTrash, onSelect, onRestore }: { expenses: Expense[]; trash: boolean; onToggleTrash: () => void; onSelect: (e: Expense) => void; onRestore: (e: Expense) => void }) {
  const [query, setQuery] = useState(""); const shown = expenses.filter((e) => e.description.toLowerCase().includes(query.toLowerCase()) || e.category.toLowerCase().includes(query.toLowerCase()));
  return <section className="page-section"><div className="page-heading"><div><small>LANÇAMENTOS</small><h1>{trash ? "Lixeira" : "Histórico"}</h1></div><button className={trash ? "selected-chip" : ""} onClick={onToggleTrash}>{trash ? "Voltar" : `Lixeira`}</button></div><label className="search">⌕<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar descrição ou categoria" /></label>{trash ? <div className="trash-list">{shown.map((e) => <article key={e.id}><div><strong>{e.description}</strong><small>{money(e.amount)} · excluída {e.deletedAt ? formatMoment(e.deletedAt) : ""}</small></div><button onClick={() => onRestore(e)}>Restaurar</button></article>)}{!shown.length && <div className="empty stand">A lixeira está vazia.</div>}</div> : <ExpenseList expenses={shown} onSelect={onSelect} />}</section>;
}

function ReportsView({ expenses, total, beto, mari, categories, month, months, onMonth, onSelect }: { expenses: Expense[]; total: number; beto: number; mari: number; categories: string[]; month: string; months: string[]; onMonth: (month: string) => void; onSelect: (expense: Expense) => void }) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const grouped = categories.map((category) => ({ category, value: expenses.filter((e) => e.category === category).reduce((s, e) => s + e.amount, 0) })).filter((x) => x.value).sort((a, b) => b.value - a.value);
  const categoryExpenses = selectedCategory ? expenses.filter((e) => e.category === selectedCategory) : [];
  return <section className="page-section"><div className="page-heading"><div><small>{formatMonth(month).toUpperCase()}</small><h1>Para onde foi?</h1></div><label className="month-select"><span className="sr-only">Mês do relatório</span><select aria-label="Mês do relatório" value={month} onChange={(event) => { onMonth(event.target.value); setSelectedCategory(null); }}>{months.map((value) => <option value={value} key={value}>{value === today().slice(0, 7) ? "Este mês" : formatMonth(value)}</option>)}</select></label></div><div className="report-total"><small>Total do casal</small><strong>{money(total)}</strong><div><span><i className="beto-dot" />Beto {money(beto)}</span><span><i className="mari-dot" />Mari {money(mari)}</span></div></div><div className="bars"><h2>Por categoria</h2>{grouped.map((row) => <button className={`bar-row ${selectedCategory === row.category ? "open" : ""}`} key={row.category} onClick={() => setSelectedCategory(selectedCategory === row.category ? null : row.category)}><span className="bar-icon">{categoryEmoji[row.category] || "•"}</span><span className="bar-body"><span className="bar-label"><span>{row.category}</span><strong>{money(row.value)} <em>⌄</em></strong></span><i><b style={{ width: `${total ? row.value / total * 100 : 0}%` }} /></i></span></button>)}{!grouped.length && <div className="empty">Nenhum lançamento neste mês.</div>}</div>{selectedCategory && <div className="category-detail"><div className="section-title"><div><span>{categoryEmoji[selectedCategory] || "•"} {selectedCategory}</span><small>{categoryExpenses.length} lançamento{categoryExpenses.length === 1 ? "" : "s"}</small></div><button onClick={() => setSelectedCategory(null)}>Fechar</button></div><ExpenseList expenses={categoryExpenses} onSelect={onSelect} /></div>}<div className="report-note">Despesas marcadas para Beto + Mari entram pela metade no total individual de cada um e uma única vez no consolidado.</div></section>;
}

function SettingsView({ person, categories, onPerson, onAddCategory, auditCount }: { person: "Beto" | "Mari"; categories: string[]; onPerson: (p: "Beto" | "Mari") => void; onAddCategory: () => void; auditCount: number }) {
  return <section className="page-section"><div className="page-heading"><div><small>PERSONALIZAÇÃO</small><h1>Ajustes</h1></div></div><div className="settings-card"><p className="settings-label">Este aparelho registra por padrão como</p><div className="segmented"><button className={person === "Beto" ? "active" : ""} onClick={() => onPerson("Beto")}>Beto</button><button className={person === "Mari" ? "active" : ""} onClick={() => onPerson("Mari")}>Mari</button></div></div><div className="settings-card"><div className="settings-title"><div><strong>Categorias</strong><small>{categories.length} disponíveis</small></div><button onClick={onAddCategory}>＋ Adicionar</button></div><div className="category-cloud">{categories.map((c) => <span key={c}>{categoryEmoji[c] || "•"} {c}</span>)}</div></div><div className="settings-card info-row"><span>↻</span><div><strong>Histórico protegido</strong><small>{auditCount} eventos de auditoria guardados neste aparelho. Alterações nunca apagam o histórico anterior.</small></div></div><div className="settings-card info-row"><span>⌁</span><div><strong>Pronto para sincronizar</strong><small>O modo offline está ativo. A conexão com o Supabase será habilitada pelas variáveis do projeto.</small></div></div></section>;
}

function ExpenseComposer({ draft, setDraft, categories, editing, onClose, onSubmit }: { draft: Draft; setDraft: (d: Draft) => void; categories: string[]; editing: boolean; onClose: () => void; onSubmit: (e: FormEvent) => void }) {
  const update = (key: keyof Draft, value: string) => setDraft({ ...draft, [key]: value });
  return <div className="sheet-backdrop"><button className="backdrop-close" type="button" onClick={onClose} aria-label="Fechar formulário" /><form className="composer full" onSubmit={onSubmit}><div className="grabber" /><div className="composer-head"><div><small>{editing ? "EDITAR LANÇAMENTO" : "NOVO LANÇAMENTO"}</small><h2>{editing ? "Editar despesa" : "Adicionar despesa"}</h2></div><button type="button" onClick={onClose}>×</button></div><label className="amount-input"><span>R$</span><input required inputMode="decimal" placeholder="0,00" value={draft.amount} onChange={(e) => update("amount", e.target.value)} /></label><div className="form-grid"><label className="wide"><span>Descrição *</span><input required placeholder="Ex.: Supermercado" value={draft.description} onChange={(e) => update("description", e.target.value)} /></label><label><span>Data *</span><input required type="date" value={draft.spentAt} onChange={(e) => update("spentAt", e.target.value)} /></label><label><span>Categoria *</span><select value={draft.category} onChange={(e) => update("category", e.target.value)}>{categories.map((c) => <option key={c}>{c}</option>)}</select></label><label><span>Quem gastou *</span><select value={draft.person} onChange={(e) => update("person", e.target.value)}><option>Beto</option><option>Mari</option><option>Beto + Mari</option></select></label><label><span>Pagamento</span><select value={draft.payment} onChange={(e) => update("payment", e.target.value)}><option>Pix</option><option>Débito</option><option>Crédito</option><option>Dinheiro</option><option>Outro</option></select></label>{!editing && <label><span>Parcelas</span><select value={draft.installments} onChange={(e) => update("installments", e.target.value)}>{Array.from({ length: 24 }, (_, i) => <option value={i + 1} key={i}>{i + 1}x</option>)}</select></label>}<label className={editing ? "wide" : ""}><span>Observação</span><input placeholder="Opcional" value={draft.note} onChange={(e) => update("note", e.target.value)} /></label></div><button className="save-button" type="submit">{editing ? "Salvar alterações" : Number(draft.installments) > 1 ? `Criar ${draft.installments} parcelas` : "Salvar despesa"}</button></form></div>;
}

function ExpenseDetail({ expense, audit, onClose, onEdit, onDelete }: { expense: Expense; audit: AuditEntry[]; onClose: () => void; onEdit: (all?: boolean) => void; onDelete: () => void }) {
  return <div className="sheet-backdrop">
    <button className="backdrop-close" type="button" onClick={onClose} aria-label="Fechar detalhes" />
    <section className="composer detail">
      <div className="grabber" />
      <div className="detail-top"><span className="big-icon">{categoryEmoji[expense.category] || "•"}</span><button onClick={onClose}>×</button></div>
      <small className="eyebrow">{expense.category}</small><h2>{expense.description}</h2><strong className="detail-amount">{money(expense.amount)}</strong>
      <div className="detail-grid"><div><small>Quem gastou</small><strong>{expense.person}</strong></div><div><small>Pagamento</small><strong>{expense.payment}</strong></div><div><small>Data</small><strong>{formatDay(expense.spentAt)}</strong></div><div><small>Registrado por</small><strong>{expense.author}</strong></div></div>
      {expense.note && <p className="note">{expense.note}</p>}
      <div className="audit"><h3>Histórico da despesa</h3><article><i /><div><strong>Criada</strong><small>{formatMoment(expense.createdAt)} por {expense.author}</small></div></article>{audit.sort((a,b) => b.at.localeCompare(a.at)).map((log) => <article key={log.id}><i /><div><strong>{log.action}</strong><small>{formatMoment(log.at)} por {log.author}</small><p>{log.summary}</p></div></article>)}</div>
      <div className={`detail-actions ${expense.seriesId ? "series" : ""}`}><button className="delete" onClick={onDelete}>Excluir</button><button className="edit" onClick={() => onEdit(false)}>Editar esta</button>{expense.seriesId && <button className="edit-all" onClick={() => onEdit(true)}>Editar todas</button>}</div>
    </section>
  </div>;
}
