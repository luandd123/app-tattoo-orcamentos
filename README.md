# Estúdio · Orçamentos

Sistema online (multiusuário, com login e banco de dados) para gerenciar orçamentos de tatuagem.

Stack: **Next.js 14** (front-end) + **Supabase** (login/senha + banco de dados Postgres + permissões) + **Vercel** (hospedagem).

---

## 1. O que já está pronto neste projeto

- Login/cadastro com e-mail e senha (Supabase Auth)
- 3 tipos de acesso: Administrador, Atendente, Visualização — com permissões reforçadas direto no banco (RLS), não só na tela
- Dashboard com contagem por status
- Lista de orçamentos com filtro por status, busca por cliente e ordenação (mais novo, mais antigo, região, valor, cliente)
- Kanban com 7 colunas (Novo orçamento, Em análise, Aguardando cliente, Aprovado, Agendado, Finalizado, Perdido/recusado), arrastar e soltar atualiza o status
- Calculadora: `valor final = valor base da tabela × multiplicador de complexidade` (baixa 0,85 / média 1,00 / alta 1,20), + taxa de criação e adicional de cobertura quando aplicável
- Tabela de cálculo sugerido: ao ajustar o valor manualmente, mostra valor original, valor ajustado, diferença em R$, diferença em % e o motivo informado — fica tudo salvo no histórico (`manual_adjustments`)
- Histórico de status (`status_history`) com quem mudou e quando
- Mensagem pronta para WhatsApp com botão "Copiar"
- Configurações: tabela de preços por região, multiplicadores de complexidade, valor mínimo, valor/hora, sinal padrão, taxas de criação e cobertura
- Gestão de usuários (admin troca o tipo de acesso de qualquer pessoa)

---

## 2. Criar o banco de dados (Supabase)

1. Crie uma conta gratuita em [supabase.com](https://supabase.com) e clique em **New project**.
2. Escolha um nome, senha do banco e região (ex: South America - São Paulo).
3. Quando o projeto terminar de criar, vá em **SQL Editor** → **New query**.
4. Abra o arquivo `supabase/schema.sql` deste projeto, copie todo o conteúdo, cole no editor e clique em **Run**.
   - Isso cria todas as tabelas, as permissões (RLS) e já popula a tabela de preços com os valores de exemplo do briefing.
5. Vá em **Project Settings → API** e copie:
   - `Project URL`
   - `anon public key`

---

## 3. Configurar o projeto localmente (opcional, para testar antes de publicar)

```bash
npm install
cp .env.local.example .env.local
# edite .env.local e cole a Project URL e a anon key do passo 2
npm run dev
```

Acesse `http://localhost:3000` — você vai cair na tela de login.

---

## 4. Criar o primeiro administrador

1. Na tela de login, clique em "Não tem conta? Criar acesso" e cadastre seu usuário (nome, e-mail, senha).
   - Todo cadastro novo entra automaticamente como **Atendente**.
2. No Supabase, vá em **SQL Editor** e rode (trocando o e-mail):

```sql
update public.profiles set role = 'admin' where email = 'seuemail@exemplo.com';
```

3. Faça login novamente — agora você verá os menus **Configurações** e **Usuários**, e poderá promover outras pessoas pela própria tela de Usuários.

---

## 5. Publicar online (Vercel)

1. Suba este projeto para um repositório no GitHub (crie um repo vazio e faça `git push`).
2. Crie uma conta em [vercel.com](https://vercel.com) (pode entrar com a conta do GitHub).
3. Clique em **Add New → Project**, selecione o repositório.
4. Em **Environment Variables**, adicione:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   (os mesmos valores do passo 2)
5. Clique em **Deploy**. Em ~1 minuto o sistema estará no ar com um link `https://seu-projeto.vercel.app`.
6. Repita o passo 4 (promover admin) se for o primeiro acesso em produção.

A partir daqui, qualquer alteração que você fizer no código e enviar para o GitHub (`git push`) atualiza o site automaticamente.

---

## 6. Estrutura de pastas

```
src/
  app/
    login/             tela de login e cadastro
    orcamentos/         lista + kanban
    orcamentos/novo/    novo orçamento
    orcamentos/[id]/    detalhe, ajuste manual, status, mensagem WhatsApp
    configuracoes/      tabela de preços e multiplicadores (admin)
    usuarios/           gestão de acesso (admin)
    page.tsx            dashboard
  components/           Shell (menu lateral), StatusBadge
  lib/                  cliente Supabase, tipos, motor de cálculo
  middleware.ts         protege as rotas (exige login)
supabase/schema.sql      script completo do banco de dados
```

---

## 7. Sobre as permissões (RLS)

As regras não ficam só no front-end — estão escritas direto no banco (Row Level Security), então mesmo que alguém tente acessar a API diretamente, o Supabase bloqueia:

- **Administrador**: lê e edita tudo, inclusive configurações e usuários.
- **Atendente**: cria e edita clientes/orçamentos, muda status, registra ajustes — não mexe em configurações nem usuários.
- **Visualização**: só leitura em tudo.

Exclusões definitivas (de cliente ou orçamento) são permitidas só para Administrador.
