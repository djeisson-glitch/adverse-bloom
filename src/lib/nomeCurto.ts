/**
 * Nome de peça e de projeto sem o que já está escrito em volta.
 *
 * A lista de Entregas do mês já agrupa POR CLIENTE, e mesmo assim cada linha
 * repetia o cliente inteiro no fim do nome:
 *
 *   Sicredi Sul Minas RS/MG
 *     #20260907_VIDEO_PAULO_HERRMANN_SUL_MINAS   ← "SUL MINAS" de novo
 *       PÓS | Vídeo Paulo Herrmann Sul Minas     ← e mais uma vez
 *
 * Some "vídeo", que é redundante numa produtora de vídeo, e sobra pouca
 * informação em muito texto — o nome estoura a coluna e o que distingue uma
 * peça da outra fica no fim, cortado por reticências.
 *
 * "FOTOS" NUNCA sai. É a exceção que prova a regra: numa produtora de vídeo,
 * "vídeo" é ruído e "fotos" é justamente o aviso de que aquela peça é outra
 * coisa. Cortar seria apagar a única informação da palavra.
 *
 * Nada disto é retroativo: vale de quem for criado daqui pra frente. Renomear
 * 199 projetos existentes quebraria busca, pasta de DaVinci e a memória de
 * quem procura pelo nome que sempre viu.
 */

/** "PÓS | ", "PROD | "… — o prefixo que diz a frente de trabalho. */
const PREFIXO = /^\s*(PÓS|POS|PROD|DESL)\s*[|｜]\s*/i;

/** Palavra que some por não dizer nada aqui dentro. */
const RUIDO = /^(video|videos)$/;

/** Palavra que nunca some, mesmo se aparecer no nome do cliente. */
const PROTEGIDA = /^(foto|fotos|fotografia|fotografias)$/;

/** Ligação sem valor de busca — não vale como "parte do nome do cliente". */
const LIGACAO = new Set(["de", "da", "do", "das", "dos", "e", "em", "a", "o", "as", "os"]);

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/**
 * Tokens do nome do cliente que valem como "parte do nome".
 *
 * Sai o que é ligação e o que tem 1 letra. Fica sigla de estado (RS, MG, SC),
 * que tem 2 e aparece no fim de quase todo nome daqui.
 */
export function tokensDoCliente(cliente?: string | null): Set<string> {
  const t = new Set<string>();
  for (const bruto of semAcento(cliente || "").split(/[^a-z0-9]+/)) {
    if (bruto.length >= 2 && !LIGACAO.has(bruto)) t.add(bruto);
  }
  return t;
}

/**
 * Tira do nome o que o contexto já diz: o cliente e a palavra "vídeo".
 *
 * Preserva o separador original (`_` em nome de projeto, espaço em nome de
 * peça) pra não trocar a convenção de nomenclatura por um efeito colateral.
 * Devolve o nome ORIGINAL quando a limpeza não sobraria nada de útil — nome
 * vazio é pior que nome comprido.
 */
export function encurtarNome(nome: string, cliente?: string | null): string {
  const original = (nome || "").trim();
  if (!original) return original;

  const doCliente = tokensDoCliente(cliente);
  // O separador dominante manda: nome de projeto usa "_", nome de peça usa " ".
  const sep = (original.match(/_/g)?.length || 0) > (original.match(/ /g)?.length || 0) ? "_" : " ";

  const partes = original.split(/([_\s]+)/);   // mantém os separadores na lista
  const mantidas: string[] = [];

  for (const parte of partes) {
    if (/^[_\s]+$/.test(parte) || parte === "") continue;
    const chave = semAcento(parte).replace(/[^a-z0-9]/g, "");
    if (!chave) { mantidas.push(parte); continue; }
    if (PROTEGIDA.test(chave)) { mantidas.push(parte); continue; }
    if (RUIDO.test(chave)) continue;
    if (doCliente.has(chave)) continue;
    mantidas.push(parte);
  }

  // Só sobrou pontuação (ou nada): a limpeza comeu o nome inteiro — devolve o
  // original. Acontece com peça chamada só "Vídeo", por exemplo.
  const limpo = mantidas.join(sep).replace(/^[-–—_\s.:,]+|[-–—_\s.:,]+$/g, "");
  if (!limpo || !/[a-z0-9]/i.test(limpo)) return original;
  return limpo;
}

/**
 * Nome final da peça: "PÓS | " + nome sem redundância.
 *
 * O prefixo entra sozinho porque hoje é digitado à mão — e quando alguém
 * esquece, a peça não agrupa com as irmãs e some do padrão de pasta. Se já
 * veio um prefixo (PÓS, PROD, DESL), o que veio é respeitado.
 */
export function nomeDeEntregavel(titulo: string, cliente?: string | null): string {
  const bruto = (titulo || "").trim();
  if (!bruto) return bruto;

  const prefixo = bruto.match(PREFIXO)?.[0];
  const corpo = encurtarNome(bruto.replace(PREFIXO, ""), cliente);
  if (!corpo) return bruto;

  // Normaliza o prefixo que veio ("pós |", "POS|") pra forma única.
  const marca = prefixo ? semAcento(prefixo).replace(/[^a-z]/g, "").toUpperCase() : "POS";
  const rotulo = marca === "POS" ? "PÓS" : marca;
  return `${rotulo} | ${corpo}`;
}

/** Nome de projeto sem o cliente repetido — o prefixo/código não é tocado. */
export function nomeDeProjeto(nome: string, cliente?: string | null): string {
  return encurtarNome(nome, cliente);
}
