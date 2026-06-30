"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { supabaseBrowser } from "@/lib/supabaseClient";
import { useProfile } from "@/lib/useProfile";
import { Profile, UserRole } from "@/lib/types";

export default function UsuariosPage() {
  const supabase = supabaseBrowser();
  const { isAdmin, loading: profileLoading } = useProfile();
  const [users, setUsers] = useState<Profile[]>([]);

  async function load() {
    const { data } = await supabase.from("profiles").select("*").order("created_at");
    setUsers((data as any) || []);
  }
  useEffect(() => {
    load();
  }, []);

  async function changeRole(id: string, role: UserRole) {
    await supabase.from("profiles").update({ role }).eq("id", id);
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, role } : u)));
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
        <div className="card p-6 text-muted">Apenas administradores podem gerenciar usuários.</div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mb-6">
        <div className="text-2xl font-semibold">Usuários</div>
        <div className="text-muted text-[13.5px] mt-1">
          Novos usuários se cadastram pela tela de login e entram como "Atendente" — ajuste o acesso aqui.
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] border-collapse">
            <thead>
              <tr>
                {["Nome", "E-mail", "Tipo de acesso", "Desde"].map((h) => (
                  <th key={h} className="text-left text-[11px] uppercase tracking-wide text-muted2 px-3.5 py-2.5 border-b border-[#202028] font-semibold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="px-3.5 py-3 border-b border-[#202028] font-semibold whitespace-nowrap">{u.name}</td>
                  <td className="px-3.5 py-3 border-b border-[#202028] whitespace-nowrap">{u.email}</td>
                  <td className="px-3.5 py-3 border-b border-[#202028] whitespace-nowrap">
                    <select value={u.role} onChange={(e) => changeRole(u.id, e.target.value as UserRole)} className="py-1.5 text-[12.5px]">
                      <option value="admin">Administrador</option>
                      <option value="atendente">Atendente</option>
                      <option value="visualizacao">Visualização</option>
                    </select>
                  </td>
                  <td className="px-3.5 py-3 border-b border-[#202028] whitespace-nowrap text-muted2">{new Date(u.created_at).toLocaleDateString("pt-BR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-5 text-[12px] text-muted2 leading-relaxed">
        Administrador: vê e edita tudo. Atendente: cria e edita orçamentos. Visualização: apenas consulta (sem editar).
        As permissões reais são reforçadas no banco via Row Level Security — trocar o tipo aqui já atualiza o que cada um pode fazer.
      </div>
    </Shell>
  );
}
