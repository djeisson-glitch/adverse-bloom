/**
 * Nome normalizado no padrão de código da casa: sem acento, maiúsculo,
 * separado por underscore — `[0300]_LANCAMENTO_ATIVO_FINANCEIRO`.
 *
 * Quem carimba de verdade é o banco (normalizar_nome_projeto, nos triggers de
 * deals e projects). Aqui é só pra MOSTRAR o resultado antes de salvar: as
 * duas implementações têm que dar a mesma saída, senão a tela promete um
 * código e o sistema grava outro.
 */
export function nomeCodigo(txt: string): string {
  return (txt || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")   // tira os acentos separados pelo NFD
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Tira o prefixo entre colchetes — `[0300]_X` e o antigo `[CLIENTE] X`. */
export function semPrefixoCodigo(nome: string): string {
  return (nome || "").replace(/^\s*\[[^\]]*\]\s*_?\s*/, "");
}
