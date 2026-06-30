"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseClient";
import { useProfile } from "@/lib/useProfile";

const NAV = [
  { href: "/", label: "Dashboard", icon: "M3 3h7v9H3V3Zm11 0h7v5h-7V3ZM3 16h7v5H3v-5Zm11-5h7v10h-7V11Z" },
  { href: "/orcamentos/novo", label: "Novo orçamento", icon: "M12 5v14M5 12h14" },
  { href: "/orcamentos", label: "Orçamentos", icon: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" },
  { href: "/configuracoes", label: "Configurações", adminOnly: true, icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" },
  { href: "/usuarios", label: "Usuários", adminOnly: true, icon: "M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M11 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm10 14v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" },
];

const ROLE_LABEL: Record<string, string> = { admin: "Administrador", attendant: "Atendente", viewer: "Visualização" };

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = supabaseBrowser();
  const { profile, isAdmin } = useProfile();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // fecha o drawer automaticamente ao trocar de página
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const visibleNav = NAV.filter((n) => !n.adminOnly || isAdmin);

  const sidebarContent = (
    <>
      <div className="flex items-center gap-2.5 px-2 pb-6">
        <div className="w-[34px] h-[34px] rounded-[9px] bg-gradient-to-br from-ink to-[#7a1c2c] flex items-center justify-center font-display font-bold text-white text-[17px] shadow-lg shrink-0">
          T
        </div>
        <div>
          <div className="font-display text-[17px] leading-tight">Estúdio</div>
          <div className="text-[10.5px] tracking-[1.5px] uppercase text-muted2">Orçamentos</div>
        </div>
        <button
          onClick={() => setDrawerOpen(false)}
          aria-label="Fechar menu"
          className="ml-auto lg:hidden w-9 h-9 rounded-lg flex items-center justify-center text-muted hover:bg-surface2"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <nav className="flex flex-col gap-1.5 flex-1 overflow-y-auto">
        {visibleNav.map((n) => {
          const active = pathname === n.href || (n.href !== "/" && pathname.startsWith(n.href));
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`flex items-center gap-3 px-3.5 py-3 lg:py-2.5 rounded-[10px] text-[14.5px] lg:text-[14px] font-medium border transition relative ${
                active
                  ? "bg-surface2 text-text border-[#2b2b36] before:content-[''] before:absolute before:-left-[20px] before:top-[10px] before:bottom-[10px] before:w-[3px] before:rounded before:bg-ink"
                  : "text-muted border-transparent hover:bg-surface2 hover:text-text"
              }`}
            >
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" className="shrink-0 opacity-85">
                <path d={n.icon} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>{n.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-3.5 mt-2 border-t border-[#202028] rounded-[12px] bg-surface2/40">
        {profile ? (
          <>
            <div className="text-[13px] text-text font-semibold truncate">{profile.name || profile.email}</div>
            <div className="text-[11.5px] text-muted2 truncate mb-1">{profile.email}</div>
            <div className="text-[10.5px] uppercase tracking-wide text-gold font-semibold mb-3">
              {ROLE_LABEL[profile.role] || profile.role}
            </div>
            <button onClick={logout} className="btn btn-logout w-full justify-center py-2.5">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Sair
            </button>
          </>
        ) : (
          <div className="text-[12px] text-muted2">carregando…</div>
        )}
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen">
      {/* Header mobile/tablet */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-30 h-14 flex items-center justify-between px-4 bg-[#0d0d11]/95 backdrop-blur border-b border-[#202028]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-[8px] bg-gradient-to-br from-ink to-[#7a1c2c] flex items-center justify-center font-display font-bold text-white text-[14px]">
            T
          </div>
          <span className="font-display text-[15px]">Estúdio</span>
        </div>
        <button
          onClick={() => setDrawerOpen(true)}
          aria-label="Abrir menu"
          className="w-9 h-9 rounded-lg flex items-center justify-center text-text bg-surface2 border border-[#2b2b36]"
        >
          <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 12h18M3 6h18M3 18h18" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      {/* Overlay mobile */}
      {drawerOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* Sidebar desktop (sempre visível) + drawer mobile (desliza) */}
      <aside
        className={`w-[260px] shrink-0 bg-gradient-to-b from-[#121217] to-[#0d0d11] border-r border-[#202028] px-5 py-7 flex flex-col gap-1.5
        fixed lg:sticky top-0 h-screen z-50 transition-transform duration-200
        ${drawerOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}
      >
        {sidebarContent}
      </aside>

      <main className="flex-1 min-w-0 pt-20 px-4 pb-16 sm:pt-20 sm:px-6 lg:pt-10 lg:px-10 lg:pb-20">
        <div className="max-w-[1360px] mx-auto w-full">{children}</div>
      </main>
    </div>
  );
}
