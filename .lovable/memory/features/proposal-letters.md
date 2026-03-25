Proposal letter module: generates public client-facing proposals from budgets with approval flow

## Tables
- proposal_letters: budget_id (FK budgets), token (unique hex), template_type (completa/reduzida), contact_name, contact_company, project_description, tags (text[]), deliverables (jsonb), payment_conditions, validity_days, approval fields (approved_name/email/ip/at), status (pending/approved/expired)

## Edge Functions
- get-proposal: fetches proposal + budget + items by token (public, no auth)
- approve-proposal: records name/email/IP/timestamp, updates budget status to approved
- generate-proposal-description: AI generates project description; capture days = Math.max of PRODUÇÃO client_days (parallel pros), never sum; logistics excluded from description

## Routes
- /proposta/:token — public page (no auth), renders HTML proposal with Barlow font, #0a0a0a bg, #e8281e red accent, #f0ebe3 beige text
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
- PÓS-PRODUÇÃO: shows ONLY is_deliverable items (hides internal items like "Edição hora")
- LOGÍSTICA: excluded entirely (internal cost, not shown to client)

## Modal Pre-fill
- When re-opening modal for same budget, loads data from latest proposal_letter
- Contact name auto-filled from deal's client (trade_name or name) if budget has deal_id
- All fields persisted: contact, company, description, tags, deliverables, payment conditions, validity

## Flow
1. Budget dropdown → "Gerar proposta" → GenerateProposalModal
2. Fill: contact name, company, description, tags, deliverables, payment conditions, validity
3. Generates token → shows copyable link + WhatsApp share button
4. Client opens link → sees proposal → fills name+email → clicks Aprovar
5. Budget status updates to "approved", approval data recorded

## Footer
- Email: djeisson@adverse.rec.br
- Phone: +55 (54) 99637-8692
- City: Passo Fundo, RS

## RLS
- Authenticated: full CRUD
- Anon: can SELECT (view proposals) and UPDATE pending→approved (approve)
