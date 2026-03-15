# Memory: index.md
Updated: today

# Adverse - Financial Dashboard

## Design System
- Dark theme only (no light mode toggle)
- Font: Montserrat for everything (heading + body)
- Primary: Adverse red #FF0000 (0 100% 50%)
- Background: #1a1a1a (0 0% 10%)
- Card: #262626 (0 0% 15%)
- Border: #404040 (0 0% 25%)
- Text secondary: #a3a3a3 (0 0% 64%)
- Success: #10b981, Warning: #f59e0b, Danger: #ef4444
- Glass card effect with backdrop blur

## Language
- All UI in Portuguese (Brazil)

## Architecture
- Auth: email/password only, 2 users
- Sidebar sections: Visão Geral, Projetos, Clientes, Fluxo de Caixa, Custos
- Protected routes with AuthContext
- Uses Lovable Cloud (Supabase) for auth

## Pages
- /login - Login page
- / - Overview dashboard
- /projetos - Projects table
- /clientes - Client cards
- /fluxo-de-caixa - Cash flow transactions
- /custos - Cost breakdown
