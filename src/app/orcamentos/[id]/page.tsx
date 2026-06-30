"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Shell from "@/components/Shell";
import StatusBadge from "@/components/StatusBadge";
import { supabaseBrowser } from "@/lib/supabaseClient";
import { readableError } from "@/lib/profileUtils";
import { calcAjusteManual } from "@/lib/calc";
import { Budget, BudgetStatus, ManualAdjustment, STATUS_LIST, AiSuggestion } from "@/lib/types";

function fmtMoney(v: number) { return (v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"}); }
function fmtDate(iso: string) { return new Date(iso).toLocaleString("pt-BR"); }

function buildWhatsappMessage(b: Budget) {
  const nome = (b.client?.name||"").split(" ")[0] || "tudo bem";
  return `Olá, ${nome}! Tudo bem? 🖤

Aqui está o orçamento da sua tattoo:

📍 Região: ${b.regiao}
🎨 Cor: ${b.cor||"-"}
✏️ Ideia: ${b.ideia||"-"}

💰 Valor: ${fmtMoney(b.valor_final)}
⏱️ Tempo estimado: ${b.tempo_estimado}h (${b.num_sessoes} sessão${b.num_sessoes>1?"ões":""})
🔒 Sinal: ${fmtMoney(b.valor_sinal)}

O sinal garante o seu horário e é abatido do valor total no dia. Assim que confirmar, te passo as datas disponíveis! ✨

Qualquer dúvida, é só chamar. Bora marcar essa arte? 🤍`;
}

export default function OrcamentoDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = supabaseBrowser();

  const [budget, setBudget]           = useState<Budget|null>(null);
  const [adjustments, setAdjustments] = useState<ManualAdjustment[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string|null>(null);
  const [editValor, setEditValor]     = useState("");
  const [motivo, setMotivo]           = useState("");
  const [showAdjust, setShowAdjust]   = useState(false);

  // Assistente IA
  const [clientMsg, setClientMsg]         = useState("");
  const [aiSuggestion, setAiSuggestion]   = useState<string|null>(null);
  const [aiLoading, setAiLoading]         = useState(false);
  const [aiError, setAiError]             = useState<string|null>(null);
  const [aiHistory, setAiHistory]         = useState<AiSuggestion[]>([]);
  const aiRef = useRef<HTMLDivElement>(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      const { data: b, error: bErr } = await supabase
        .from("budgets").select("*, client:clients(*)")
        .eq("id", id).maybeSingle();
      if (bErr) throw bErr;
      if (!b) { setError("Orçamento não encontrado ou sem permissão."); return; }
      setBudget(b as any);
      setEditValor(String((b as any).valor_final));

      const [adjRes, aiRes] = await Promise.allSettled([
        supabase.from("manual_adjustments").select("*").eq("budget_id", id).order("adjusted_at",{ascending:false}),
        supabase.from("ai_suggestions").select("*").eq("budget_id", id).order("created_at",{ascending:false}).limit(10),
      ]);
      if (adjRes.status==="fulfilled" && adjRes.value.data) setAdjustments(adjRes.value.data as any);
      if (aiRes.status==="fulfilled"  && aiRes.value.data)  setAiHistory(aiRes.value.data as any);
    } catch (e: any) {
      console.error("detalhe/load:", e);
      setError(readableError(e,"Erro ao carregar orçamento."));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { if (id) load(); }, [id]);

  async function updateStatus(newStatus: BudgetStatus) {
    if (!budget) return;
    const old = budget.status;
    setBudget({...budget, status: newStatus});
    try {
      const { error: e } = await supabase.from("budgets").update({status:newStatus}).eq("id",budget.id);
      if (e) throw e;
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("status_history").insert({budget_id:budget.id,old_status:old,new_status:newStatus,changed_by:user?.id});
    } catch (e: any) {
      setBudget({...budget,status:old});
      alert("Erro ao atualizar status: " + readableError(e,"desconhecido"));
    }
  }

  async function saveAdjustment() {
    if (!budget) return;
    const novo = parseFloat(editValor);
    if (isNaN(novo)) return;
    const r = calcAjusteManual(budget.valor_sugerido, novo);
    try {
      const { data:{user} } = await supabase.auth.getUser();
      await supabase.from("budgets").update({valor_final:novo,motivo_ajuste:motivo}).eq("id",budget.id);
      await supabase.from("manual_adjustments").insert({
        budget_id:budget.id, valor_original:r.valorOriginal, valor_ajustado:r.valorAjustado,
        diferenca_valor:r.diferencaValor, diferenca_percentual:r.diferencaPercentual,
        motivo, adjusted_by:user?.id
      });
      setShowAdjust(false); setMotivo(""); load();
    } catch (e: any) { alert("Erro ao salvar ajuste: " + readableError(e,"desconhecido")); }
  }

  async function generateAI() {
    if (!clientMsg.trim()) { setAiError("Cole a mensagem do cliente antes de gerar."); return; }
    setAiLoading(true); setAiError(null); setAiSuggestion(null);
    try {
      const res = await fetch("/api/ai/atendimento", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ budget_id: id, client_message: clientMsg }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Erro ${res.status}`);
      setAiSuggestion(json.suggestion);
      setTimeout(()=>aiRef.current?.scrollIntoView({behavior:"smooth",block:"nearest"}),100);
    } catch (e: any) {
      console.error("generateAI:", e);
      setAiError(e.message || "Erro ao gerar sugestão. Tente novamente.");
    } finally {
      setAiLoading(false);
    }
  }

  async function saveToHistory() {
    if (!aiSuggestion || !clientMsg) return;
    try {
      const { data:{user} } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from("ai_suggestions").insert({
        user_id:user.id, budget_id:id,
        client_message:clientMsg, ai_response:aiSuggestion,
      });
      load(); // atualiza histórico
      alert("Salvo no histórico ✓");
    } catch (e: any) { alert("Erro ao salvar: " + readableError(e,"desconhecido")); }
  }

  function copyText(txt: string) {
    navigator.clipboard.writeText(txt)
      .then(()=>alert("Copiado! ✓"))
      .catch(()=>{
        const ta = document.createElement("textarea"); ta.value=txt;
        document.body.appendChild(ta); ta.select(); document.execCommand("copy");
        ta.remove(); alert("Copiado! ✓");
      });
  }

  if (loading) return <Shell><div className="card p-10 text-center text-muted">Carregando orçamento…</div></Shell>;
  if (error || !budget) return (
    <Shell>
      <div className="card p-7 max-w-lg">
        <div className="text-[15px] font-semibold mb-2 text-inkbright">{error||"Orçamento não encontrado."}</div>
        <div className="flex gap-2.5 mt-4">
          <button className="btn" onClick={load}>Tentar novamente</button>
          <button className="btn btn-primary" onClick={()=>router.push("/orcamentos")}>← Voltar</button>
        </div>
      </div>
    </Shell>
  );

  const msg = buildWhatsappMessage(budget);

  return (
    <Shell>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-7">
        <div>
          <div className="text-[24px] sm:text-2xl font-semibold break-words">{budget.client?.name}</div>
          <div className="text-muted text-[13.5px] mt-1">criado {fmtDate(budget.created_at)}</div>
        </div>
        <button className="btn w-full sm:w-auto justify-center" onClick={()=>router.push("/orcamentos")}>← Voltar</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-5 items-start">
        {/* Coluna esquerda */}
        <div className="flex flex-col gap-5">
          {/* Dados */}
          <div className="card p-6">
            <ST title="cliente"/>
            <KV k="WhatsApp"  v={budget.client?.whatsapp}/>
            <KV k="Instagram" v={budget.client?.instagram}/>
            <KV k="Cidade"    v={budget.client?.cidade}/>
            <KV k="Origem"    v={budget.client?.origem}/>
            <ST title="a tattoo"/>
            <KV k="Ideia"       v={budget.ideia}/>
            <KV k="Estilo"      v={budget.estilo}/>
            <KV k="Região"      v={budget.regiao}/>
            <KV k="Tamanho"     v={budget.tamanho}/>
            <KV k="Cor"         v={budget.cor}/>
            <KV k="Complexidade" v={budget.complexidade}/>
            <KV k="Tattoo antiga" v={budget.tattoo_antiga}/>
            <KV k="Autoral"     v={budget.autoral}/>
            {budget.obs_internas && <><ST title="observações internas"/><div className="text-[13.5px] text-muted whitespace-pre-wrap">{budget.obs_internas}</div></>}
          </div>

          {/* Cálculo / Ajuste manual */}
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <ST title="cálculo" noLine/>
              <button className="btn btn-gold py-1.5 px-3 text-[12px]" onClick={()=>setShowAdjust(v=>!v)}>
                Ajustar valor
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-[13px] mb-3">
              <Stat label="Valor base" value={fmtMoney(budget.valor_base)}/>
              <Stat label="Multiplicador" value={`${budget.multiplicador}×`}/>
              <Stat label="Valor original sugerido" value={fmtMoney(budget.valor_sugerido)}/>
              <Stat label="Valor final atual" value={fmtMoney(budget.valor_final)} highlight/>
            </div>

            {showAdjust && (
              <div className="bg-surface2 border border-[#2b2b36] rounded-[11px] p-4 mt-3 flex flex-col gap-3">
                <Field label="Novo valor final (R$)">
                  <input type="number" value={editValor} onChange={e=>setEditValor(e.target.value)}/>
                </Field>
                <Field label="Motivo do ajuste">
                  <textarea value={motivo} onChange={e=>setMotivo(e.target.value)} placeholder="Ex: desconto fidelidade…"/>
                </Field>
                {!isNaN(parseFloat(editValor)) && (
                  <div className="text-[12.5px] text-muted">
                    Diferença: <b className="text-text">{fmtMoney(parseFloat(editValor)-budget.valor_sugerido)}</b>{" "}
                    ({(((parseFloat(editValor)-budget.valor_sugerido)/(budget.valor_sugerido||1))*100).toFixed(1)}%)
                  </div>
                )}
                <button className="btn btn-primary" onClick={saveAdjustment}>Salvar ajuste</button>
              </div>
            )}

            {adjustments.length > 0 && (
              <div className="overflow-x-auto mt-3 -mx-2 px-2">
                <table className="w-full text-[12.5px] border-collapse min-w-[520px]">
                  <thead><tr>
                    {["Original","Ajustado","Dif. R$","Dif. %","Motivo","Quando"].map(h=>(
                      <th key={h} className="text-left text-[10.5px] uppercase tracking-wide text-muted2 px-2.5 py-2 border-b border-[#202028] font-semibold whitespace-nowrap">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>{adjustments.map(a=>(
                    <tr key={a.id}>
                      <td className="px-2.5 py-2 border-b border-[#202028] whitespace-nowrap">{fmtMoney(a.valor_original)}</td>
                      <td className="px-2.5 py-2 border-b border-[#202028] whitespace-nowrap">{fmtMoney(a.valor_ajustado)}</td>
                      <td className={`px-2.5 py-2 border-b border-[#202028] whitespace-nowrap font-semibold ${a.diferenca_valor>=0?"text-green-400":"text-inkbright"}`}>{fmtMoney(a.diferenca_valor)}</td>
                      <td className="px-2.5 py-2 border-b border-[#202028] whitespace-nowrap">{a.diferenca_percentual}%</td>
                      <td className="px-2.5 py-2 border-b border-[#202028]">{a.motivo||"—"}</td>
                      <td className="px-2.5 py-2 border-b border-[#202028] whitespace-nowrap text-muted2">{fmtDate(a.adjusted_at)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>

          {/* ============================================================ 
              ASSISTENTE DE ATENDIMENTO COM IA
              ============================================================ */}
          <div className="card p-6">
            <ST title="assistente de atendimento" noLine/>
            <p className="text-muted text-[13px] mb-4 mt-1">
              Cole a mensagem que o cliente enviou. A IA gera uma resposta pronta para WhatsApp seguindo o Método A.P.P.L.E.
            </p>

            <Field label="Mensagem do cliente">
              <textarea
                value={clientMsg}
                onChange={e=>setClientMsg(e.target.value)}
                placeholder="Cole aqui a mensagem que o cliente enviou no WhatsApp…"
                className="min-h-[100px]"
              />
            </Field>

            <button
              onClick={generateAI}
              disabled={aiLoading || !clientMsg.trim()}
              className="btn btn-primary w-full mt-3 py-3"
            >
              {aiLoading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>
                  Gerando sugestão…
                </span>
              ) : "✨ Gerar sugestão"}
            </button>

            {aiError && (
              <div className="mt-3 p-3 bg-ink/10 border border-ink/30 rounded-lg text-[12.5px] text-inkbright">{aiError}</div>
            )}

            {aiSuggestion && (
              <div className="mt-4" ref={aiRef}>
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                  <span className="text-[12.5px] font-semibold text-gold">Sugestão gerada</span>
                  <div className="flex gap-2">
                    <button className="btn py-1.5 px-3 text-[12px]" onClick={()=>copyText(aiSuggestion)}>
                      Copiar resposta
                    </button>
                    <button className="btn btn-gold py-1.5 px-3 text-[12px]" onClick={saveToHistory}>
                      Salvar no histórico
                    </button>
                  </div>
                </div>
                <div className="bg-surface2 border border-[#2b2b36] rounded-[11px] p-4 text-[13px] leading-relaxed whitespace-pre-wrap font-mono text-[#d8d4cb]">
                  {aiSuggestion}
                </div>
              </div>
            )}

            {/* Histórico de sugestões salvas */}
            {aiHistory.length > 0 && (
              <div className="mt-6">
                <div className="flex items-center gap-3 mb-3">
                  <span className="font-display italic text-[13px] text-muted2">histórico de sugestões</span>
                  <div className="flex-1 h-px bg-[#202028]"/>
                </div>
                <div className="flex flex-col gap-3">
                  {aiHistory.map(h=>(
                    <div key={h.id} className="bg-surface3/60 border border-[#202028] rounded-[11px] p-4">
                      <div className="text-[11px] text-muted2 mb-2">{fmtDate(h.created_at)}</div>
                      <div className="text-[12px] text-muted mb-2 italic">→ "{h.client_message.slice(0,120)}{h.client_message.length>120?"…":""}"</div>
                      <div className="text-[12.5px] text-text whitespace-pre-wrap leading-relaxed">{h.ai_response}</div>
                      <button className="btn py-1 px-2.5 text-[11.5px] mt-2" onClick={()=>copyText(h.ai_response)}>
                        Copiar
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Coluna direita */}
        <div className="flex flex-col gap-5">
          <div className="bg-gradient-to-br from-ink/15 to-gold/[0.06] border border-ink/25 rounded-[14px] p-6 text-center">
            <div className="text-[11.5px] uppercase tracking-wider text-gold font-semibold">Valor final</div>
            <div className="font-display text-4xl font-semibold mt-1.5">{fmtMoney(budget.valor_final)}</div>
            <div className="text-muted text-[12px] mt-1.5">
              {budget.tempo_estimado}h · {budget.num_sessoes} sessão{budget.num_sessoes>1?"ões":""} · sinal {fmtMoney(budget.valor_sinal)}
            </div>
          </div>

          <div className="card p-6">
            <ST title="status" noLine/>
            <select value={budget.status} onChange={e=>updateStatus(e.target.value as BudgetStatus)} className="font-semibold mt-2">
              {STATUS_LIST.map(s=><option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>

          <div className="card p-6">
            <ST title="mensagem whatsapp" noLine/>
            <div className="bg-surface2 border border-[#2b2b36] rounded-[11px] p-4 mt-2 text-[12.5px] leading-relaxed whitespace-pre-wrap font-mono text-[#d8d4cb]">
              {msg}
            </div>
            <button className="btn btn-gold w-full mt-3" onClick={()=>copyText(msg)}>
              Copiar mensagem
            </button>
          </div>
        </div>
      </div>
    </Shell>
  );
}

function ST({title,noLine}:{title:string;noLine?:boolean}){
  return <div className={`flex items-center gap-3 ${noLine?"":"mt-5 mb-3"}`}>
    <span className="font-display italic text-[13px] text-muted2">{title}</span>
    {!noLine&&<div className="flex-1 h-px bg-[#202028]"/>}
  </div>;
}
function KV({k,v}:{k:string;v?:string|null}){
  return <div className="grid grid-cols-[140px_1fr] gap-3 text-[13.5px] py-1.5 border-b border-dashed border-[#202028]">
    <span className="text-muted font-medium">{k}</span><span>{v||"—"}</span>
  </div>;
}
function Stat({label,value,highlight}:{label:string;value:string;highlight?:boolean}){
  return <div className="bg-surface2 border border-[#2b2b36] rounded-[10px] p-3">
    <div className="text-[11px] text-muted2">{label}</div>
    <div className={`font-semibold mt-1 ${highlight?"text-gold text-[16px]":"text-[14px]"}`}>{value}</div>
  </div>;
}
function Field({label,children}:{label:string;children:React.ReactNode}){
  return <div className="flex flex-col gap-1.5">
    <label className="text-[12.5px] font-semibold text-muted">{label}</label>
    {children}
  </div>;
}
