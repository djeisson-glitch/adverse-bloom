Módulo Agenda da Equipe - alocação de equipe e diárias de captação.

## Database
- `team_members` - cadastro separado (inclui freelancers sem login). Campos: name, email, phone, color, role_function, user_id, is_active
- `job_allocations` - alocações de membros em jobs. Campos: budget_id, team_member_id, allocation_date, start_time, end_time, location, description, role_function, google_calendar_event_id
- `google_tokens` - tokens OAuth do Google por membro. Campos: team_member_id (unique), access_token, refresh_token, expires_at, google_email
- `budgets.capture_days` - campo manual de diárias de captação no orçamento

## Google Calendar Integration (Phase 2 - Implemented)
- OAuth flow: edge function `google-auth-callback` handles code exchange, stores tokens in `google_tokens`
- Calendar sync: edge function `google-calendar-sync` creates/updates/deletes events on member's primary calendar
- Events created without attendees (no invite notifications)
- Token refresh handled automatically in edge function
- If member has no Google connected, allocation works normally without calendar sync
- Connect button in TeamMemberModal for each member

## Permissions
- Module ID: "agenda" 
- Admins (Djêisson/Maiara): CRUD total em alocações e membros
- Demais: somente visualização dos próprios jobs (RLS: team_member.user_id = auth.uid())

## Files
- src/pages/Agenda.tsx - página principal com calendário semanal/mensal
- src/components/agenda/ - AllocationModal, TeamMemberModal, AgendaCalendar, CaptureDaysBalance
- src/hooks/useTeamMembers.ts, useJobAllocations.ts, useGoogleTokens.ts
- supabase/functions/google-auth-callback/ - OAuth callback
- supabase/functions/google-calendar-sync/ - calendar event CRUD
