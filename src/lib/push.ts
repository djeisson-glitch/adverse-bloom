import { supabase } from "@/integrations/supabase/client";

/**
 * Web Push — notificação na área de trabalho, mesmo com o site FECHADO.
 *
 * Como funciona: o navegador registra uma "assinatura" (endpoint + chaves) nos
 * servidores dele (FCM/Mozilla/Apple). A gente guarda essa assinatura e a edge
 * function `push-enviar` manda a mensagem pra lá, assinada com VAPID. Não passa
 * por Twilio/Resend — e não custa nada.
 *
 * Requer VITE_VAPID_PUBLIC_KEY (a pública; a privada fica só no servidor).
 */

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export const pushSuportado = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

export const pushConfigurado = () => !!VAPID_PUBLIC;

export const permissaoAtual = (): NotificationPermission =>
  typeof Notification === "undefined" ? "default" : Notification.permission;

/** base64url -> Uint8Array (formato que o PushManager exige) */
function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/**
 * Pede permissão, registra o service worker, assina o push e guarda no banco.
 * Devolve true se ficou tudo pronto.
 */
export async function ativarPush(): Promise<{ ok: boolean; motivo?: string }> {
  if (!pushSuportado()) return { ok: false, motivo: "Este navegador não suporta notificações." };
  if (!VAPID_PUBLIC) return { ok: false, motivo: "Falta a chave VAPID pública (VITE_VAPID_PUBLIC_KEY)." };

  const permissao = await Notification.requestPermission();
  if (permissao !== "granted") {
    return { ok: false, motivo: "Você bloqueou as notificações. Libere nas permissões do site." };
  }

  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  // Reaproveita a assinatura se já existir (evita duplicar por dispositivo).
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
    });
  }

  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    return { ok: false, motivo: "Não consegui registrar a assinatura do push." };
  }

  const { data: userData } = await supabase.auth.getUser();
  const uid = userData?.user?.id;
  if (!uid) return { ok: false, motivo: "Sessão expirada." };

  const { error } = await (supabase as any).from("push_subscriptions").upsert(
    {
      user_id: uid,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      user_agent: navigator.userAgent,
    },
    { onConflict: "endpoint" },
  );
  if (error) {
    return {
      ok: false,
      motivo: /notificacoes|push_subscriptions|relation/i.test(error.message || "")
        ? "Rode 'supabase db push' pra habilitar as notificações."
        : error.message,
    };
  }
  return { ok: true };
}

/** Desliga neste navegador (some a assinatura daqui e do banco). */
export async function desativarPush() {
  if (!pushSuportado()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    await (supabase as any).from("push_subscriptions").delete().eq("endpoint", endpoint);
  }
}

/** Já está assinado neste navegador? */
export async function pushAtivo(): Promise<boolean> {
  if (!pushSuportado() || permissaoAtual() !== "granted") return false;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return !!sub;
}
