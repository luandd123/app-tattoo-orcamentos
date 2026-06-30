"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Shell from "@/components/Shell";
import StatusBadge from "@/components/StatusBadge";
import { supabaseBrowser } from "@/lib/supabaseClient";
import { getCurrentUserAndProfile, readableError, isPermissionError } from "@/lib/profileUtils";
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
  const [error, setError] = useState<string | null>(null);
  const [profileMissing, setProfileMissing] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    setProfileMissing(false);
    setPermissionDenied(false);
    try {
      const result = await getCurrentUserAndProfile(supabase);

      if (!result.user) {
        // sem sessão — o middleware deveria ter redirecionado para /login,
        // mas por segurança não deixamos a tela presa em loading.
        setError(result.errorMessage || "Sessão não encontrada. Faça login novamente.");
        setBudgets([]);
        return;
      }

      if (!result.profile) {
        if (result.errorType === "permission") {
          setPermissionDenied(true);
        } else {
          setProfileMissing(true);
        }
        setBudgets([]);
        return;
      }

      const { data, error: budgetsError } = await supabase
        .from("budgets")
        .select("*, client:clients(*)")
        .order("created_at", { ascending: false });

      if (budgetsError) {
        if (isPermissionError(budgetsError)) {
          setPermissionDenied(true);
          setBudgets([]);
          return;
        }
        throw budgetsError;
      }

      setBudgets((data as any) || []);
    } catch (err: any) {
      console.error("Erro ao carregar orçamentos:", err);
      setError(readableError(err, "Não foi possível carregar os orçamentos. Tente novamente."));
      setBudgets([]);
    } finally {
      setLoading(false);
    }
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
    const previousStatus = budget.status;
    // otimista
    setBudgets((prev) => prev.map((b) => (b.id === id ? { ...b, status: newStatus } : b)));
    try {
      const { error: updateError } = await supabase.from("budgets").update({ status: newStatus }).eq("id", id);
      if (updateError) throw updateError;

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError) throw userError;

      const { error: historyError } = await supabase.from("status_history").insert({
        budget_id: id,
        old_status: previousStatus,
        new_status: newStatus,
        changed_by: user?.id,
      });
      if (historyError) throw historyError;
    } catch (err: any) {
      console.error("Erro ao atualizar status:", err);
      // reverte a atualização otimista
      setBudgets((prev) => prev.map((b) => (b.id === id ? { ...b, status: previousStatus } : b)));
      alert("Não foi possível atualizar o status: " + readableError(err, "erro desconhecido"));
    }
  }

  if (profileMissing) {
    return (
      <Shell>
        <div className="card p-7 max-w-lg">
          <div className="text-[15px] font-semibold mb-2">Perfil não encontrado</div>
          <p className="text-muted text-[13.5px] leading-relaxed">
            Você está logado, mas não existe um registro seu na tabela <code className="text-gold">profiles</code>.
            Verifique a tabela profiles no Supabase — normalmente ela é preenchida automaticamente ao criar a conta
            (trigger <code className="text-gold">handle_new_user</code>). Se o trigger não rodou, crie a linha manualmente
            ou cadastre-se novamente.
          </p>
          <button className="btn mt-4" onClick={() => load()}>Tentar novamente</button>
        </div>
      </Shell>
    );
  }

  if (permissionDenied) {
    return (
      <Shell>
        <div className="card p-7 max-w-lg">
          <div className="text-[15px] font-semibold mb-2 text-inkbright">Sem permissão para carregar orçamentos.</div>
          <p className="text-muted text-[13.5px] leading-relaxed">
            Seu usuário está autenticado, mas as políticas de segurança (RLS) do banco não permitiram a leitura.
            Confira se o seu perfil em <code className="text-gold">profiles</code> tem um <code className="text-gold">role</code> válido
            (admin, attendant ou viewer) e se as policies da tabela <code className="text-gold">budgets</code> foram aplicadas.
          </p>
          <button className="btn mt-4" onClick={() => load()}>Tentar novamente</button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-7">
        <div>
          <div className="text-[26px] sm:text-2xl font-semibold">Orçamentos</div>
          <div className="text-muted text-[13.5px] mt-1">
            {loading ? "carregando…" : `${filtered.length} resultado${filtered.length === 1 ? "" : "s"}`}
          </div>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
          <div className="flex bg-surface2 border border-[#2b2b36] rounded-[10px] p-1 self-start sm:self-auto">
            <button
              onClick={() => setView("lista")}
              className={`px-4 py-2 sm:px-3.5 sm:py-1.5 rounded-lg text-[13px] sm:text-[12.5px] font-semibold ${view === "lista" ? "bg-surface3 text-text" : "text-muted"}`}
            >
              Lista
            </button>
            <button
              onClick={() => setView("kanban")}
              className={`px-4 py-2 sm:px-3.5 sm:py-1.5 rounded-lg text-[13px] sm:text-[12.5px] font-semibold ${view === "kanban" ? "bg-surface3 text-text" : "text-muted"}`}
            >
              Kanban
            </button>
          </div>
          <Link href="/orcamentos/novo" className="btn btn-primary w-full sm:w-auto justify-center">
            + Novo orçamento
          </Link>
        </div>
      </div>

      {error && (
        <div className="card p-4 mb-5 border-ink/40 bg-ink/[0.07]">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="text-[13.5px] font-semibold text-inkbright mb-1">Erro ao carregar orçamentos</div>
              <div className="text-[12.5px] text-muted">{error}</div>
            </div>
            <button className="btn sm" onClick={() => load()}>Tentar novamente</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="card p-10 text-center text-muted">Carregando orçamentos…</div>
      ) : error && budgets.length === 0 ? null : filtered.length === 0 && budgets.length === 0 ? (
        <div className="card p-10 sm:p-14 text-center">
          <div className="font-display italic text-[20px] text-muted2 mb-2">tela em branco</div>
          <div className="text-muted text-[13.5px] mb-5">Nenhum orçamento cadastrado ainda.</div>
          <Link href="/orcamentos/novo" className="btn btn-primary">
            + Novo orçamento
          </Link>
        </div>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row gap-2.5 mb-5">
            <input
              placeholder="Buscar por nome…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full sm:max-w-[260px]"
            />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="w-full sm:max-w-[220px]">
              <option value="todos">Todos os status</option>
              {STATUS_LIST.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
            {view === "lista" && (
              <select value={sort} onChange={(e) => setSort(e.target.value as SortField)} className="w-full sm:max-w-[220px]">
                <option value="criado_novo">Mais novo primeiro</option>
                <option value="criado_antigo">Mais antigo primeiro</option>
                <option value="regiao">Região do corpo (A-Z)</option>
                <option value="valor">Valor (maior primeiro)</option>
                <option value="cliente">Cliente (A-Z)</option>
              </select>
            )}
          </div>

          {view === "lista" ? (
        <div className="card overflow-hidden !p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] border-collapse min-w-[760px]">
              <thead>
                <tr>
                  {["Cliente", "WhatsApp", "Região", "Valor final", "Status", "Criado em", ""].map((h) => (
                    <th key={h} className="text-left text-[11px] uppercase tracking-wide text-muted2 px-4 py-3 border-b border-[#202028] font-semibold whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((b) => (
                  <tr key={b.id} className="hover:bg-white/[0.018]">
                    <td className="px-4 py-3.5 border-b border-[#202028] font-semibold whitespace-nowrap">{b.client?.name || "—"}</td>
                    <td className="px-4 py-3.5 border-b border-[#202028] whitespace-nowrap">{b.client?.whatsapp || "—"}</td>
                    <td className="px-4 py-3.5 border-b border-[#202028] whitespace-nowrap">{b.regiao}</td>
                    <td className="px-4 py-3.5 border-b border-[#202028] font-bold whitespace-nowrap">{fmtMoney(b.valor_final)}</td>
                    <td className="px-4 py-3.5 border-b border-[#202028] whitespace-nowrap"><StatusBadge status={b.status} /></td>
                    <td className="px-4 py-3.5 border-b border-[#202028] whitespace-nowrap">{fmtDate(b.created_at)}</td>
                    <td className="px-4 py-3.5 border-b border-[#202028] whitespace-nowrap">
                      <Link href={`/orcamentos/${b.id}`} className="btn py-1.5 px-2.5 text-[12.5px]">Ver</Link>
                    </td>
                  </tr>
                ))}
                {!loading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-16 text-muted">
                      Nenhum orçamento encontrado com esses filtros.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 sm:mx-0 sm:px-0 snap-x snap-mandatory sm:snap-none">
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
                className="w-[82vw] sm:w-[280px] shrink-0 snap-start bg-surface/60 border border-[#202028] rounded-[14px] p-3.5"
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
        </>
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
