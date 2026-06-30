"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Shell from "@/components/Shell";
import StatusBadge from "@/components/StatusBadge";
import { supabaseBrowser } from "@/lib/supabaseClient";
import { Budget, BudgetStatus, STATUS_LIST } from "@/lib/types";

function fmtMoney(v: number) {
  return (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR");
}

type SortField = "criado_novo" | "criado_antigo" | "regiao" | "valor" | "cliente";

function OrcamentosContent() {
  const supabase = supabaseBrowser();
  const search = useSearchParams();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"lista" | "kanban">("lista");
  const [statusFilter, setStatusFilter] = useState<BudgetStatus | "todos">(
    (search.get("status") as BudgetStatus) || "todos"
  );
  const [sort, setSort] = useState<SortField>("criado_novo");
  const [query, setQuery] = useState("");
  const [draggingId, setDraggingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("budgets")
      .select("*, client:clients(*)")
      .order("created_at", { ascending: false });
    setBudgets((data as any) || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    let list = budgets.slice();
    if (statusFilter !== "todos") list = list.filter((b) => b.status === statusFilter);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((b) => (b.client?.name || "").toLowerCase().includes(q));
    }
    list.sort((a, b) => {
      switch (sort) {
        case "criado_novo":
          return +new Date(b.created_at) - +new Date(a.created_at);
        case "criado_antigo":
          return +new Date(a.created_at) - +new Date(b.created_at);
        case "regiao":
          return a.regiao.localeCompare(b.regiao);
        case "valor":
          return b.valor_final - a.valor_final;
        case "cliente":
          return (a.client?.name || "").localeCompare(b.client?.name || "");
        default:
          return 0;
      }
    });
    return list;
  }, [budgets, statusFilter, sort, query]);

  async function updateStatus(id: string, newStatus: BudgetStatus) {
    const budget = budgets.find((b) => b.id === id);
    if (!budget || budget.status === newStatus) return;
    // otimista
    setBudgets((prev) => prev.map((b) => (b.id === id ? { ...b, status: newStatus } : b)));
    await supabase.from("budgets").update({ status: newStatus }).eq("id", id);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase.from("status_history").insert({
      budget_id: id,
      old_status: budget.status,
      new_status: newStatus,
      changed_by: user?.id,
    });
  }

  return (
    <Shell>
      <div className="flex items-center justify-between flex-wrap gap-3.5 mb-6">
        <div>
          <div className="text-2xl font-semibold">Orçamentos</div>
          <div className="text-muted text-[13.5px] mt-1">
            {loading ? "carregando…" : `${filtered.length} resultado${filtered.length === 1 ? "" : "s"}`}
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="flex bg-surface2 border border-[#2b2b36] rounded-[10px] p-1">
            <button
              onClick={() => setView("lista")}
              className={`px-3.5 py-1.5 rounded-lg text-[12.5px] font-semibold ${view === "lista" ? "bg-surface3 text-text" : "text-muted"}`}
            >
              Lista
            </button>
            <button
              onClick={() => setView("kanban")}
              className={`px-3.5 py-1.5 rounded-lg text-[12.5px] font-semibold ${view === "kanban" ? "bg-surface3 text-text" : "text-muted"}`}
            >
              Kanban
            </button>
          </div>
          <Link href="/orcamentos/novo" className="btn btn-primary">
            + Novo orçamento
          </Link>
        </div>
      </div>

      <div className="flex items-center gap-2.5 flex-wrap mb-4">
        <input
          placeholder="Buscar por nome…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-[260px]"
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="max-w-[220px]">
          <option value="todos">Todos os status</option>
          {STATUS_LIST.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        {view === "lista" && (
          <select value={sort} onChange={(e) => setSort(e.target.value as SortField)} className="max-w-[220px]">
            <option value="criado_novo">Mais novo primeiro</option>
            <option value="criado_antigo">Mais antigo primeiro</option>
            <option value="regiao">Região do corpo (A-Z)</option>
            <option value="valor">Valor (maior primeiro)</option>
            <option value="cliente">Cliente (A-Z)</option>
          </select>
        )}
      </div>

      {view === "lista" ? (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] border-collapse">
              <thead>
                <tr>
                  {["Cliente", "WhatsApp", "Região", "Valor final", "Status", "Criado em", ""].map((h) => (
                    <th key={h} className="text-left text-[11px] uppercase tracking-wide text-muted2 px-3.5 py-2.5 border-b border-[#202028] font-semibold whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((b) => (
                  <tr key={b.id} className="hover:bg-white/[0.018]">
                    <td className="px-3.5 py-3 border-b border-[#202028] font-semibold whitespace-nowrap">{b.client?.name || "—"}</td>
                    <td className="px-3.5 py-3 border-b border-[#202028] whitespace-nowrap">{b.client?.whatsapp || "—"}</td>
                    <td className="px-3.5 py-3 border-b border-[#202028] whitespace-nowrap">{b.regiao}</td>
                    <td className="px-3.5 py-3 border-b border-[#202028] font-bold whitespace-nowrap">{fmtMoney(b.valor_final)}</td>
                    <td className="px-3.5 py-3 border-b border-[#202028] whitespace-nowrap"><StatusBadge status={b.status} /></td>
                    <td className="px-3.5 py-3 border-b border-[#202028] whitespace-nowrap">{fmtDate(b.created_at)}</td>
                    <td className="px-3.5 py-3 border-b border-[#202028] whitespace-nowrap">
                      <Link href={`/orcamentos/${b.id}`} className="btn py-1.5 px-2.5 text-[12.5px]">Ver</Link>
                    </td>
                  </tr>
                ))}
                {!loading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-16 text-muted">
                      Nenhum orçamento encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STATUS_LIST.map((col) => {
            const items = filtered.filter((b) => b.status === col.key);
            return (
              <div
                key={col.key}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (draggingId) updateStatus(draggingId, col.key);
                  setDraggingId(null);
                }}
                className="w-[270px] shrink-0 bg-surface/60 border border-[#202028] rounded-[14px] p-3"
              >
                <div className="flex items-center gap-2 px-1 pb-3 mb-1 border-b border-[#202028]">
                  <span className="w-2 h-2 rounded-full" style={{ background: col.color }} />
                  <span className="text-[12.5px] font-semibold">{col.label}</span>
                  <span className="ml-auto text-[11px] text-muted2">{items.length}</span>
                </div>
                <div className="flex flex-col gap-2.5 min-h-[40px]">
                  {items.map((b) => (
                    <div
                      key={b.id}
                      draggable
                      onDragStart={() => setDraggingId(b.id)}
                      onDragEnd={() => setDraggingId(null)}
                      className="bg-surface2 border border-[#2b2b36] rounded-[11px] p-3 cursor-grab active:cursor-grabbing hover:border-[#3a3a48] transition"
                    >
                      <Link href={`/orcamentos/${b.id}`} className="block">
                        <div className="font-semibold text-[13.5px] mb-1">{b.client?.name || "—"}</div>
                        <div className="text-[11.5px] text-muted mb-2">{b.regiao}{b.cor ? ` · ${b.cor}` : ""}</div>
                        <div className="flex items-center justify-between text-[11px] text-muted2 mb-1.5">
                          <span className="capitalize">{b.complexidade}</span>
                          <span className="font-bold text-gold text-[13px]">{fmtMoney(b.valor_final)}</span>
                        </div>
                        <div className="text-[10.5px] text-muted2">{fmtDate(b.created_at)}</div>
                      </Link>
                    </div>
                  ))}
                  {items.length === 0 && (
                    <div className="text-[11.5px] text-muted2 text-center py-6 border border-dashed border-[#2b2b36] rounded-lg">
                      arraste aqui
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Shell>
  );
}

export default function OrcamentosPage() {
  return (
    <Suspense
      fallback={
        <Shell>
          <div className="text-muted">Carregando orçamentos…</div>
        </Shell>
      }
    >
      <OrcamentosContent />
    </Suspense>
  );
}
