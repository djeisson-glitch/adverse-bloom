import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

// =========================================================================
// push-enviar — empurra notificações pro navegador (Web Push).
//
//  DOIS MODOS:
//   • imediato (padrão) — só NÍVEL 1. Chamado pelo gatilho na hora em que a
//     notificação nasce, e pelo cron de 2 min como rede de segurança.
//   • digest            — só NÍVEL 2. Chamado de hora em hora; o SQL decide
//     de quem é a vez (cada pessoa escolhe seus horários). Manda UM push
//     resumo por pessoa em vez de um por evento.
//
//  Quem tem direito de sair é decidido no SQL (notif_pendentes_*), que já
//  aplica nível + preferência da pessoa + não-perturbe. Aqui só sobra o
//  filtro que depende de olhar o conjunto: AGRUPAR o que é do mesmo grupo,
//  pra 5 alterações no mesmo projeto virarem 1 balão e não 5.
//
//  Web Push é de graça: o envio vai pelos servidores do próprio navegador
//  (FCM/Mozilla/Apple), autenticado com as chaves VAPID.
//
//  Assinatura morta (404/410) é apagada na hora — senão a gente insiste
//  eternamente num navegador que não existe mais.
// =========================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Pendente = {
  id: string; user_id: string; tipo: string; titulo: string; corpo: string | null;
  link: string | null; nivel: number; group_key: string | null; rotulo: string;
  push_tentativas: number;
};

/** Um balão de notificação já pronto pra enviar, com as linhas que ele fecha. */
type Balao = { user_id: string; titulo: string; corpo: string; link: string; tag: string; nivel: number; ids: string[] };

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

    let modo = "imediato";
    try {
      const body = await req.json();
      if (body?.modo === "digest") modo = "digest";
    } catch { /* sem body = imediato */ }

    const { data: pendentes, error } = modo === "digest"
      ? await admin.rpc("notif_pendentes_digest", { _limite: 500 })
      : await admin.rpc("notif_pendentes_push", { _limite: 100 });

    if (error) {
      console.error("erro lendo notificações:", error);
      return json({ error: "Erro ao ler notificações." }, 500);
    }
    const lista = (pendentes || []) as Pendente[];
    if (!lista.length) return json({ ok: true, modo, enviadas: 0 });

    const baloes = modo === "digest" ? montarResumos(lista) : montarAgrupados(lista);

    // Assinaturas dos destinatários (uma pessoa pode ter vários navegadores).
    const userIds = [...new Set(lista.map((n) => n.user_id))];
    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("id, user_id, endpoint, p256dh, auth")
      .in("user_id", userIds);

    const porUsuario = new Map<string, any[]>();
    for (const s of subs || []) {
      const l = porUsuario.get(s.user_id) || [];
      l.push(s);
      porUsuario.set(s.user_id, l);
    }
    const tentativasPorId = new Map(lista.map((n) => [n.id, n.push_tentativas || 0]));

    let enviadas = 0;
    const mortas: string[] = [];
    const marcar: string[] = [];                                  // fecha (entregou ou não há o que tentar)
    const reagendar: { id: string; tentativas: number }[] = [];    // falha transitória → tenta de novo

    for (const b of baloes) {
      const alvos = porUsuario.get(b.user_id) || [];
      // Sem navegador registrado? Fecha: já está no sino, não adianta reter
      // esperando uma assinatura que não existe.
      if (alvos.length === 0) {
        marcar.push(...b.ids);
        continue;
      }

      const payload = JSON.stringify({
        titulo: b.titulo,
        corpo: b.corpo,
        link: b.link,
        // Tag única por balão. Com a tag pelo tipo, a 2ª substituía a 1ª em
        // SILÊNCIO — "funcionou uma vez e depois não".
        tag: b.tag,
        prioridade: b.nivel === 1 ? "critico" : "importante",
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
            sobrouVivo = true;   // rede, 5xx, timeout — transitório
            console.error("push falhou:", code, e?.body || e?.message);
          }
        }
      }

      // Só fecha se entregou a alguém OU se os que falharam estavam todos
      // mortos. Se sobrou alvo vivo com erro transitório, mantém pendente e
      // conta a tentativa — senão a falha some sem ninguém ver.
      if (algumOk || !sobrouVivo) marcar.push(...b.ids);
      else for (const id of b.ids) reagendar.push({ id, tentativas: (tentativasPorId.get(id) || 0) + 1 });
    }

    if (marcar.length) {
      await admin.from("notificacoes").update({ push_em: new Date().toISOString() }).in("id", marcar);
    }
    // Conta a tentativa dos que ficaram pendentes (o limite de 5 está no SQL:
    // depois disso para de tentar — já está no sino de qualquer forma).
    for (const r of reagendar) {
      await admin.from("notificacoes").update({ push_tentativas: r.tentativas }).eq("id", r.id);
    }
    if (mortas.length) {
      await admin.from("push_subscriptions").delete().in("id", mortas);
    }

    return json({
      ok: true,
      modo,
      baloes: baloes.length,
      linhas: lista.length,
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

/**
 * NÍVEL 1 — um balão por (pessoa, group_key). Quando caem várias do mesmo
 * grupo na mesma janela (a enxurrada que o time reclamava), vira uma só:
 * "3 × Cliente pediu alteração" em vez de três balões iguais.
 */
function montarAgrupados(lista: Pendente[]): Balao[] {
  const grupos = new Map<string, Pendente[]>();
  for (const n of lista) {
    const chave = `${n.user_id}|${n.group_key || n.id}`;
    const g = grupos.get(chave) || [];
    g.push(n);
    grupos.set(chave, g);
  }

  return [...grupos.values()].map((g) => {
    const nova = g[g.length - 1];   // vem ordenado por created_at
    if (g.length === 1) {
      return {
        user_id: nova.user_id, titulo: nova.titulo, corpo: nova.corpo || "",
        link: nova.link || "/notificacoes", tag: nova.id, nivel: nova.nivel, ids: [nova.id],
      };
    }
    return {
      user_id: nova.user_id,
      titulo: `${g.length} × ${nova.rotulo}`,
      corpo: `${nova.corpo || nova.titulo} · e mais ${g.length - 1}`,
      link: nova.link || "/notificacoes",
      tag: nova.group_key || nova.id,
      nivel: nova.nivel,
      ids: g.map((n) => n.id),
    };
  });
}

/**
 * NÍVEL 2 — UM balão por pessoa, com a contagem por tipo:
 * "3 novas tarefas · 2 esperando seu ok". Leva pra central, não pro item.
 */
function montarResumos(lista: Pendente[]): Balao[] {
  const porUsuario = new Map<string, Pendente[]>();
  for (const n of lista) {
    const l = porUsuario.get(n.user_id) || [];
    l.push(n);
    porUsuario.set(n.user_id, l);
  }

  return [...porUsuario.entries()].map(([user_id, ns]) => {
    const contagem = new Map<string, number>();
    for (const n of ns) contagem.set(n.rotulo, (contagem.get(n.rotulo) || 0) + 1);

    const partes = [...contagem.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([rotulo, n]) => `${n} × ${rotulo}`);

    // Uma só? Não vale chamar de "resumo" — manda ela mesma, com o link certo.
    if (ns.length === 1) {
      return {
        user_id, titulo: ns[0].titulo, corpo: ns[0].corpo || "",
        link: ns[0].link || "/notificacoes", tag: ns[0].id, nivel: 2, ids: [ns[0].id],
      };
    }
    return {
      user_id,
      titulo: `${ns.length} novidades no Adverse OS`,
      corpo: partes.join(" · "),
      link: "/notificacoes",
      // Tag por janela: o resumo das 14h não apaga o das 9h em silêncio.
      tag: `resumo:${user_id}:${new Date().toISOString().slice(0, 13)}`,
      nivel: 2,
      ids: ns.map((n) => n.id),
    };
  });
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
