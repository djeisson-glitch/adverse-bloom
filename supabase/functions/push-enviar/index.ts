import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

// =========================================================================
// push-enviar — empurra as notificações pendentes pro navegador (Web Push).
//
//  Chamado pelo pg_cron a cada 2 min. Pega o que ainda não saiu
//  (push_em IS NULL) e tem prioridade critico/importante — "info" fica só no
//  sino e entra no digest da manhã.
//
//  Web Push é de graça: o envio vai pelos servidores do próprio navegador
//  (FCM/Mozilla/Apple), autenticado com as chaves VAPID. Sem Twilio, sem Resend.
//
//  Assinatura morta (404/410) é apagada na hora — senão a gente insiste
//  eternamente num navegador que não existe mais.
// =========================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const pub = Deno.env.get("VAPID_PUBLIC_KEY");
    const priv = Deno.env.get("VAPID_PRIVATE_KEY");
    const subject = Deno.env.get("VAPID_SUBJECT") || "mailto:djeisson@adverse.rec.br";
    if (!pub || !priv) {
      return json({ error: "Faltam as chaves VAPID (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY)." }, 503);
    }
    webpush.setVapidDetails(subject, pub, priv);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const MAX_TENTATIVAS = 5;   // depois disso desiste: já está no sino de qualquer forma

    const { data: pendentes, error } = await admin
      .from("notificacoes")
      .select("id, user_id, tipo, prioridade, titulo, corpo, link, push_tentativas")
      .is("push_em", null)
      .lt("push_tentativas", MAX_TENTATIVAS)
      .in("prioridade", ["critico", "importante"])
      .order("created_at", { ascending: true })
      .limit(100);

    if (error) {
      console.error("erro lendo notificações:", error);
      return json({ error: "Erro ao ler notificações." }, 500);
    }
    if (!pendentes?.length) return json({ ok: true, enviadas: 0 });

    // Assinaturas dos destinatários (uma pessoa pode ter vários navegadores).
    const userIds = [...new Set(pendentes.map((n: any) => n.user_id))];
    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("id, user_id, endpoint, p256dh, auth")
      .in("user_id", userIds);

    const porUsuario = new Map<string, any[]>();
    for (const s of subs || []) {
      const lista = porUsuario.get(s.user_id) || [];
      lista.push(s);
      porUsuario.set(s.user_id, lista);
    }

    let enviadas = 0;
    const mortas: string[] = [];
    const marcar: string[] = [];     // deu certo (ou não há o que tentar) → fecha
    const reagendar: { id: string; tentativas: number }[] = [];  // falha transitória → tenta de novo

    for (const n of pendentes as any[]) {
      const alvos = porUsuario.get(n.user_id) || [];
      // Sem navegador registrado? Fecha: ela já está no sino, não adianta
      // reter esperando uma assinatura que não existe.
      if (alvos.length === 0) {
        marcar.push(n.id);
        continue;
      }

      const payload = JSON.stringify({
        titulo: n.titulo,
        corpo: n.corpo || "",
        link: n.link || "/notificacoes",
        tipo: n.tipo,
        prioridade: n.prioridade,
      });

      let algumOk = false;
      let sobrouVivo = false;   // alvo que falhou mas não está morto → vale re-tentar
      for (const s of alvos) {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
          );
          enviadas++;
          algumOk = true;
        } catch (e: any) {
          const code = e?.statusCode;
          if (code === 404 || code === 410) {
            mortas.push(s.id);   // navegador desinstalou / permissão revogada
          } else {
            sobrouVivo = true;   // rede, 5xx, timeout — transitório, tenta de novo
            console.error("push falhou:", code, e?.body || e?.message);
          }
        }
      }

      // Só fecha a notificação se entregou a alguém OU se os que falharam
      // estavam todos mortos (nada vivo pra re-tentar). Se sobrou alvo vivo que
      // deu erro transitório, deixa pendente e conta a tentativa — antes isso
      // era marcado como "enviada" e a falha sumia sem ninguém ver.
      if (algumOk || !sobrouVivo) marcar.push(n.id);
      else reagendar.push({ id: n.id, tentativas: (n.push_tentativas || 0) + 1 });
    }

    if (marcar.length) {
      await admin.from("notificacoes").update({ push_em: new Date().toISOString() }).in("id", marcar);
    }
    // Conta a tentativa dos que ficaram pendentes (o MAX_TENTATIVAS no SELECT
    // é o freio: depois de 5 ciclos falhos, para de tentar).
    for (const r of reagendar) {
      await admin.from("notificacoes").update({ push_tentativas: r.tentativas }).eq("id", r.id);
    }
    if (mortas.length) {
      await admin.from("push_subscriptions").delete().in("id", mortas);
    }

    return json({
      ok: true,
      fechadas: marcar.length,
      reagendadas: reagendar.length,
      enviadas,
      assinaturas_removidas: mortas.length,
    });
  } catch (e) {
    console.error("push-enviar error:", e);
    return json({ error: e instanceof Error ? e.message : "Erro desconhecido" }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
