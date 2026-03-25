Evolution API integration for WhatsApp notifications on proposal approval

## Config
- Secrets: EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE_NAME
- Notify number: 5554996378692 (hardcoded in approve-proposal edge function)
- Endpoint pattern: POST {EVOLUTION_API_URL}/message/sendText/{INSTANCE_NAME}
- Payload: { number, text }
- Auth header: apikey: {EVOLUTION_API_KEY}

## Flow
- Client approves proposal on public page → approve-proposal edge function
- After DB update, sends WhatsApp message with project name, budget number, value, approver name/email
- If Evolution API secrets not configured, silently skips (console.warn)
