export type UserRole = "admin" | "attendant" | "viewer";

export type BudgetStatus =
  | "novo" | "analise" | "aguardando_cliente"
  | "aprovado" | "agendado" | "finalizado" | "perdido";

export type Complexidade = "baixa" | "media" | "alta";

export const STATUS_LIST: { key: BudgetStatus; label: string; color: string }[] = [
  { key: "novo",              label: "Novo orçamento",      color: "#7fb3e8" },
  { key: "analise",           label: "Em análise",          color: "#c9a24b" },
  { key: "aguardando_cliente",label: "Aguardando cliente",  color: "#e0a35f" },
  { key: "aprovado",          label: "Aprovado",            color: "#9c8ff0" },
  { key: "agendado",          label: "Agendado",            color: "#5fae7a" },
  { key: "finalizado",        label: "Finalizado",          color: "#5fc499" },
  { key: "perdido",           label: "Perdido/recusado",    color: "#e8475f" },
];

export const COMPLEXIDADE_LABEL: Record<Complexidade, string> = {
  baixa: "Baixa (-15%)",
  media: "Média (valor base)",
  alta:  "Alta (+20%)",
};

export interface Profile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  created_at: string;
}

export interface Client {
  id: string;
  name: string;
  whatsapp: string | null;
  instagram: string | null;
  cidade: string | null;
  origem: string | null;
  created_by: string;
  created_at: string;
}

/** Tabela global (usada só como fallback / referência) */
export interface PriceRow {
  id: string;
  regiao: string;
  valor_base: number;
  tempo_base_horas: number;
}

/** Linha da tabela individual do usuário */
export interface UserPriceRow {
  id: string;
  user_id: string;
  regiao: string;
  valor_base: number;
  tempo_base_horas: number;
}

/** Configurações individuais do usuário */
export interface UserSettings {
  id: string;
  user_id: string;
  valor_minimo: number;
  valor_hora: number;
  sinal_percentual: number;
  mult_complexidade_baixa: number;
  mult_complexidade_media: number;
  mult_complexidade_alta: number;
  adicional_cobertura: number;
  taxa_criacao_sim: number;
  taxa_criacao_adaptar: number;
  taxa_criacao_nao: number;
  updated_at: string;
}

/** Mantida para compatibilidade de tipos com qualquer código legado */
export type Settings = UserSettings;

export interface Budget {
  id: string;
  client_id: string;
  ideia: string | null;
  estilo: string | null;
  regiao: string;
  tamanho: string | null;
  cor: string | null;
  complexidade: Complexidade;
  tattoo_antiga: string | null;
  autoral: string | null;
  valor_base: number;
  multiplicador: number;
  valor_sugerido: number;
  valor_final: number;
  valor_sinal: number;
  tempo_estimado: number;
  num_sessoes: number;
  motivo_ajuste: string | null;
  obs_internas: string | null;
  referencias: string | null;
  status: BudgetStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
  client?: Client;
}

export interface ManualAdjustment {
  id: string;
  budget_id: string;
  valor_original: number;
  valor_ajustado: number;
  diferenca_valor: number;
  diferenca_percentual: number;
  motivo: string | null;
  adjusted_by: string | null;
  adjusted_at: string;
}

export interface AiPlaybook {
  id: string;
  user_id: string;
  title: string;
  content: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AiSuggestion {
  id: string;
  user_id: string;
  budget_id: string;
  client_message: string;
  ai_response: string;
  created_at: string;
}
