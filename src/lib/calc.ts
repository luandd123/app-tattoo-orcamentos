import { Complexidade, PriceRow, Settings } from "./types";

export interface CalcInput {
  regiao: string;
  complexidade: Complexidade;
  isCobertura: boolean;
  autoral: "Sim" | "Não" | "Adaptar referência" | string;
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

/**
 * Fórmula oficial:
 *   valor_final_sugerido = valor_base (tabela) × multiplicador_complexidade
 *   + taxa de criação (se autoral) + adicional de cobertura (se for cobertura)
 *
 * Ex.: Antebraço interno, complexidade Baixa, valor base R$1.500 -> 1500 × 0.85 = R$1.275
 */
export function calcBudget(
  input: CalcInput,
  priceTable: PriceRow[],
  settings: Settings
): CalcResult {
  const priceRow = priceTable.find((p) => p.regiao === input.regiao);
  const valorBase = priceRow?.valor_base ?? 0;
  const tempoBase = priceRow?.tempo_base_horas ?? 2;

  const multMap: Record<Complexidade, number> = {
    baixa: settings.mult_complexidade_baixa,
    media: settings.mult_complexidade_media,
    alta: settings.mult_complexidade_alta,
  };
  const multiplicador = multMap[input.complexidade] ?? 1;

  let taxaCriacao = settings.taxa_criacao_nao;
  if (input.autoral === "Sim") taxaCriacao = settings.taxa_criacao_sim;
  else if (input.autoral === "Adaptar referência") taxaCriacao = settings.taxa_criacao_adaptar;

  const adicionalCobertura = input.isCobertura ? settings.adicional_cobertura : 0;

  const valorBruto = valorBase * multiplicador + taxaCriacao + adicionalCobertura;
  const valorSugerido = Math.max(settings.valor_minimo, round2(valorBruto));

  // tempo estimado escala com o mesmo multiplicador de complexidade
  const tempoEstimado = round2(tempoBase * multiplicador + (input.isCobertura ? 1.5 : 0));
  const sessoesSugeridas = Math.max(1, Math.ceil(tempoEstimado / 5));
  const sinalSugerido = round2(valorSugerido * (settings.sinal_percentual / 100));

  return {
    valorBase,
    multiplicador,
    tempoBase,
    taxaCriacao,
    adicionalCobertura,
    valorSugerido,
    tempoEstimado,
    sessoesSugeridas,
    sinalSugerido,
  };
}

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export interface AjusteManual {
  valorOriginal: number;
  valorAjustado: number;
  diferencaValor: number;
  diferencaPercentual: number;
}

export function calcAjusteManual(valorOriginal: number, valorAjustado: number): AjusteManual {
  const diferencaValor = round2(valorAjustado - valorOriginal);
  const diferencaPercentual =
    valorOriginal > 0 ? round2((diferencaValor / valorOriginal) * 100) : 0;
  return { valorOriginal, valorAjustado, diferencaValor, diferencaPercentual };
}
