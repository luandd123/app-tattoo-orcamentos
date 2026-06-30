"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Shell from "@/components/Shell";
import { supabaseBrowser } from "@/lib/supabaseClient";
import { calcBudget } from "@/lib/calc";
import { Complexidade, PriceRow, Settings } from "@/lib/types";

const ORIGENS = ["Instagram", "Indicação", "Cliente antigo", "Tráfego pago", "Outro"];
const ESTILOS = ["Geek / Anime", "Colorida", "Preto e cinza", "Fine line", "Cobertura", "Autoral", "Outro"];
const TAMANHOS_FALLBACK = ["Mão", "Antebraço externo", "Antebraço interno", "Bíceps", "Ombro"];
const AUTORAL_OPCOES = ["Sim", "Não", "Adaptar referência"];

function fmtMoney(v: number) {
  return (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function NovoOrcamentoPage() {
  const supabase = supabaseBrowser();
  const router = useRouter();

  const [priceTable, setPriceTable] = useState<PriceRow[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    nome: "", whatsapp: "", instagram: "", cidade: "", origem: "Instagram",
    ideia: "", estilo: "", regiao: "", tamanho: "", cor: "",
    complexidade: "media" as Complexidade,
    tattooAntiga: "Não", autoral: "Não",
    obsInternas: "", referencias: "",
  });

  useEffect(() => {
    (async () => {
      const { data: pt } = await supabase.from("price_table").select("*").order("regiao");
      const { data: st } = await supabase.from("settings").select("*").eq("id", 1).single();
      setPriceTable((pt as any) || []);
      setSettings(st as any);
      if (pt && pt.length) setForm((f) => ({ ...f, regiao: f.regiao || pt[0].regiao }));
    })();
  }, []);

  if (!settings) {
    return (
      <Shell>
        <div className="text-muted">carregando…</div>
      </Shell>
    );
  }

  const isCobertura = form.tattooAntiga === "Sim, e é cobertura" || form.estilo === "Cobertura";
  const calc = calcBudget(
    { regiao: form.regiao, complexidade: form.complexidade, isCobertura, autoral: form.autoral },
    priceTable,
    settings
  );

  async function handleSubmit() {
    if (!form.nome.trim()) {
      alert("Informe o nome do cliente");
      return;
    }
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: client, error: clientErr } = await supabase
      .from("clients")
      .insert({
        name: form.nome,
        whatsapp: form.whatsapp,
        instagram: form.instagram,
        cidade: form.cidade,
        origem: form.origem,
        created_by: user?.id,
      })
      .select()
      .single();

    if (clientErr || !client) {
      alert("Erro ao salvar cliente: " + clientErr?.message);
      setSaving(false);
      return;
    }

    const { data: budget, error: budgetErr } = await supabase
      .from("budgets")
      .insert({
        client_id: client.id,
        ideia: form.ideia,
        estilo: form.estilo,
        regiao: form.regiao,
        tamanho: form.tamanho || form.regiao,
        cor: form.cor,
        complexidade: form.complexidade,
        tattoo_antiga: form.tattooAntiga,
        autoral: form.autoral,
        valor_base: calc.valorBase,
        multiplicador: calc.multiplicador,
        valor_sugerido: calc.valorSugerido,
        valor_final: calc.valorSugerido,
        valor_sinal: calc.sinalSugerido,
        tempo_estimado: calc.tempoEstimado,
        num_sessoes: calc.sessoesSugeridas,
        obs_internas: form.obsInternas,
        referencias: form.referencias,
        status: "novo",
        created_by: user?.id,
      })
      .select()
      .single();

    setSaving(false);
    if (budgetErr || !budget) {
      alert("Erro ao salvar orçamento: " + budgetErr?.message);
      return;
    }
    router.push(`/orcamentos/${budget.id}`);
  }

  return (
    <Shell>
      <div className="flex items-center justify-between flex-wrap gap-3.5 mb-6">
        <div>
          <div className="text-2xl font-semibold">Novo orçamento</div>
          <div className="text-muted text-[13.5px] mt-1">o valor é calculado a partir da tabela de preços × complexidade</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-4.5 items-start">
        <div className="card p-5.5 flex flex-col gap-5">
          <Section title="cliente">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Nome do cliente">
                <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Nome completo" />
              </Field>
              <Field label="WhatsApp">
                <input value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} placeholder="(00) 00000-0000" />
              </Field>
              <Field label="Instagram">
                <input value={form.instagram} onChange={(e) => setForm({ ...form, instagram: e.target.value })} placeholder="@usuario" />
              </Field>
              <Field label="Cidade">
                <input value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} placeholder="Cidade" />
              </Field>
              <Field label="Origem do cliente" full>
                <Pills options={ORIGENS} value={form.origem} onChange={(v) => setForm({ ...form, origem: v })} />
              </Field>
            </div>
          </Section>

          <Section title="a tattoo">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Ideia da tattoo" full>
                <textarea value={form.ideia} onChange={(e) => setForm({ ...form, ideia: e.target.value })} placeholder="Descreva a ideia, contexto, referências…" />
              </Field>
              <Field label="Estilo" full>
                <Pills options={ESTILOS} value={form.estilo} onChange={(v) => setForm({ ...form, estilo: v })} />
              </Field>
              <Field label="Região / local do corpo (tabela de preços)">
                <select value={form.regiao} onChange={(e) => setForm({ ...form, regiao: e.target.value })}>
                  {(priceTable.length ? priceTable.map((p) => p.regiao) : TAMANHOS_FALLBACK).map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </Field>
              <Field label="Tamanho (texto livre, opcional)">
                <input value={form.tamanho} onChange={(e) => setForm({ ...form, tamanho: e.target.value })} placeholder="Ex: 15x10cm" />
              </Field>
              <Field label="Cor">
                <input value={form.cor} onChange={(e) => setForm({ ...form, cor: e.target.value })} placeholder="Ex: Preto e cinza, colorida…" />
              </Field>
              <Field label="Complexidade">
                <select value={form.complexidade} onChange={(e) => setForm({ ...form, complexidade: e.target.value as Complexidade })}>
                  <option value="baixa">Baixa (-15%)</option>
                  <option value="media">Média (valor base)</option>
                  <option value="alta">Alta (+20%)</option>
                </select>
              </Field>
              <Field label="Tattoo antiga no local?">
                <select value={form.tattooAntiga} onChange={(e) => setForm({ ...form, tattooAntiga: e.target.value })}>
                  <option>Não</option>
                  <option>Sim</option>
                  <option>Sim, e é cobertura</option>
                </select>
              </Field>
              <Field label="Precisa de criação / autoral?">
                <select value={form.autoral} onChange={(e) => setForm({ ...form, autoral: e.target.value })}>
                  {AUTORAL_OPCOES.map((o) => <option key={o}>{o}</option>)}
                </select>
              </Field>
            </div>
          </Section>

          <Section title="internos">
            <div className="grid grid-cols-1 gap-4">
              <Field label="Observações internas">
                <textarea value={form.obsInternas} onChange={(e) => setForm({ ...form, obsInternas: e.target.value })} placeholder="Só a equipe vê isso" />
              </Field>
              <Field label="Links de referências">
                <textarea value={form.referencias} onChange={(e) => setForm({ ...form, referencias: e.target.value })} placeholder="https://…" />
              </Field>
            </div>
          </Section>
        </div>

        <div className="flex flex-col gap-4">
          <div className="card p-5.5">
            <div className="flex items-center gap-3 mb-3.5">
              <span className="font-display italic text-[13px] text-muted2">cálculo sugerido</span>
              <div className="flex-1 h-px bg-[#202028]" />
            </div>
            <CalcLine label="Valor base (tabela)" value={fmtMoney(calc.valorBase)} />
            <CalcLine label="× complexidade" value={`${calc.multiplicador}`} />
            <CalcLine label="Taxa de criação" value={fmtMoney(calc.taxaCriacao)} />
            <CalcLine label="Adicional cobertura" value={fmtMoney(calc.adicionalCobertura)} />
            <div className="flex justify-between text-[15px] font-bold pt-2.5">
              <span>Valor sugerido</span>
              <span className="text-gold">{fmtMoney(calc.valorSugerido)}</span>
            </div>
            <div className="text-[11.5px] text-muted2 mt-2">
              {calc.tempoEstimado}h estimadas · {calc.sessoesSugeridas} sessão(ões) · sinal sugerido {fmtMoney(calc.sinalSugerido)}
            </div>
          </div>
          <button onClick={handleSubmit} disabled={saving} className="btn btn-primary w-full py-3.5">
            {saving ? "Salvando…" : "Criar orçamento"}
          </button>
        </div>
      </div>
    </Shell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-3.5">
        <span className="font-display italic text-[13px] text-muted2">{title}</span>
        <div className="flex-1 h-px bg-[#202028]" />
      </div>
      {children}
    </div>
  );
}
function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={`flex flex-col gap-1.5 ${full ? "md:col-span-2" : ""}`}>
      <label className="text-[12.5px] font-semibold text-muted">{label}</label>
      {children}
    </div>
  );
}
function Pills({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          type="button"
          key={o}
          onClick={() => onChange(o)}
          className={`px-3.5 py-2 rounded-full border text-[12.5px] font-medium transition ${
            value === o ? "bg-gradient-to-br from-ink to-[#7a1c2c] border-transparent text-white" : "bg-surface2 border-[#2b2b36] text-muted hover:text-text"
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}
function CalcLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-[12.5px] text-muted py-1.5 border-b border-dashed border-[#202028]">
      <span>{label}</span>
      <b className="text-text font-semibold">{value}</b>
    </div>
  );
}
