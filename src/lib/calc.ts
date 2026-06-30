import { Complexidade, UserPriceRow, UserSettings } from "./types";

export interface CalcInput {
  regiao: string;
  complexidade: Complexidade;
  isCobertura: boolean;
  autoral: string;
}

export interface CalcResult {
  valorBase: number;
  multiplicador: number;
  tempoBase: number;
  taxaCriacao: number;
  adicionalCobertura: number;
  valorSugerido: number;
  tempoEstimado: number;
  sessoesSugeridas: number;
  sinalSugerido: number;
}

export const DEFAULT_SETTINGS: UserSettings = {
  id: "",
  user_id: "",
  valor_minimo: 150,
  valor_hora: 180,
  sinal_percentual: 30,
  mult_complexidade_baixa: 0.85,
  mult_complexidade_media: 1.00,
  mult_complexidade_alta: 1.20,
  adicional_cobertura: 50,
  taxa_criacao_sim: 80,
  taxa_criacao_adaptar: 40,
  taxa_criacao_nao: 0,
  updated_at: "",
};

export function calcBudget(
  input: CalcInput,
  priceTable: UserPriceRow[],
  settings: UserSettings
): CalcResult {
  const row = priceTable.find(p => p.regiao === input.regiao);
  const valorBase  = row?.valor_base       ?? 0;
  const tempoBase  = row?.tempo_base_horas ?? 2;

  const multMap: Record<Complexidade, number> = {
    baixa: settings.mult_complexidade_baixa,
    media: settings.mult_complexidade_media,
    alta:  settings.mult_complexidade_alta,
  };
  const multiplicador = multMap[input.complexidade] ?? 1;

  let taxaCriacao = settings.taxa_criacao_nao;
  if (input.autoral === "Sim")                 taxaCriacao = settings.taxa_criacao_sim;
  else if (input.autoral === "Adaptar referência") taxaCriacao = settings.taxa_criacao_adaptar;

  const adicionalCobertura = input.isCobertura ? settings.adicional_cobertura : 0;
  const valorBruto     = valorBase * multiplicador + taxaCriacao + adicionalCobertura;
  const valorSugerido  = Math.max(settings.valor_minimo, round2(valorBruto));
  const tempoEstimado  = round2(tempoBase * multiplicador + (input.isCobertura ? 1.5 : 0));
  const sessoesSugeridas = Math.max(1, Math.ceil(tempoEstimado / 5));
  const sinalSugerido  = round2(valorSugerido * (settings.sinal_percentual / 100));

  return { valorBase, multiplicador, tempoBase, taxaCriacao, adicionalCobertura,
           valorSugerido, tempoEstimado, sessoesSugeridas, sinalSugerido };
}

export function round2(n: number) { return Math.round(n * 100) / 100; }

export function calcAjusteManual(valorOriginal: number, valorAjustado: number) {
  const diferencaValor = round2(valorAjustado - valorOriginal);
  const diferencaPercentual = valorOriginal > 0
    ? round2((diferencaValor / valorOriginal) * 100) : 0;
  return { valorOriginal, valorAjustado, diferencaValor, diferencaPercentual };
}
