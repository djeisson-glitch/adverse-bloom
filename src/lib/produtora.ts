/**
 * Identidade da produtora nos documentos que saem pro cliente.
 *
 * Um lugar só: a carta e o PDF do orçamento liam disso separado, e o PDF
 * estava com o domínio ERRADO (adverse.com.br em vez de adverse.rec.br) —
 * indo assim pro cliente. Constante duplicada é constante que diverge.
 */
export const PRODUTORA = {
  wordmark: "adverse.rec",
  nome: "Adverse",
  descricao: "Produtora audiovisual",
  site: "adverse.rec.br",
  // Proposta é assinada por quem responde comercialmente.
  email: "djeisson@adverse.rec.br",
};

/**
 * Nome do arquivo quando o cliente salva a proposta em PDF.
 *
 * O Chrome usa o `document.title` como nome sugerido — sem mexer nele, o
 * anexo chega na caixa do cliente como "Adverse OS.pdf", indistinguível de
 * qualquer outro. Com o código do projeto na frente, o arquivo se explica
 * sozinho na pasta de downloads dele e na nossa.
 *
 * O título do deal já vem no padrão [XXXX]_NOME; quando não vier, o número
 * entra na frente.
 */
export function nomeArquivoProposta(titulo?: string | null, numero?: string | number | null): string {
  const base = (titulo || "Proposta").trim();
  const num = numero != null && String(numero).trim() ? String(numero).trim() : "";
  const comCodigo = num && !base.includes(num) ? `[${num}] ${base}` : base;
  // Barra e dois-pontos viram nome de pasta ou quebram o download no Finder.
  return `${comCodigo} - Proposta Adverse`.replace(/[/\\:*?"<>|]+/g, "-");
}
