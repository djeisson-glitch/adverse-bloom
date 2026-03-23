# Memory: index.md
Updated: now

# Adverse - Financial Dashboard

## Design System
- Dark theme only (no light mode toggle)
- Font heading: Space Grotesk, body: Inter
- Primary: electric blue (210 100% 55%)
- Background: deep charcoal (220 20% 7%)
- Card: slightly lighter (220 18% 10%)
- Success: green (142 71% 45%), Warning: amber (38 92% 50%)
- Glass card effect with backdrop blur

## Language
- All UI in Portuguese (Brazil)

## Architecture
- Auth: email/password only, 2 users
- Protected routes with AuthContext
- Uses Lovable Cloud (Supabase) for auth

## Pages & Routes
- / - Home (executive dashboard)
- /financeiro - Visão Geral financeira
- /financeiro/fluxo - Fluxo de Caixa
- /financeiro/custos - Custos
- /financeiro/resultados - Resultados & Metas
- /financeiro/runway - Caixa & Runway
- /financeiro/insights - Insights (AI)
- /financeiro/projecoes - Projeções 2026
- /financeiro/contas - Contas a Pagar
- /comercial - CRM/Pipeline
- /clientes - Clientes
- /clientes/:id - Perfil do cliente
- /orcamentos - Orçamentos
- /mapa-operacional - Mapa Operacional
- /configuracoes - Configurações
