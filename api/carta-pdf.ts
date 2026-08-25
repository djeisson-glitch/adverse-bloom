/**
 * Gera o PDF ESCURO da carta de orçamento.
 *
 * POR QUE ISTO EXISTE (e não é só `window.print()`):
 * o tema escuro da carta só sai no papel se "Gráficos de segundo plano"
 * estiver marcado no diálogo do Chrome — e ele vem DESMARCADO. Quem
 * exportasse sem marcar mandaria pro cliente um PDF praticamente em branco,
 * sem perceber, porque na tela dele estava tudo certo. Aqui o
 * `printBackground: true` é do servidor: não existe passo manual pra
 * esquecer.
 *
 * COMO: o navegador manda o HTML que ELE JÁ RENDERIZOU (o `.carta-doc`) mais
 * o CSS do próprio app. Assim a fidelidade é por construção — é o mesmo DOM,
 * o mesmo CSS, o mesmo motor. Não há um segundo layout pra sair do lugar.
 *
 * SEGURANÇA: um endpoint que renderiza HTML de terceiros num navegador é um
 * vetor clássico de SSRF — dá pra pedir que ele busque coisas que só o
 * servidor enxerga. Por isso, duas travas:
 *   1. exige sessão válida do Supabase (o mesmo login do sistema);
 *   2. a página nasce sem rede: toda requisição é abortada, menos as fontes
 *      do Google, que a identidade da carta precisa.
 */
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

export const config = { maxDuration: 60 };

/** Só o que a carta precisa buscar. Todo o resto é abortado. */
const HOSTS_LIBERADOS = ["fonts.googleapis.com", "fonts.gstatic.com"];

/**
 * Confere no Supabase se o token e' de uma sessao viva.
 *
 * Separa "token ruim" de "servidor mal configurado" de proposito: os dois
 * dariam 401, e quem clicasse no botao veria "sessao expirada" para sempre
 * sem ninguem descobrir que o que falta e' uma variavel de ambiente.
 */
async function usuarioValido(token: string | undefined): Promise<"ok" | "sem-token" | "sem-config"> {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return "sem-config";
  if (!token) return "sem-token";
  try {
    const r = await fetch(`${url}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: key },
    });
    return r.ok ? "ok" : "sem-token";
  } catch {
    return "sem-token";
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).json({ erro: "use POST" });

  const token = String(req.headers.authorization || "").replace(/^Bearer /i, "");
  const auth = await usuarioValido(token);
  if (auth === "sem-config") {
    // 500, nao 401: o problema e' do servidor, e dizer "sessao invalida" aqui
    // mandaria todo mundo procurar no lugar errado.
    return res.status(500).json({ erro: "servidor sem VITE_SUPABASE_URL/PUBLISHABLE_KEY" });
  }
  if (auth !== "ok") return res.status(401).json({ erro: "sessão inválida" });

  const { corpo, css, style, extra, nome } = req.body ?? {};
  if (!corpo || typeof corpo !== "string") {
    return res.status(400).json({ erro: "faltou o corpo da carta" });
  }

  // `pdf-escuro` no <html> é o que liga o tema escuro no @media print — ver
  // CARTA_PDF_ESCURO_STYLE em components/CartaDocumento.tsx.
  const pagina = `<!doctype html><html class="pdf-escuro"><head><meta charset="utf-8">
<style>${css ?? ""}</style><style>${style ?? ""}</style><style>${extra ?? ""}</style>
</head><body><div class="carta-root">${corpo}</div></body></html>`;

  let navegador;
  try {
    // O binario do @sparticuz/chromium e' Linux (Lambda). CHROME_LOCAL deixa
    // exercitar esta funcao inteira na maquina de quem desenvolve -- sem
    // isso ela so seria executada pela primeira vez em producao.
    const local = process.env.CHROME_LOCAL;
    navegador = await puppeteer.launch({
      args: local ? [] : chromium.args,
      executablePath: local || (await chromium.executablePath()),
      headless: true,
    });
    const pg = await navegador.newPage();

    await pg.setRequestInterception(true);
    pg.on("request", (r) => {
      const u = r.url();
      if (u.startsWith("data:")) return r.continue();
      try {
        if (HOSTS_LIBERADOS.includes(new URL(u).hostname)) return r.continue();
      } catch {
        /* URL torta: cai no abort abaixo */
      }
      r.abort();
    });

    // networkidle0 esperaria uma rede que foi cortada de propósito; o que
    // interessa é a fonte ter carregado antes de medir as linhas.
    await pg.setContent(pagina, { waitUntil: "domcontentloaded" });
    await pg.evaluate(() => document.fonts.ready);

    const pdf = await pg.pdf({ format: "A4", printBackground: true });

    const arquivo = String(nome || "proposta").replace(/[^\w.-]+/g, "_");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${arquivo}.pdf"`);
    return res.status(200).send(Buffer.from(pdf));
  } catch (e: any) {
    // A tela cai no window.print() quando isto falha — melhor um PDF claro
    // que nenhum.
    return res.status(500).json({ erro: String(e?.message || e) });
  } finally {
    await navegador?.close().catch(() => {});
  }
}
