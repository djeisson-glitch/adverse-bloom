/**
 * O nome "cru": o que vai pro DaVinci, pra pasta, pro Mac e pro Windows.
 *
 * Djêisson (11/08/2026): "permitir acentos e pontuações [no cadastro], mas
 * quando a gente for copiar o nome pra usar no davinci e em outros lugares,
 * deixar sempre sem, cru mesmo, para que não tenhamos problemas com acentos,
 * espaços e etc, principalmente entre mac e windows."
 *
 * O que sai, e por quê:
 *   · acento  — o Mac grava NFD e o Windows NFC; o mesmo "Promoção" vira dois
 *               nomes diferentes byte a byte, e o link quebra na volta;
 *   · espaço  — quebra caminho em script/shell sem aspas;
 *   · [ ] | : — colchete e pipe são metacaracteres; ":" é proibido no Windows
 *               e vira "/" no Mac.
 *
 * Espelha `public.normalizar_nome_projeto()`. O banco é a fonte da verdade —
 * `projects.nome_cru` e `deliverables.nome_cru` são colunas geradas por lá.
 * Esta cópia existe pro que o banco não tem: a composição do nome de timeline
 * do DaVinci, que leva formato e versão.
 */

/** Sem acento, sem pontuação, MAIÚSCULO, separado por `_`. */
export function cru(texto: string | null | undefined): string {
  return (texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")   // tira os acentos separados pelo NFD
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")       // tudo que não é letra/número vira _
    .replace(/^_+|_+$/g, "");          // sem _ nas pontas
}

/**
 * "16×9", "16 X 9", "9:16" → "16X9" / "9X16".
 *
 * O espaço é colapsado ANTES de normalizar: no formato ele é digitação, não
 * separador de palavra — sem isso "16 X 9" viraria "16_X_9".
 */
export function formatoCru(formato: string | null | undefined): string {
  return cru((formato || "").replace(/[×:]/g, "x").replace(/\s+/g, ""));
}

/**
 * Nome de timeline/pasta do DaVinci: código, nome, formato e versão.
 *
 *   ADVR-4036_SPOT_DE_RADIO_01_FILME_MAE_16X9_V1
 *
 * O hífen do código FICA: ele é o código, não pontuação de texto — e é o que
 * deixa o nome rastreável até o job. O prefixo interno ("PÓS | ") sai, como
 * já saía: ele contava como palavra e empurrava pra fora o fim do nome, que é
 * justamente o que distingue uma peça da outra.
 */
export function nomeDaVinciCru(
  codigo: string | null | undefined,
  titulo: string | null | undefined,
  formato?: string | null,
  versao = "V1",
): string {
  const cod = (codigo || "").trim();
  const nome = cru((titulo || "").replace(/^\s*(PÓS|POS|PROD|DESL)\s*\|\s*/i, ""));
  return [cod, nome, formatoCru(formato), versao].filter(Boolean).join("_");
}
