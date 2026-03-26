Módulo Agenda da Equipe - alocação de equipe e diárias de captação.

## Database
- `team_members` - cadastro separado (inclui freelancers sem login). Campos: name, email, phone, color, role_function, user_id, is_active
- `job_allocations` - alocações de membros em jobs. Campos: budget_id, team_member_id, allocation_date, start_time, end_time, location, description, role_function
- `budgets.capture_days` - campo manual de diárias de captação no orçamento

## Permissions
- Module ID: "agenda" 
- Admins (Djêisson/Maiara): CRUD total em alocações e membros
- Demais: somente visualização dos próprios jobs (RLS: team_member.user_id = auth.uid())

## Fase 2 Pendente
- Google Calendar integration (leitura de eventos pessoais + criação automática de eventos)
- E-mail de notificação ao alocar membro

## Files
- src/pages/Agenda.tsx - página principal com calendário semanal/mensal
- src/components/agenda/ - AllocationModal, TeamMemberModal, AgendaCalendar, CaptureDaysBalance
- src/hooks/useTeamMembers.ts, useJobAllocations.ts
