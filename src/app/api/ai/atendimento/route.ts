import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Limite de tamanho da mensagem do cliente (evita prompt injection)
const MAX_MSG_LEN = 2000;

export async function POST(req: NextRequest) {
  try {
    // 1. Verifica sessão do usuário via Supabase Server
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get: (n) => cookieStore.get(n)?.value,
          set: () => {},
          remove: () => {},
        },
      }
    );

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    // 2. Parse do body
    const body = await req.json().catch(() => null);
    if (!body?.budget_id || !body?.client_message) {
      return NextResponse.json({ error: "budget_id e client_message são obrigatórios." }, { status: 400 });
    }

    const budgetId     = String(body.budget_id).slice(0, 100);
    const clientMsg    = String(body.client_message).slice(0, MAX_MSG_LEN);

    // 3. Busca o orçamento — RLS garante que só retorna se for do usuário logado
    const { data: budget, error: bErr } = await supabase
      .from("budgets")
      .select("*, client:clients(*)")
      .eq("id", budgetId)
      .eq("created_by", user.id)   // dupla verificação explícita
      .maybeSingle();

    if (bErr) return NextResponse.json({ error: "Erro ao buscar orçamento: " + bErr.message }, { status: 500 });
    if (!budget) return NextResponse.json({ error: "Orçamento não encontrado ou não autorizado." }, { status: 403 });

    // 4. Busca playbook ativo do usuário
    const { data: playbooks } = await supabase
      .from("ai_playbooks")
      .select("content")
      .eq("user_id", user.id)
      .eq("active", true)
      .limit(1);

    const playbook = playbooks?.[0]?.content || "Você é um assistente de atendimento para estúdio de tatuagem. Use tom humano, acolhedor e profissional. Sempre termine com uma pergunta.";

    // 5. Monta o prompt com os dados do orçamento
    const clientName = (budget as any).client?.name || "cliente";
    const b = budget as any;
    const orcamentoInfo = [
      `Nome do cliente: ${clientName}`,
      `Região do corpo: ${b.regiao || "não informado"}`,
      `Tamanho: ${b.tamanho || "não informado"}`,
      `Cor: ${b.cor || "não informado"}`,
      `Estilo: ${b.estilo || "não informado"}`,
      `Complexidade: ${b.complexidade || "não informado"}`,
      `Valor sugerido: R$ ${Number(b.valor_sugerido||0).toLocaleString("pt-BR",{minimumFractionDigits:2})}`,
      `Valor final: R$ ${Number(b.valor_final||0).toLocaleString("pt-BR",{minimumFractionDigits:2})}`,
      `Valor de sinal: R$ ${Number(b.valor_sinal||0).toLocaleString("pt-BR",{minimumFractionDigits:2})}`,
      `Status: ${b.status || "novo"}`,
      b.ideia ? `Ideia do cliente: ${b.ideia}` : null,
      b.obs_internas ? `Observações internas: ${b.obs_internas}` : null,
    ].filter(Boolean).join("\n");

    const systemPrompt = `${playbook}

---
DADOS DO ORÇAMENTO (use apenas essas informações):
${orcamentoInfo}
---
REGRAS ABSOLUTAS:
- Nunca invente valores, descontos, horários ou disponibilidade.
- Use apenas os dados do orçamento acima.
- Responda como se fosse o/a tatuador(a) escrevendo no WhatsApp.
- Não use títulos como "Resposta sugerida".
- Sempre termine com uma pergunta.`;

    // 6. Chama a API da OpenAI (chave NUNCA exposta ao front)
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      return NextResponse.json(
        { error: "API de IA não configurada. Adicione OPENAI_API_KEY nas variáveis de ambiente da Vercel." },
        { status: 500 }
      );
    }

    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 600,
        temperature: 0.7,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user",   content: `Mensagem do cliente:\n\n${clientMsg}` },
        ],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text().catch(() => "");
      console.error("OpenAI error:", aiRes.status, errText);
      return NextResponse.json(
        { error: `Erro na API de IA (${aiRes.status}). Tente novamente.` },
        { status: 502 }
      );
    }

    const aiData = await aiRes.json();
    const suggestion = aiData.choices?.[0]?.message?.content?.trim();
    if (!suggestion) {
      return NextResponse.json({ error: "A IA não retornou uma resposta. Tente novamente." }, { status: 502 });
    }

    // 7. Incrementa contador de uso
    const month = new Date().toISOString().slice(0, 7); // YYYY-MM
    await supabase.rpc("increment_ai_usage", { p_user_id: user.id, p_month: month }).catch(() => {
      // Função RPC opcional — não quebra se não existir
    });

    return NextResponse.json({ suggestion });
  } catch (e: any) {
    console.error("atendimento route error:", e);
    return NextResponse.json(
      { error: e?.message || "Erro interno. Tente novamente." },
      { status: 500 }
    );
  }
}
