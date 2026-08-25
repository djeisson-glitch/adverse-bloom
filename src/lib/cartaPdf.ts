/**
 * Baixa a carta como PDF ESCURO, gerado pelo servidor.
 *
 * A alternativa seria `window.print()`, mas o tema escuro no papel depende de
 * "Gráficos de segundo plano", que vem DESMARCADO no Chrome: quem esquecesse
 * mandaria uma proposta quase em branco pro cliente sem perceber. Aqui o
 * fundo é decidido no servidor — ver api/carta-pdf.ts.
 *
 * O que sobe é o HTML que o navegador JÁ renderizou mais o CSS do próprio
 * app. A fidelidade é por construção: mesmo DOM, mesmo CSS, mesmo motor. Se
 * fosse um segundo layout no servidor, ele sairia do lugar na primeira vez
 * que alguém mexesse na carta.
 */
import { supabase } from "@/integrations/supabase/client";
import { CARTA_STYLE, CARTA_PDF_ESCURO_STYLE } from "@/components/CartaDocumento";

/** Junta o CSS compilado do app — é dele que vêm as classes do Tailwind. */
async function cssDoApp(): Promise<string> {
  const hrefs = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'))
    .map((l) => l.href)
    .filter((h) => h.startsWith(window.location.origin));
  const partes = await Promise.all(
    hrefs.map((h) => fetch(h).then((r) => (r.ok ? r.text() : "")).catch(() => "")),
  );
  return partes.join("\n");
}

export type ResultadoPdf = { ok: boolean; motivo?: string };

/**
 * Devolve `ok:false` em vez de estourar: quem chama cai no window.print(),
 * que ainda entrega um PDF (claro). Ficar sem nenhum PDF na hora de mandar
 * proposta é pior que um PDF fora do tema.
 */
export async function baixarCartaPdf(nomeArquivo: string): Promise<ResultadoPdf> {
  const doc = document.querySelector(".carta-doc");
  if (!doc) return { ok: false, motivo: "carta não encontrada na tela" };

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, motivo: "sessão expirada" };

  let resposta: Response;
  try {
    resposta = await fetch("/api/carta-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        corpo: doc.outerHTML,
        css: await cssDoApp(),
        style: CARTA_STYLE,
        extra: CARTA_PDF_ESCURO_STYLE,
        nome: nomeArquivo,
      }),
    });
  } catch (e: any) {
    return { ok: false, motivo: String(e?.message || e) };
  }

  if (!resposta.ok) {
    const t = await resposta.text().catch(() => "");
    return { ok: false, motivo: `servidor respondeu ${resposta.status} ${t.slice(0, 120)}` };
  }

  const blob = await resposta.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nomeArquivo}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Sem o revoke o blob fica na memória da aba até recarregar.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return { ok: true };
}
