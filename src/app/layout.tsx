import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Estúdio · Orçamentos",
  description: "Painel interno de orçamentos de tatuagem",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="font-sans min-h-screen">{children}</body>
    </html>
  );
}
