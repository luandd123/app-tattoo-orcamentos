"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { supabaseBrowser } from "@/lib/supabaseClient";
import { getCurrentUserAndProfile } from "@/lib/profileUtils";
import { fetchUserData } from "@/lib/userDataService";
import { readableError } from "@/lib/profileUtils";
import { UserSettings, UserPriceRow, AiPlaybook } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/calc";

function readErr(e: any, fb: string) { return readableError(e, fb); }

export default function ConfiguracoesPage() {
  const supabase = supabaseBrowser();
  const [userId, setUserId]       = useState("");
  const [settings, setSettings]   = useState<UserSettings>({ ...DEFAULT_SETTINGS });
  const [priceTable, setPriceTable] = useState<UserPriceRow[]>([]);
  const [playbook, setPlaybook]   = useState<AiPlaybook|null>(null);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState<string|null>(null);
  const [tab, setTab]             = useState<"settings"|"preco"|"playbook">("settings");

  async function load() {
    setLoading(true); setError(null);
    try {
      const { user, profile, errorMessage } = await getCurrentUserAndProfile(supabase);
      if (!user || !profile) { setError(errorMessage||"Sessão inválida."); return; }
      setUserId(user.id);

      const { settings: s, priceTable: pt } = await fetchUserData(supabase, user.id);
      setSettings(s); setPriceTable(pt);

      const { data: pbs } = await supabase.from("ai_playbooks").select("*").eq("user_id",user.id).eq("active",true).limit(1);
      setPlaybook(pbs?.[0] || null);
    } catch (e: any) {
      console.error("config/load:", e);
      setError(readErr(e,"Erro ao carregar configurações."));
    } finally { setLoading(false); }
  }

  useEffect(()=>{ load(); },[]);

  async function saveSettings() {
    setSaving(true);
    try {
      const { id: _id, user_id: _uid, created_at: _ca, updated_at: _ua, ...rest } = settings as any;
      const { error: e } = await supabase.from("user_settings").update(rest).eq("user_id",userId);
      if (e) throw e;
      alert("Configurações salvas ✓");
    } catch (e: any) { alert(readErr(e,"Erro ao salvar configurações.")); }
    finally { setSaving(false); }
  }

  async function savePriceRow(row: UserPriceRow) {
    await supabase.from("user_price_table")
      .update({valor_base:row.valor_base, tempo_base_horas:row.tempo_base_horas})
      .eq("id",row.id)
      .catch(e=>console.error("savePriceRow:",e));
  }

  async function addPriceRow() {
    const regiao = prompt("Nome da nova região:");
    if (!regiao?.trim()) return;
    const { data, error: e } = await supabase.from("user_price_table")
      .insert({user_id:userId, regiao:regiao.trim(), valor_base:0, tempo_base_horas:2})
      .select().single();
    if (e) { alert(readErr(e,"Erro ao adicionar região.")); return; }
    setPriceTable(t=>[...t, data as UserPriceRow]);
  }

  async function deletePriceRow(id: string) {
    if (!confirm("Remover esta região?")) return;
    await supabase.from("user_price_table").delete().eq("id",id);
    setPriceTable(t=>t.filter(r=>r.id!==id));
  }

  async function savePlaybook() {
    setSaving(true);
    try {
      if (playbook?.id) {
        const { error: e } = await supabase.from("ai_playbooks")
          .update({title:playbook.title, content:playbook.content}).eq("id",playbook.id);
        if (e) throw e;
      } else {
        // desativa todos e insere novo
        await supabase.from("ai_playbooks").update({active:false}).eq("user_id",userId);
        const { data, error: e } = await supabase.from("ai_playbooks")
          .insert({user_id:userId, title:playbook?.title||"Meu playbook", content:playbook?.content||"", active:true})
          .select().single();
        if (e) throw e;
        setPlaybook(data as AiPlaybook);
      }
      alert("Playbook salvo ✓");
    } catch (e: any) { alert(readErr(e,"Erro ao salvar playbook.")); }
    finally { setSaving(false); }
  }

  if (loading) return <Shell><div className="card p-10 text-center text-muted">Carregando configurações…</div></Shell>;
  if (error)   return <Shell><div className="card p-7 max-w-lg"><div className="text-inkbright font-semibold mb-2">Erro</div><p className="text-muted text-[13.5px]">{error}</p><button className="btn mt-4" onClick={load}>Tentar novamente</button></div></Shell>;

  return (
    <Shell>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-7">
        <div>
          <div className="text-[26px] sm:text-2xl font-semibold">Configurações</div>
          <div className="text-muted text-[13.5px] mt-1">seus parâmetros pessoais — alterações afetam só você</div>
        </div>
        {tab!=="playbook" && (
          <button onClick={saveSettings} disabled={saving} className="btn btn-primary w-full sm:w-auto justify-center">
            {saving?"Salvando…":"Salvar configurações"}
          </button>
        )}
        {tab==="playbook" && (
          <button onClick={savePlaybook} disabled={saving} className="btn btn-primary w-full sm:w-auto justify-center">
            {saving?"Salvando…":"Salvar playbook"}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 mb-5 bg-surface2 border border-[#2b2b36] rounded-[10px] p-1 w-full max-w-sm">
        {(["settings","preco","playbook"] as const).map(t=>(
          <button key={t} onClick={()=>setTab(t)}
            className={`flex-1 px-3 py-2 rounded-lg text-[12.5px] font-semibold transition ${tab===t?"bg-surface3 text-text":"text-muted"}`}>
            {t==="settings"?"Parâmetros":t==="preco"?"Tabela de preços":"Playbook IA"}
          </button>
        ))}
      </div>

      {tab==="settings" && (
        <div className="card p-6 flex flex-col gap-5">
          <Section title="valores base">
            <Grid><NumF label="Valor mínimo (R$)" v={settings.valor_minimo} set={v=>setSettings({...settings,valor_minimo:v})}/><NumF label="Valor por hora (R$)" v={settings.valor_hora} set={v=>setSettings({...settings,valor_hora:v})}/><NumF label="Sinal padrão (%)" v={settings.sinal_percentual} set={v=>setSettings({...settings,sinal_percentual:v})}/></Grid>
          </Section>
          <Section title="multiplicadores de complexidade">
            <Grid><NumF label="Baixa" step={0.05} v={settings.mult_complexidade_baixa} set={v=>setSettings({...settings,mult_complexidade_baixa:v})}/><NumF label="Média" step={0.05} v={settings.mult_complexidade_media} set={v=>setSettings({...settings,mult_complexidade_media:v})}/><NumF label="Alta" step={0.05} v={settings.mult_complexidade_alta} set={v=>setSettings({...settings,mult_complexidade_alta:v})}/></Grid>
          </Section>
          <Section title="cobertura e criação">
            <Grid><NumF label="Adicional cobertura (R$)" v={settings.adicional_cobertura} set={v=>setSettings({...settings,adicional_cobertura:v})}/><NumF label="Taxa criação — Sim (R$)" v={settings.taxa_criacao_sim} set={v=>setSettings({...settings,taxa_criacao_sim:v})}/><NumF label="Taxa criação — Adaptar (R$)" v={settings.taxa_criacao_adaptar} set={v=>setSettings({...settings,taxa_criacao_adaptar:v})}/></Grid>
          </Section>
        </div>
      )}

      {tab==="preco" && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div>
              <div className="text-[14.5px] font-semibold">Tabela de preços</div>
              <div className="text-muted text-[12.5px] mt-0.5">valor final = valor base × multiplicador de complexidade</div>
            </div>
            <button className="btn py-2 px-3 text-[12.5px]" onClick={addPriceRow}>+ Adicionar região</button>
          </div>
          <div className="flex flex-col gap-2">
            {priceTable.map((row,idx)=>(
              <div key={row.id} className="grid grid-cols-1 sm:grid-cols-[1fr_130px_110px_36px] gap-2 items-center bg-surface2 border border-[#2b2b36] rounded-[10px] p-3">
                <span className="text-[13px] font-medium">{row.regiao}</span>
                <div className="grid grid-cols-2 sm:contents gap-2">
                  <input type="number" value={row.valor_base} placeholder="R$ base"
                    onChange={e=>{const t=[...priceTable];t[idx]={...row,valor_base:parseFloat(e.target.value)||0};setPriceTable(t);}}
                    onBlur={()=>savePriceRow(priceTable[idx])}/>
                  <input type="number" step={0.25} value={row.tempo_base_horas} placeholder="h"
                    onChange={e=>{const t=[...priceTable];t[idx]={...row,tempo_base_horas:parseFloat(e.target.value)||0};setPriceTable(t);}}
                    onBlur={()=>savePriceRow(priceTable[idx])}/>
                </div>
                <button onClick={()=>deletePriceRow(row.id)} className="w-9 h-9 flex items-center justify-center rounded-lg border border-[#2b2b36] text-muted2 hover:text-inkbright hover:border-ink/40 transition text-[18px]">×</button>
              </div>
            ))}
            {priceTable.length===0 && <div className="text-muted text-[13px] py-8 text-center">Nenhuma região. Clique em "+ Adicionar região" para começar.</div>}
          </div>
        </div>
      )}

      {tab==="playbook" && (
        <div className="card p-6">
          <div className="text-[14.5px] font-semibold mb-1">Playbook de atendimento</div>
          <p className="text-muted text-[12.5px] mb-4">A IA usa este playbook para gerar sugestões de resposta. Edite para personalizar o método de atendimento.</p>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[12.5px] font-semibold text-muted">Título</label>
              <input value={playbook?.title||""} onChange={e=>setPlaybook(p=>p?{...p,title:e.target.value}:{id:"",user_id:userId,title:e.target.value,content:"",active:true,created_at:"",updated_at:""})}/>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[12.5px] font-semibold text-muted">Conteúdo</label>
              <textarea className="min-h-[400px]" value={playbook?.content||""}
                onChange={e=>setPlaybook(p=>p?{...p,content:e.target.value}:{id:"",user_id:userId,title:"Meu playbook",content:e.target.value,active:true,created_at:"",updated_at:""})}
                placeholder="Descreva aqui o método de atendimento que a IA deve seguir…"/>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}

function Section({title,children}:{title:string;children:React.ReactNode}){
  return <div><div className="flex items-center gap-3 mb-3.5"><span className="font-display italic text-[13px] text-muted2">{title}</span><div className="flex-1 h-px bg-[#202028]"/></div>{children}</div>;
}
function Grid({children}:{children:React.ReactNode}){
  return <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">{children}</div>;
}
function NumF({label,v,set,step=1}:{label:string;v:number;set:(n:number)=>void;step?:number}){
  return <div className="flex flex-col gap-1.5"><label className="text-[12.5px] font-semibold text-muted">{label}</label><input type="number" step={step} value={v} onChange={e=>set(parseFloat(e.target.value)||0)}/></div>;
}
