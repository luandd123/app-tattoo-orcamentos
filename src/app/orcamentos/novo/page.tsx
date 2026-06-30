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

const DEFAULT_SETTINGS: Settings = {
  id: 1,
  valor_minimo: 150,
  valor_hora: 180,
  sinal_percentual: 30,
  mult_complexidade_baixa: 0.85,
  mult_complexidade_media: 1.0,
  mult_complexidade_alta: 1.2,
  adicional_cobertura: 50,
  taxa_criacao_sim: 80,
  taxa_criacao_adaptar: 40,
  taxa_criacao_nao: 0,
};

export default function NovoOrcamentoPage() {
  const supabase = supabaseBrowser();
  const router = useRouter();

  const [priceTable, setPriceTable] = useState<PriceRow[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [settingsWarning, setSettingsWarning] = useState<string | null>(null);
  const [priceTableWarning, setPriceTableWarning] = useState<string | null>(null);

  const [form, setForm] = useState({
    nome: "", whatsapp: "", instagram: "", cidade: "", origem: "Instagram",
    ideia: "", estilo: "", regiao: "", tamanho: "", cor: "",
    complexidade: "media" as Complexidade,
    tattooAntiga: "Não", autoral: "Não",
    obsInternas: "", referencias: "",
  });

  async function load() {
    setLoading(true);
    setLoadError(null);
    setSettingsWarning(null);
    setPriceTableWarning(null);
    try {
      // price_table e settings são buscados em paralelo, mas cada um trata
      // seu próprio erro — uma falha não derruba a outra nem trava a página.
      const [priceResult, settingsResult] = await Promise.allSettled([
        supabase.from("price_table").select("*").order("regiao"),
        supabase.from("settings").select("*").eq("id", 1).maybeSingle(),
      ]);

      // ---- price_table ----
      if (priceResult.status === "fulfilled") {
        const { data: pt, error: ptError } = priceResult.value;
        if (ptError) {
          console.error("Erro ao carregar price_table:", ptError);
          setPriceTableWarning(readableErr(ptError, "Não foi possível carregar a tabela de preços."));
          setPriceTable([]);
        } else if (!pt || pt.length === 0) {
          setPriceTableWarning("Nenhuma região cadastrada na tabela de preços ainda. Cadastre os valores em Configurações para o cálculo automático funcionar.");
          setPriceTable([]);
        } else {
          setPriceTable(pt as any);
          setForm((f) => ({ ...f, regiao: f.regiao || (pt as any)[0].regiao }));
        }
      } else {
        console.error("Erro inesperado ao carregar price_table:", priceResult.reason);
        setPriceTableWarning(readableErr(priceResult.reason, "Não foi possível carregar a tabela de preços."));
      }

      // ---- settings ----
      if (settingsResult.status === "fulfilled") {
        const { data: st, error: stError } = settingsResult.value;
        if (stError) {
          console.error("Erro ao carregar settings:", stError);
          setSettingsWarning(readableErr(stError, "Não foi possível carregar as configurações. Usando valores padrão."));
          setSettings(DEFAULT_SETTINGS);
        } else if (!st) {
          setSettingsWarning("Nenhuma configuração encontrada (tabela settings vazia). Usando valores padrão até alguém salvar em Configurações.");
          setSettings(DEFAULT_SETTINGS);
        } else {
          setSettings(st as any);
        }
      } else {
        console.error("Erro inesperado ao carregar settings:", settingsResult.reason);
        setSettingsWarning(readableErr(settingsResult.reason, "Não foi possível carregar as configurações. Usando valores padrão."));
        setSettings(DEFAULT_SETTINGS);
      }
    } catch (err) {
      // rede caiu, supabaseBrowser() falhou, etc — qualquer coisa fora do
      // Promise.allSettled cai aqui.
      console.error("Erro inesperado ao carregar página de novo orçamento:", err);
      setLoadError(readableErr(err, "Não foi possível carregar a página. Tente novamente."));
      setSettings(DEFAULT_SETTINGS);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function readableErr(err: any, fallback: string): string {
    if (!err) return fallback;
    if (typeof err === "string") return err;
    if (err.message) return err.message;
    if (err.error_description) return err.error_description;
    try {
      const s = JSON.stringify(err);
      if (s && s !== "{}") return s;
    } catch {}
    return fallback;
  }

  if (loading) {
    return (
      <Shell>
        <div className="card p-10 text-center text-muted">Carregando formulário…</div>
      </Shell>
    );
  }

  if (loadError) {
    return (
      <Shell>
        <div className="card p-7 max-w-lg">
          <div className="text-[15px] font-semibold mb-2 text-inkbright">Erro ao carregar a página</div>
          <p className="text-muted text-[13.5px] leading-relaxed">{loadError}</p>
          <button className="btn mt-4" onClick={() => load()}>Tentar novamente</button>
        </div>
      </Shell>
    );
  }

  // settings sempre terá um valor aqui (real ou DEFAULT_SETTINGS) — a página
  // nunca fica travada esperando essa tabela.
  const effectiveSettings = settings || DEFAULT_SETTINGS;

  const isCobertura = form.tattooAntiga === "Sim, e é cobertura" || form.estilo === "Cobertura";
  const calc = calcBudget(
    { regiao: form.regiao, complexidade: form.complexidade, isCobertura, autoral: form.autoral },
    priceTable,
    effectiveSettings
  );

  async function handleSubmit() {
    if (!form.nome.trim()) {
      alert("Informe o nome do cliente");
      return;
    }
    setSaving(true);
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      const user = userData?.user;

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

      if (clientErr) throw clientErr;
      if (!client) throw new Error("Cliente não foi salvo.");

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

      if (budgetErr) throw budgetErr;
      if (!budget) throw new Error("Orçamento não foi salvo.");

      router.push(`/orcamentos/${budget.id}`);
    } catch (err) {
      console.error("Erro ao criar orçamento:", err);
      alert("Não foi possível criar o orçamento: " + readableErr(err, "erro desconhecido"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Shell>
      <div className="flex flex-col gap-1 mb-7">
        <div className="text-[26px] sm:text-2xl font-semibold">Novo orçamento</div>
        <div className="text-muted text-[13.5px]">o valor é calculado a partir da tabela de preços × complexidade</div>
      </div>

      {(priceTableWarning || settingsWarning) && (
        <div className="card p-4 mb-5 border-gold/40 bg-gold/[0.06] flex flex-col gap-2">
          {priceTableWarning && (
            <div className="text-[12.5px] text-gold">
              <b>Tabela de preços:</b> {priceTableWarning}
            </div>
          )}
          {settingsWarning && (
            <div className="text-[12.5px] text-gold">
              <b>Configurações:</b> {settingsWarning}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-5 items-start">
        <div className="card p-6 flex flex-col gap-5">
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
          <div className="card p-6">
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
