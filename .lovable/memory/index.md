Adverse OS — sistema operacional interno de produtora audiovisual premium brasileira.

## Design System
- Dark theme only, minimalista, premium, sem gradientes
- Font: Inter (heading + body)
- Background: #0d0d0d (0 0% 5.1%)
- Sidebar: #111111 (0 0% 6.7%)
- Card: #161616 (0 0% 8.6%)
- Primary/Accent: #E53500 (14 100% 45%) — vermelho Adverse
- Foreground: #ffffff, Muted: #a0a0a0
- Border: #222222

## Language
- All UI in Portuguese (Brazil)

## Architecture
- Auth: Google OAuth only (via lovable.auth.signInWithOAuth)
- Profiles auto-created on first login from Google metadata
- Roles stored in user_roles table (app_role enum: admin, manager, operator)
- has_role() security definer function for RLS

## Navigation (sidebar)
- Home (/)
- Financeiro (collapsible submenu): Visão Geral, Fluxo de Caixa, Custos, Resultados & Metas, Caixa & Runway, Insights, Projeções 2026, Contas a Pagar
- Comercial (/comercial)
- Orçamentos (/orcamentos)
- Projetos (disabled, "em breve")
- Mapa Operacional (/mapa-operacional)
- Configurações (/configuracoes) — admin only

## DB Tables
- profiles, user_roles, clients, deals, proposals
- Plus existing: budgets, budget_items, budget_settings, budget_targets, projects, suppliers, etc.
