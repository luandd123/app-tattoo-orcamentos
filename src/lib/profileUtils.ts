import { SupabaseClient } from "@supabase/supabase-js";
import { Profile } from "./types";

export interface CurrentProfileResult {
  user: { id: string; email?: string | null } | null;
  profile: Profile | null;
  /** "auth" = falha ao checar sessão · "profile" = falha ao ler/criar o profile · "permission" = RLS negou acesso */
  errorType: "auth" | "profile" | "permission" | null;
  errorMessage: string | null;
}

function readableError(err: any, fallback: string): string {
  if (!err) return fallback;
  if (typeof err === "string") return err;
  if (err.message) return err.message;
  if (err.error_description) return err.error_description;
  if (err.msg) return err.msg;
  try {
    const asString = JSON.stringify(err);
    if (asString && asString !== "{}") return asString;
  } catch {
    /* ignore */
  }
  return fallback;
}

function isPermissionError(err: any): boolean {
  const code = err?.code || "";
  const msg = (err?.message || "").toLowerCase();
  return code === "42501" || msg.includes("permission") || msg.includes("policy") || msg.includes("row-level security");
}

/**
 * Função central: busca o usuário autenticado e o profile correspondente.
 * Se o profile ainda não existir (ex: trigger não rodou, usuário criado
 * manualmente no Supabase), tenta criar um automaticamente com role
 * 'attendant'. Nunca lança exceção — sempre retorna um resultado com
 * mensagens de erro legíveis para a UI.
 */
export async function getCurrentUserAndProfile(
  supabase: SupabaseClient
): Promise<CurrentProfileResult> {
  try {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) {
      return {
        user: null,
        profile: null,
        errorType: "auth",
        errorMessage: readableError(userError, "Não foi possível verificar sua sessão. Faça login novamente."),
      };
    }

    const user = userData?.user ?? null;
    if (!user) {
      return { user: null, profile: null, errorType: null, errorMessage: null };
    }

    const { data: existing, error: selectError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (selectError) {
      return {
        user,
        profile: null,
        errorType: isPermissionError(selectError) ? "permission" : "profile",
        errorMessage: isPermissionError(selectError)
          ? "Sem permissão para carregar seu perfil."
          : readableError(selectError, "Não foi possível carregar seu perfil."),
      };
    }

    if (existing) {
      return { user, profile: existing as Profile, errorType: null, errorMessage: null };
    }

    // Profile não existe ainda — tenta criar automaticamente como attendant.
    const { data: created, error: insertError } = await supabase
      .from("profiles")
      .insert({
        id: user.id,
        name: user.email ? user.email.split("@")[0] : "",
        email: user.email || "",
        role: "attendant",
      })
      .select()
      .single();

    if (insertError) {
      return {
        user,
        profile: null,
        errorType: isPermissionError(insertError) ? "permission" : "profile",
        errorMessage: isPermissionError(insertError)
          ? "Sem permissão para criar seu perfil automaticamente."
          : "Perfil não encontrado. Verifique a tabela profiles.",
      };
    }

    return { user, profile: created as Profile, errorType: null, errorMessage: null };
  } catch (err: any) {
    console.error("getCurrentUserAndProfile: erro inesperado", err);
    return {
      user: null,
      profile: null,
      errorType: "auth",
      errorMessage: readableError(err, "Erro inesperado ao verificar sua conta."),
    };
  }
}

export { readableError, isPermissionError };
