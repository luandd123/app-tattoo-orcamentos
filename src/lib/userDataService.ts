/**
 * userDataService.ts
 * Funções centrais para buscar/criar as configurações individuais do usuário logado.
 * Garante que user_settings e user_price_table nunca fiquem em loading infinito.
 */
import { SupabaseClient } from "@supabase/supabase-js";
import { UserSettings, UserPriceRow } from "./types";
import { DEFAULT_SETTINGS } from "./calc";

export interface UserDataResult {
  settings: UserSettings;
  priceTable: UserPriceRow[];
  settingsWarning: string | null;
  priceTableWarning: string | null;
}

export async function fetchUserData(
  supabase: SupabaseClient,
  userId: string
): Promise<UserDataResult> {
  let settings: UserSettings = { ...DEFAULT_SETTINGS, user_id: userId };
  let priceTable: UserPriceRow[] = [];
  let settingsWarning: string | null = null;
  let priceTableWarning: string | null = null;

  // Busca paralela
  const [settingsRes, priceRes] = await Promise.allSettled([
    supabase.from("user_settings").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("user_price_table").select("*").eq("user_id", userId).order("regiao"),
  ]);

  // --- settings ---
  if (settingsRes.status === "fulfilled") {
    const { data, error } = settingsRes.value as any;
    if (error) {
      console.error("fetchUserData settings:", error);
      settingsWarning = error.message || "Erro ao carregar configurações. Usando valores padrão.";
    } else if (!data) {
      // Cria automaticamente
      const { data: created, error: insErr } = await supabase
        .from("user_settings")
        .insert({ user_id: userId })
        .select()
        .single();
      if (insErr || !created) {
        settingsWarning = "Configurações não encontradas. Usando valores padrão.";
      } else {
        settings = created as UserSettings;
      }
    } else {
      settings = data as UserSettings;
    }
  } else {
    settingsWarning = "Erro inesperado ao carregar configurações.";
  }

  // --- price table ---
  if (priceRes.status === "fulfilled") {
    const { data, error } = priceRes.value as any;
    if (error) {
      console.error("fetchUserData price_table:", error);
      priceTableWarning = error.message || "Erro ao carregar tabela de preços.";
    } else if (!data || data.length === 0) {
      // Copia da tabela global
      const { data: globalPt } = await supabase
        .from("price_table").select("regiao, valor_base, tempo_base_horas");
      if (globalPt && globalPt.length > 0) {
        const rows = globalPt.map((r: any) => ({
          user_id: userId, regiao: r.regiao,
          valor_base: r.valor_base, tempo_base_horas: r.tempo_base_horas,
        }));
        const { data: inserted } = await supabase
          .from("user_price_table").insert(rows).select();
        priceTable = (inserted as UserPriceRow[]) || [];
        if (priceTable.length === 0)
          priceTableWarning = "Tabela de preços criada com valores padrão.";
      } else {
        priceTableWarning = "Nenhuma região na tabela de preços. Adicione em Configurações.";
      }
    } else {
      priceTable = data as UserPriceRow[];
    }
  } else {
    priceTableWarning = "Erro inesperado ao carregar tabela de preços.";
  }

  return { settings, priceTable, settingsWarning, priceTableWarning };
}
