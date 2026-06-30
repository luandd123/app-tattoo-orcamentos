"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();
  const supabase = supabaseBrowser();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        // role nunca é enviado pelo cliente: o backend sempre cria o
        // perfil como "attendant" (veja public.handle_new_user no schema.sql)
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { name } },
        });
        if (error) throw error;
      }
      router.push("/");
      router.refresh();
    } catch (err: any) {
      console.error("Erro de autenticação:", err);
      const message =
        err?.message || err?.error_description || err?.msg || "Não foi possível concluir. Verifique os dados e tente novamente.";
      setError(message === "Invalid login credentials" ? "E-mail ou senha inválidos." : message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="card w-full max-w-sm p-8">
        <div className="flex items-center gap-3 mb-7">
          <div className="w-9 h-9 rounded-[9px] bg-gradient-to-br from-ink to-[#7a1c2c] flex items-center justify-center font-display font-bold text-white shadow-lg">
            T
          </div>
          <div>
            <div className="font-display text-lg">Estúdio</div>
            <div className="text-[10px] tracking-[1.5px] uppercase text-muted2">Orçamentos</div>
          </div>
        </div>

        <h1 className="font-display text-xl mb-1">
          {mode === "login" ? "Entrar" : "Criar conta"}
        </h1>
        <p className="text-muted text-[13px] mb-6">
          {mode === "login"
            ? "Acesse o painel interno do estúdio."
            : "Sua conta entra como Atendente — peça a um administrador para ajustar o acesso."}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          {mode === "signup" && (
            <div>
              <label className="text-[12.5px] font-semibold text-muted block mb-1.5">Nome</label>
              <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Seu nome" />
            </div>
          )}
          <div>
            <label className="text-[12.5px] font-semibold text-muted block mb-1.5">E-mail</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="voce@estudio.com" />
          </div>
          <div>
            <label className="text-[12.5px] font-semibold text-muted block mb-1.5">Senha</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••" minLength={6} />
          </div>

          {error && <div className="text-inkbright text-[12.5px] bg-ink/10 border border-ink/30 rounded-lg px-3 py-2">{error}</div>}

          <button type="submit" disabled={loading} className="btn btn-primary mt-2 py-3">
            {loading ? "Aguarde…" : mode === "login" ? "Entrar" : "Criar conta"}
          </button>
        </form>

        <button
          className="text-muted text-[12.5px] mt-5 underline underline-offset-2 hover:text-text"
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
        >
          {mode === "login" ? "Não tem conta? Criar acesso" : "Já tem conta? Entrar"}
        </button>
      </div>
    </div>
  );
}
