"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Shell from "@/components/Shell";
import StatusBadge from "@/components/StatusBadge";
import { supabaseBrowser } from "@/lib/supabaseClient";
import { getCurrentUserAndProfile } from "@/lib/profileUtils";
import { Budget, STATUS_LIST } from "@/lib/types";

function fmtMoney(v: number) { return (v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"}); }
function fmtDate(iso: string) { return new Date(iso).toLocaleDateString("pt-BR"); }

export default function DashboardPage() {
  const supabase = supabaseBrowser();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string|null>(null);

  useEffect(() => {
    (async () => {
      try {
        const result = await getCurrentUserAndProfile(supabase);
        if (!result.user) { setError("Sessão não encontrada."); return; }
        if (!result.profile) { setError(result.errorMessage || "Perfil não encontrado."); return; }

        // RLS já filtra por created_by = auth.uid()
        const { data, error: err } = await supabase
          .from("budgets")
          .select("*, client:clients(*)")
          .order("created_at", { ascending: false });
        if (err) throw err;
        setBudgets((data as any) || []);
      } catch (e: any) {
        console.error("dashboard:", e);
        setError(e?.message || "Não foi possível carregar o dashboard.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const counts: Record<string,number> = {};
  STATUS_LIST.forEach(s => counts[s.key] = 0);
  budgets.forEach(b => counts[b.status] = (counts[b.status]||0)+1);

  return (
    <Shell>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-7">
        <div>
          <div className="text-[26px] sm:text-2xl font-semibold">Visão geral</div>
          <div className="text-muted text-[13.5px] mt-1">
            {loading ? "carregando…" : `${budgets.length} orçamento${budgets.length===1?"":"s"} · seus dados`}
          </div>
        </div>
        <Link href="/orcamentos/novo" className="btn btn-primary w-full sm:w-auto justify-center">
          + Novo orçamento
        </Link>
      </div>

      {error && (
        <div className="card p-4 mb-5 border-ink/40 bg-ink/[0.07]">
          <div className="text-[13px] text-inkbright font-semibold mb-1">Erro</div>
          <div className="text-[12.5px] text-muted">{error}</div>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({length:8}).map((_,i)=>(
            <div key={i} className="card p-5 h-[112px] animate-pulse bg-surface2/40"/>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {STATUS_LIST.map(s => (
            <Link key={s.key} href={`/orcamentos?status=${s.key}`}
              className="card p-5 hover:-translate-y-0.5 transition flex flex-col justify-between min-h-[112px]">
              <div className="flex items-center justify-between">
                <div className="font-display text-3xl font-semibold" style={{color:s.color}}>{counts[s.key]}</div>
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{background:s.color}}/>
              </div>
              <div className="text-muted text-[12.5px] font-medium leading-snug">{s.label}</div>
            </Link>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3.5 mt-10 mb-4 text-muted2">
        <span className="font-display italic text-[13px]">recentes</span>
        <div className="flex-1 h-px bg-[#202028]"/>
      </div>

      <div className="card overflow-hidden !p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] border-collapse min-w-[640px]">
            <thead>
              <tr>{["Cliente","Região","Valor final","Status","Criado em",""].map(h=>(
                <th key={h} className="text-left text-[11px] uppercase tracking-wide text-muted2 px-4 py-3 border-b border-[#202028] font-semibold whitespace-nowrap">{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {budgets.slice(0,6).map(b=>(
                <tr key={b.id} className="hover:bg-white/[0.018]">
                  <td className="px-4 py-3.5 border-b border-[#202028] font-semibold whitespace-nowrap">{b.client?.name||"—"}</td>
                  <td className="px-4 py-3.5 border-b border-[#202028] whitespace-nowrap">{b.regiao}</td>
                  <td className="px-4 py-3.5 border-b border-[#202028] font-bold whitespace-nowrap">{fmtMoney(b.valor_final)}</td>
                  <td className="px-4 py-3.5 border-b border-[#202028] whitespace-nowrap"><StatusBadge status={b.status}/></td>
                  <td className="px-4 py-3.5 border-b border-[#202028] whitespace-nowrap">{fmtDate(b.created_at)}</td>
                  <td className="px-4 py-3.5 border-b border-[#202028] whitespace-nowrap">
                    <Link href={`/orcamentos/${b.id}`} className="btn py-1.5 px-2.5 text-[12.5px]">Ver</Link>
                  </td>
                </tr>
              ))}
              {!loading && budgets.length===0 && (
                <tr><td colSpan={6} className="text-center py-16 text-muted">
                  <div className="font-display italic text-[18px] text-muted2 mb-2">tela em branco</div>
                  <div className="mb-4">Nenhum orçamento por aqui ainda.</div>
                  <Link href="/orcamentos/novo" className="btn btn-primary">+ Novo orçamento</Link>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  );
}
