Proposal letter module: generates public client-facing proposals from budgets with approval flow

## Tables
- proposal_letters: budget_id (FK budgets), token (unique hex), template_type (completa/reduzida), contact_name, contact_company, project_description, tags (text[]), deliverables (jsonb), payment_conditions, validity_days, approval fields (approved_name/email/ip/at), status (pending/approved/expired), viewed_at (timestamp, set on first client view)

## Edge Functions
- get-proposal: fetches proposal + budget + items by token (public, no auth); records viewed_at on first view
- approve-proposal: records name/email/IP/timestamp, updates budget status to approved, sends WhatsApp notification
- generate-proposal-description: AI generates project description; capture days = Math.max of PRODUÇÃO client_days (parallel pros), never sum; logistics excluded from description

## Routes
- /proposta/:token — public page (no auth), renders HTML proposal with Barlow font, #0a0a0a bg, #e8281e red accent, #f0ebe3 beige text
- /proposta/preview — preview mode, loads data from sessionStorage, shows banner "Pré-visualização", no approval form
- Uses inline styles (not tailwind) to match reference HTML design

## Template
- Only "reduzida" template available (completa removed)
- Reduzida = escopo + valor, no company presentation

## Deliverables Rules
- Only items from PÓS-PRODUÇÃO category marked as is_deliverable appear as entregas
- Items from PRODUÇÃO, LOGÍSTICA and other categories are NOT shown as deliverables
- Description is manually entered per deliverable in the modal (e.g. "1 vídeo — 16x9 para LinkedIn")

## Scope Section (Public Proposal)
- PRODUÇÃO: shows all items with client_price > 0
- PÓS-PRODUÇÃO: shows all items with client_price > 0
- LOGÍSTICA: excluded entirely (internal cost, not shown to client)

## Modal Pre-fill
- When re-opening modal for same budget, loads data from latest proposal_letter
- Contact name auto-filled from deal's client (trade_name or name) if budget has deal_id
- All fields persisted: contact, company, description, tags, deliverables, payment conditions, validity

## Snapshot Behavior
- Each generated link is a snapshot — editing the budget does NOT update previously sent links
- To update the client, user must generate a new link consciously
- When regenerating, previous pending links are expired (status → expired)
- Warning dialog shown before regenerating when active link exists

## Proposal Status Tracking
- Statuses shown on internal budget view: Não enviada → Link gerado → Visualizada → Aprovada
- Timeline component with timestamps for each event
- viewed_at recorded on first client access via get-proposal edge function

## Approval Data Display
- When proposal is approved, banner shows: name, email, timestamp, IP on BudgetViewTab
- Email validation (format check) required before client can submit approval

## Revert to Draft
- Button "Voltar para rascunho" on BudgetViewTab moves approved budget back to draft status
- Existing proposal links remain valid

## Preview
- "Pré-visualizar" button on BudgetViewTab and GenerateProposalModal
- Opens /proposta/preview in new tab using sessionStorage data
- Shows red banner "Pré-visualização — esta proposta não foi salva"
- Approval form hidden in preview mode

## Flow
1. Budget dropdown → "Gerar proposta" → GenerateProposalModal
2. Fill: contact name, company, description, tags, deliverables, payment conditions, validity
3. Preview button → opens proposal in new tab without saving
4. Generates token → shows copyable link + WhatsApp share button
5. If regenerating, warns about invalidating previous link
6. Client opens link → viewed_at recorded → sees proposal → fills name+email (validated) → clicks Aprovar
7. Budget status updates to "approved", approval data recorded + WhatsApp notification

## Footer
- Email: djeisson@adverse.rec.br
- Phone: +55 (54) 99637-8692
- City: Passo Fundo, RS

## RLS
- Authenticated: full CRUD
- Anon: can SELECT (view proposals) and UPDATE pending→approved (approve)
