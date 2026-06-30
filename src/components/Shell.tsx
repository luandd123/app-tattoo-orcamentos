"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseClient";
import { useProfile } from "@/lib/useProfile";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/orcamentos/novo", label: "Novo orçamento" },
  { href: "/orcamentos", label: "Orçamentos" },
  { href: "/configuracoes", label: "Configurações", adminOnly: true },
  { href: "/usuarios", label: "Usuários", adminOnly: true },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = supabaseBrowser();
  const { profile, isAdmin } = useProfile();

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen">
      <aside className="w-[236px] shrink-0 bg-gradient-to-b from-[#121217] to-[#0d0d11] border-r border-[#202028] p-7 px-4.5 flex flex-col gap-1.5 sticky top-0 h-screen">
        <div className="flex items-center gap-2.5 px-2 pb-6">
          <div className="w-[34px] h-[34px] rounded-[9px] bg-gradient-to-br from-ink to-[#7a1c2c] flex items-center justify-center font-display font-bold text-white text-[17px] shadow-lg">
            T
          </div>
          <div>
            <div className="font-display text-[17px]">Estúdio</div>
            <div className="text-[10.5px] tracking-[1.5px] uppercase text-muted2">Orçamentos</div>
          </div>
        </div>

        {NAV.filter((n) => !n.adminOnly || isAdmin).map((n) => {
          const active = pathname === n.href || (n.href !== "/" && pathname.startsWith(n.href));
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] text-[14px] font-medium border transition relative ${
                active
                  ? "bg-surface2 text-text border-[#2b2b36] before:content-[''] before:absolute before:-left-[18px] before:top-[9px] before:bottom-[9px] before:w-[3px] before:rounded before:bg-ink"
                  : "text-muted border-transparent hover:bg-surface2 hover:text-text"
              }`}
            >
              {n.label}
            </Link>
          );
        })}

        <div className="flex-1" />
        <div className="px-2 pt-3.5 border-t border-[#202028] text-[11px] text-muted2">
          {profile ? (
            <>
              <div className="text-[12.5px] text-text font-medium mb-0.5">{profile.name}</div>
              <div className="capitalize mb-2.5">{profile.role}</div>
              <button onClick={logout} className="text-inkbright hover:underline">
                Sair
              </button>
            </>
          ) : (
            "carregando…"
          )}
        </div>
      </aside>
      <main className="flex-1 min-w-0 p-9 pb-20">{children}</main>
    </div>
  );
}
