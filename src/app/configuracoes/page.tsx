"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { supabaseBrowser } from "@/lib/supabaseClient";
import { useProfile } from "@/lib/useProfile";
import { PriceRow, Settings } from "@/lib/types";

export default function ConfiguracoesPage() {
  const supabase = supabaseBrowser();
  const { isAdmin, loading: profileLoading } = useProfile();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [priceTable, setPriceTable] = useState<PriceRow[]>([]);
  const [saving, setSaving] = useState(false);

  async function load() {
    const { data: st } = await supabase.from("settings").select("*").eq("id", 1).single();
    const { data: pt } = await supabase.from("price_table").select("*").order("regiao");
    setSettings(st as any);
    setPriceTable((pt as any) || []);
  }
  useEffect(() => {
    load();
  }, []);

  async function saveSettings() {
    if (!settings) return;
    setSaving(true);
    const { id, ...rest } = settings;
    await supabase.from("settings").update(rest).eq("id", 1);
    setSaving(false);
    alert("Configurações salvas!");
  }

  async function savePrice(row: PriceRow) {
    await supabase.from("price_table").update({ valor_base: row.valor_base, tempo_base_horas: row.tempo_base_horas }).eq("id", row.id);
  }

  if (profileLoading) {
    return (
      <Shell>
        <div className="text-muted">carregando…</div>
      </Shell>
    );
  }
  if (!isAdmin) {
    return (
      <Shell>
        <div className="card p-6 text-muted">Apenas administradores podem acessar as configurações.</div>
      </Shell>
    );
  }
  if (!settings) return <Shell><div className="text-muted">carregando…</div></Shell>;

  return (
    <Shell>
      <div className="flex items-center justify-between flex-wrap gap-3.5 mb-6">
        <div>
          <div className="text-2xl font-semibold">Configurações</div>
          <div className="text-muted text-[13.5px] mt-1">ajuste os parâmetros usados no cálculo de orçamento</div>
        </div>
        <button onClick={saveSettings} disabled={saving} className="btn btn-primary">
          {saving ? "Salvando…" : "Salvar configurações"}
        </button>
      </div>

      <div className="card p-5.5 mb-5">
        <SectionTitle title="valores base" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <NumField label="Valor mínimo (R$)" value={settings.valor_minimo} onChange={(v) => setSettings({ ...settings, valor_minimo: v })} />
          <NumField label="Valor por hora (R$)" value={settings.valor_hora} onChange={(v) => setSettings({ ...settings, valor_hora: v })} />
          <NumField label="Sinal padrão (%)" value={settings.sinal_percentual} onChange={(v) => setSettings({ ...settings, sinal_percentual: v })} />
        </div>

        <SectionTitle title="multiplicador de complexidade" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <NumField label="Baixa" step={0.05} value={settings.mult_complexidade_baixa} onChange={(v) => setSettings({ ...settings, mult_complexidade_baixa: v })} />
          <NumField label="Média" step={0.05} value={settings.mult_complexidade_media} onChange={(v) => setSettings({ ...settings, mult_complexidade_media: v })} />
          <NumField label="Alta" step={0.05} value={settings.mult_complexidade_alta} onChange={(v) => setSettings({ ...settings, mult_complexidade_alta: v })} />
        </div>

        <SectionTitle title="cobertura e criação" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <NumField label="Adicional de cobertura (R$)" value={settings.adicional_cobertura} onChange={(v) => setSettings({ ...settings, adicional_cobertura: v })} />
          <NumField label="Taxa criação — Sim (R$)" value={settings.taxa_criacao_sim} onChange={(v) => setSettings({ ...settings, taxa_criacao_sim: v })} />
          <NumField label="Taxa criação — Adaptar (R$)" value={settings.taxa_criacao_adaptar} onChange={(v) => setSettings({ ...settings, taxa_criacao_adaptar: v })} />
        </div>
      </div>

      <div className="card p-5.5">
        <SectionTitle title="tabela de preços base por região" />
        <p className="text-muted text-[12.5px] mb-3">
          Estes são os valores médios (complexidade 1×). O valor final = valor base × multiplicador de complexidade.
        </p>
        <div className="flex flex-col gap-2">
          {priceTable.map((row, idx) => (
            <div key={row.id} className="grid grid-cols-[1fr_140px_120px] gap-3 items-center bg-surface2 border border-[#2b2b36] rounded-[10px] p-2.5">
              <span className="text-[13px] font-medium px-1">{row.regiao}</span>
              <input
                type="number"
                value={row.valor_base}
                onChange={(e) => {
                  const list = [...priceTable];
                  list[idx] = { ...row, valor_base: parseFloat(e.target.value) || 0 };
                  setPriceTable(list);
                }}
                onBlur={() => savePrice(priceTable[idx])}
              />
              <input
                type="number"
                step={0.25}
                title="tempo base (h)"
                value={row.tempo_base_horas}
                onChange={(e) => {
                  const list = [...priceTable];
                  list[idx] = { ...row, tempo_base_horas: parseFloat(e.target.value) || 0 };
                  setPriceTable(list);
                }}
                onBlur={() => savePrice(priceTable[idx])}
              />
            </div>
          ))}
        </div>
      </div>
    </Shell>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3 mt-5 mb-3.5 first:mt-0">
      <span className="font-display italic text-[13px] text-muted2">{title}</span>
      <div className="flex-1 h-px bg-[#202028]" />
    </div>
  );
}
function NumField({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[12.5px] font-semibold text-muted">{label}</label>
      <input type="number" step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value) || 0)} />
    </div>
  );
}
