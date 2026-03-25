Proposal letter module: generates public client-facing proposals from budgets with approval flow

## Tables
- proposal_letters: budget_id (FK budgets), token (unique hex), template_type (completa/reduzida), contact_name, contact_company, project_description, tags (text[]), deliverables (jsonb), payment_conditions, validity_days, approval fields (approved_name/email/ip/at), status (pending/approved/expired)

## Edge Functions
- get-proposal: fetches proposal + budget + items by token (public, no auth)
- approve-proposal: records name/email/IP/timestamp, updates budget status to approved

## Routes
- /proposta/:token — public page (no auth), renders HTML proposal with Barlow font, #0a0a0a bg, #e8281e red accent, #f0ebe3 beige text
- Uses inline styles (not tailwind) to match reference HTML design

## Flow
1. Budget dropdown → "Gerar proposta" → GenerateProposalModal
2. Fill: contact name, company, description, tags, deliverables, payment conditions, validity
3. Choose template: completa (with company presentation) or reduzida (scope+value only)
4. Generates token → shows copyable link + WhatsApp share button
5. Client opens link → sees proposal → fills name+email → clicks Aprovar
6. Budget status updates to "approved", approval data recorded

## RLS
- Authenticated: full CRUD
- Anon: can SELECT (view proposals) and UPDATE pending→approved (approve)
