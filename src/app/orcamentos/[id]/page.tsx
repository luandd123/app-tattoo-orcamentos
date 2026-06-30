"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Shell from "@/components/Shell";
import StatusBadge from "@/components/StatusBadge";
import { supabaseBrowser } from "@/lib/supabaseClient";
import { calcAjusteManual } from "@/lib/calc";
import { Budget, BudgetStatus, ManualAdjustment, STATUS_LIST } from "@/lib/types";

function fmtMoney(v: number) {
  return (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR");
}

function buildWhatsappMessage(b: Budget) {
  const primeiroNome = (b.client?.name || "").trim().split(" ")[0] || "tudo bem";
  const sessoesTxt = b.num_sessoes > 1 ? `${b.num_sessoes} sessões` : "1 sessão";
  return `Olá, ${primeiroNome}! Tudo bem? 🖤

Aqui está o orçamento da sua tattoo:

📍 Região: ${b.regiao}
🎨 Cor: ${b.cor || "-"}
✏️ Ideia: ${b.ideia || "-"}

💰 Valor: ${fmtMoney(b.valor_final)}
⏱️ Tempo estimado: ${b.tempo_estimado}h (${sessoesTxt})
🔒 Sinal para reservar a data: ${fmtMoney(b.valor_sinal)}

O sinal garante o seu horário na agenda e é abatido do valor total no dia da sessão. Assim que confirmar, já te passo as datas disponíveis! ✨

Qualquer dúvida, é só chamar por aqui. Bora marcar essa arte? 🤍`;
}

export default function OrcamentoDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = supabaseBrowser();

  const [budget, setBudget] = useState<Budget | null>(null);
  const [adjustments, setAdjustments] = useState<ManualAdjustment[]>([]);
  const [editValor, setEditValor] = useState<string>("");
  const [motivo, setMotivo] = useState("");
  const [showAdjustForm, setShowAdjustForm] = useState(false);

  async function load() {
    const { data } = await supabase.from("budgets").select("*, client:clients(*)").eq("id", id).single();
    setBudget(data as any);
    if (data) setEditValor(String(data.valor_final));
    const { data: adj } = await supabase
      .from("manual_adjustments")
      .select("*")
      .eq("budget_id", id)
      .order("adjusted_at", { ascending: false });
    setAdjustments((adj as any) || []);
  }

  useEffect(() => {
    if (id) load();
  }, [id]);

  if (!budget) {
    return (
      <Shell>
        <div className="text-muted">carregando…</div>
      </Shell>
    );
  }

  async function updateStatus(newStatus: BudgetStatus) {
    if (!budget) return;
    const oldStatus = budget.status;
    await supabase.from("budgets").update({ status: newStatus }).eq("id", budget.id);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase.from("status_history").insert({ budget_id: budget.id, old_status: oldStatus, new_status: newStatus, changed_by: user?.id });
    setBudget({ ...budget, status: newStatus });
  }

  async function saveAdjustment() {
    if (!budget) return;
    const novoValor = parseFloat(editValor);
    if (isNaN(novoValor)) return;
    const valorOriginal = budget.valor_sugerido;
    const result = calcAjusteManual(valorOriginal, novoValor);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    await supabase.from("budgets").update({ valor_final: novoValor, motivo_ajuste: motivo }).eq("id", budget.id);
    await supabase.from("manual_adjustments").insert({
      budget_id: budget.id,
      valor_original: result.valorOriginal,
      valor_ajustado: result.valorAjustado,
      diferenca_valor: result.diferencaValor,
      diferenca_percentual: result.diferencaPercentual,
      motivo,
      adjusted_by: user?.id,
    });

    setShowAdjustForm(false);
    setMotivo("");
    load();
  }

  const msg = buildWhatsappMessage(budget);

  return (
    <Shell>
      <div className="flex items-center justify-between flex-wrap gap-3.5 mb-6">
        <div>
          <div className="text-2xl font-semibold">{budget.client?.name}</div>
          <div className="text-muted text-[13.5px] mt-1">
            criado em {fmtDate(budget.created_at)} · atualizado {fmtDate(budget.updated_at)}
          </div>
        </div>
        <button className="btn" onClick={() => router.push("/orcamentos")}>← Voltar</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-4.5 items-start">
        <div className="flex flex-col gap-4">
          <div className="card p-5.5">
            <SectionTitle title="cliente" />
            <KV k="WhatsApp" v={budget.client?.whatsapp} />
            <KV k="Instagram" v={budget.client?.instagram} />
            <KV k="Cidade" v={budget.client?.cidade} />
            <KV k="Origem" v={budget.client?.origem} />

            <SectionTitle title="a tattoo" />
            <KV k="Ideia" v={budget.ideia} />
            <KV k="Estilo" v={budget.estilo} />
            <KV k="Região" v={budget.regiao} />
            <KV k="Tamanho" v={budget.tamanho} />
            <KV k="Cor" v={budget.cor} />
            <KV k="Complexidade" v={budget.complexidade} />
            <KV k="Tattoo antiga" v={budget.tattoo_antiga} />
            <KV k="Autoral" v={budget.autoral} />

            {budget.obs_internas && (
              <>
                <SectionTitle title="observações internas" />
                <div className="text-[13.5px] text-muted whitespace-pre-wrap">{budget.obs_internas}</div>
              </>
            )}
          </div>

          <div className="card p-5.5">
            <div className="flex items-center justify-between mb-3.5">
              <SectionTitle title="tabela de cálculo sugerido" noLine />
              <button className="btn btn-gold py-1.5 px-3 text-[12px]" onClick={() => setShowAdjustForm((v) => !v)}>
                Ajustar valor manualmente
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-[13px] mb-3">
              <Stat label="Valor base (tabela)" value={fmtMoney(budget.valor_base)} />
              <Stat label="Multiplicador" value={`${budget.multiplicador}×`} />
              <Stat label="Valor original sugerido" value={fmtMoney(budget.valor_sugerido)} />
              <Stat label="Valor final (atual)" value={fmtMoney(budget.valor_final)} highlight />
            </div>

            {showAdjustForm && (
              <div className="bg-surface2 border border-[#2b2b36] rounded-[11px] p-4 mb-3 flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[12.5px] font-semibold text-muted">Novo valor final (R$)</label>
                  <input type="number" value={editValor} onChange={(e) => setEditValor(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[12.5px] font-semibold text-muted">Motivo do ajuste (opcional)</label>
                  <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex: desconto fidelidade, negociação no local…" />
                </div>
                {!isNaN(parseFloat(editValor)) && (
                  <div className="text-[12.5px] text-muted">
                    Diferença: <b className="text-text">{fmtMoney(parseFloat(editValor) - budget.valor_sugerido)}</b>{" "}
                    ({(((parseFloat(editValor) - budget.valor_sugerido) / (budget.valor_sugerido || 1)) * 100).toFixed(1)}%)
                  </div>
                )}
                <button className="btn btn-primary" onClick={saveAdjustment}>Salvar ajuste</button>
              </div>
            )}

            {adjustments.length > 0 && (
              <div className="overflow-x-auto mt-2">
                <table className="w-full text-[12.5px] border-collapse">
                  <thead>
                    <tr>
                      {["Original", "Ajustado", "Diferença R$", "Diferença %", "Motivo", "Quando"].map((h) => (
                        <th key={h} className="text-left text-[10.5px] uppercase tracking-wide text-muted2 px-2.5 py-2 border-b border-[#202028] font-semibold whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {adjustments.map((a) => (
                      <tr key={a.id}>
                        <td className="px-2.5 py-2 border-b border-[#202028] whitespace-nowrap">{fmtMoney(a.valor_original)}</td>
                        <td className="px-2.5 py-2 border-b border-[#202028] whitespace-nowrap">{fmtMoney(a.valor_ajustado)}</td>
                        <td className={`px-2.5 py-2 border-b border-[#202028] whitespace-nowrap font-semibold ${a.diferenca_valor >= 0 ? "text-green-400" : "text-inkbright"}`}>{fmtMoney(a.diferenca_valor)}</td>
                        <td className="px-2.5 py-2 border-b border-[#202028] whitespace-nowrap">{a.diferenca_percentual}%</td>
                        <td className="px-2.5 py-2 border-b border-[#202028]">{a.motivo || "—"}</td>
                        <td className="px-2.5 py-2 border-b border-[#202028] whitespace-nowrap text-muted2">{fmtDate(a.adjusted_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="bg-gradient-to-br from-ink/15 to-gold/[0.06] border border-ink/25 rounded-[14px] p-6 text-center">
            <div className="text-[11.5px] uppercase tracking-wider text-gold font-semibold">Valor final</div>
            <div className="font-display text-4xl font-semibold mt-1.5">{fmtMoney(budget.valor_final)}</div>
            <div className="text-muted text-[12px] mt-1.5">
              {budget.tempo_estimado}h · {budget.num_sessoes} sessão(ões) · sinal {fmtMoney(budget.valor_sinal)}
            </div>
          </div>

          <div className="card p-5.5">
            <SectionTitle title="status" noLine />
            <select value={budget.status} onChange={(e) => updateStatus(e.target.value as BudgetStatus)} className="font-semibold mt-2">
              {STATUS_LIST.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </div>

          <div className="card p-5.5">
            <SectionTitle title="mensagem whatsapp" noLine />
            <div className="bg-surface2 border border-[#2b2b36] rounded-[11px] p-4 mt-2 text-[12.5px] leading-relaxed whitespace-pre-wrap font-mono text-[#d8d4cb]">
              {msg}
            </div>
            <button
              className="btn btn-gold w-full mt-3"
              onClick={() => {
                navigator.clipboard.writeText(msg);
                alert("Mensagem copiada!");
              }}
            >
              Copiar mensagem
            </button>
          </div>
        </div>
      </div>
    </Shell>
  );
}

function SectionTitle({ title, noLine }: { title: string; noLine?: boolean }) {
  return (
    <div className={`flex items-center gap-3 ${noLine ? "" : "mt-5 mb-3"} first:mt-0`}>
      <span className="font-display italic text-[13px] text-muted2">{title}</span>
      {!noLine && <div className="flex-1 h-px bg-[#202028]" />}
    </div>
  );
}
function KV({ k, v }: { k: string; v?: string | null }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 text-[13.5px] py-1.5 border-b border-dashed border-[#202028]">
      <span className="text-muted font-medium">{k}</span>
      <span>{v || "—"}</span>
    </div>
  );
}
function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="bg-surface2 border border-[#2b2b36] rounded-[10px] p-3">
      <div className="text-[11px] text-muted2">{label}</div>
      <div className={`font-semibold mt-1 ${highlight ? "text-gold text-[16px]" : "text-[14px]"}`}>{value}</div>
    </div>
  );
}
