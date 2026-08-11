/**
 * O nome padrão: o que vai pro DaVinci, pra pasta, pro Mac e pro Windows.
 *
 *   projeto     [0318][LITROS_DE_VANTAGEM]
 *   entregável  [ADVR-4036][SPOT_DE_RADIO_01_FILME_MAE][16X9][V1]
 *
 * UM padrão só nos dois lugares, decidido em 11/08/2026 — antes havia "Nome
 * cru" no projeto e "Nome DaVinci" no entregável, e dois nomes pra mesma
 * ideia é como uma convenção se perde.
 *
 * O que sai, e por quê:
 *   · acento  — o Mac grava NFD e o Windows NFC; o mesmo "Promoção" vira dois
 *               nomes diferentes byte a byte e o link quebra na volta;
 *   · espaço  — quebra caminho em script e link sem aspas;
 *   · | : * ? " < > \ /  — o Windows PROÍBE. O pipe é o caso real deste
 *               acervo, que tem "PÓS | Promoção" às dezenas.
 *
 * O que FICA:
 *   · colchete — válido nos dois sistemas, e é o que deixa o nome legível em
 *                blocos. Djêisson tinha razão ao pedir de volta: eu o havia
 *                tirado alegando quebra de caminho, o que era impreciso —
 *                colchete só atrapalha em glob de shell;
 *   · o hífen do código (ADVR-4036) — ele é o código, não pontuação de texto.
 *
 * Espelha `public.nome_padrao()` no banco, que gera `projects.nome_padrao` e
 * `deliverables.nome_padrao`. A cópia existe porque o botão precisa refletir
 * o que está NA TELA, inclusive edição ainda não salva. Os testes travam as
 * duas pontas.
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
 * Monta o nome em blocos, pulando os vazios: `[a][b][c]`.
 *
 * O bloco separa sozinho — sem espaço nem underscore entre eles. Pular vazio
 * é o que evita `[ADVR-4001][TESTE][][V1]` numa peça sem formato: bloco vazio
 * não é placeholder, é sujeira.
 */
export function emBlocos(...blocos: (string | null | undefined)[]): string {
  return blocos
    .map((b) => (b || "").trim())
    .filter(Boolean)
    .map((b) => `[${b}]`)
    .join("");
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

/** `[0318][LITROS_DE_VANTAGEM]` — o nome padrão do projeto. */
export function nomeProjetoPadrao(numero: string | null | undefined, name: string | null | undefined): string {
  // Tira o prefixo `[0318] ` (ou `[0318]_`, do formato antigo) pra o número
  // não aparecer duas vezes.
  const semCodigo = (name || "").replace(/^\[[0-9]{4}\][_ ]?/, "");
  return emBlocos(numero, cru(semCodigo));
}

/**
 * `[ADVR-4036][SPOT_DE_RADIO_01_FILME_MAE][16X9][V1]` — o do entregável.
 *
 * O prefixo interno ("PÓS | ") sai, como já saía: ele contava como palavra e
 * empurrava pra fora o fim do nome, que é justamente o que distingue uma peça
 * da outra.
 */
export function nomeDaVinci(
  codigo: string | null | undefined,
  titulo: string | null | undefined,
  formato?: string | null,
  versao = "V1",
): string {
  const nome = cru((titulo || "").replace(/^\s*(PÓS|POS|PROD|DESL)\s*\|\s*/i, ""));
  return emBlocos((codigo || "").trim(), nome, formatoCru(formato), versao);
}
