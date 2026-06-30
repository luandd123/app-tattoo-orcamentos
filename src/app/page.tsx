"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Shell from "@/components/Shell";
import StatusBadge from "@/components/StatusBadge";
import { supabaseBrowser } from "@/lib/supabaseClient";
import { Budget, STATUS_LIST } from "@/lib/types";

function fmtMoney(v: number) {
  return (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR");
}

export default function DashboardPage() {
  const supabase = supabaseBrowser();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("budgets")
        .select("*, client:clients(*)")
        .order("created_at", { ascending: false });
      setBudgets((data as any) || []);
      setLoading(false);
    })();
  }, []);

  const counts: Record<string, number> = {};
  STATUS_LIST.forEach((s) => (counts[s.key] = 0));
  budgets.forEach((b) => (counts[b.status] = (counts[b.status] || 0) + 1));

  return (
    <Shell>
      <div className="flex items-center justify-between flex-wrap gap-3.5 mb-6">
        <div>
          <div className="text-2xl font-semibold">Visão geral</div>
          <div className="text-muted text-[13.5px] mt-1">
            {loading ? "carregando…" : `${budgets.length} orçamento${budgets.length === 1 ? "" : "s"} no total`}
          </div>
        </div>
        <Link href="/orcamentos/novo" className="btn btn-primary">
          + Novo orçamento
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {STATUS_LIST.map((s) => (
          <Link
            key={s.key}
            href={`/orcamentos?status=${s.key}`}
            className="card p-5 hover:-translate-y-0.5 transition relative overflow-hidden"
          >
            <span
              className="absolute top-4.5 right-4.5 w-2.5 h-2.5 rounded-full"
              style={{ background: s.color }}
            />
            <div className="font-display text-3xl font-semibold" style={{ color: s.color }}>
              {counts[s.key]}
            </div>
            <div className="text-muted text-[12.5px] mt-2 font-medium">{s.label}</div>
          </Link>
        ))}
      </div>

      <div className="flex items-center gap-3.5 mt-9 mb-4 text-muted2">
        <span className="font-display italic text-[13px]">recentes</span>
        <div className="flex-1 h-px bg-[#202028]" />
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] border-collapse">
            <thead>
              <tr>
                {["Cliente", "Região", "Valor final", "Status", "Criado em", ""].map((h) => (
                  <th key={h} className="text-left text-[11px] uppercase tracking-wide text-muted2 px-3.5 py-2.5 border-b border-[#202028] font-semibold whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {budgets.slice(0, 6).map((b) => (
                <tr key={b.id} className="hover:bg-white/[0.018]">
                  <td className="px-3.5 py-3 border-b border-[#202028] font-semibold whitespace-nowrap">{b.client?.name || "—"}</td>
                  <td className="px-3.5 py-3 border-b border-[#202028] whitespace-nowrap">{b.regiao}</td>
                  <td className="px-3.5 py-3 border-b border-[#202028] font-bold whitespace-nowrap">{fmtMoney(b.valor_final)}</td>
                  <td className="px-3.5 py-3 border-b border-[#202028] whitespace-nowrap"><StatusBadge status={b.status} /></td>
                  <td className="px-3.5 py-3 border-b border-[#202028] whitespace-nowrap">{fmtDate(b.created_at)}</td>
                  <td className="px-3.5 py-3 border-b border-[#202028] whitespace-nowrap">
                    <Link href={`/orcamentos/${b.id}`} className="btn py-1.5 px-2.5 text-[12.5px]">Ver</Link>
                  </td>
                </tr>
              ))}
              {!loading && budgets.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-16 text-muted">
                    Nenhum orçamento por aqui ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  );
}
