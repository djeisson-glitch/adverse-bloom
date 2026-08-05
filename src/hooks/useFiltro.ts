import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Filtro que sobrevive à navegação.
 *
 * O caso que motivou: filtrar Entregas do mês, abrir um entregável pra
 * conferir, voltar — e a tela estar zerada de novo. Quem confere trinta peças
 * refazia o filtro trinta vezes.
 *
 * Guarda nos DOIS lugares, porque são duas formas de voltar:
 *
 *  • URL — o botão voltar do navegador restaura a query junto com a página, e
 *    o endereço fica compartilhável ("olha o fechamento de julho da Unimed").
 *  • sessionStorage — quando se chega pela navegação lateral, a URL vem limpa;
 *    aí vale o último filtro usado naquela tela, na mesma aba.
 *
 * Some quando a aba fecha, de propósito: filtro é contexto de trabalho, não
 * configuração. Amanhã de manhã ninguém quer a tela presa no mês passado.
 */
export function useFiltro<T extends string>(
  chave: string,
  padrao: T,
  /** Namespace pra duas telas poderem ter um filtro "cliente" cada uma. */
  escopo = "filtro",
): [T, (v: T | ((anterior: T) => T)) => void] {
  const [params, setParams] = useSearchParams();
  const idArmazenado = `${escopo}:${chave}`;

  const inicial = (): T => {
    const naUrl = params.get(chave);
    if (naUrl) return naUrl as T;
    try {
      const salvo = sessionStorage.getItem(idArmazenado);
      if (salvo) return salvo as T;
    } catch {
      // Safari em aba privada joga ao ler sessionStorage. Sem memória, o
      // padrão resolve — não é motivo pra quebrar a tela.
    }
    return padrao;
  };

  const [valor, setValor] = useState<T>(inicial);

  // Semeia a URL na primeira renderização quando o valor veio da memória: sem
  // isso, copiar o endereço mandaria pro colega uma tela sem o filtro que
  // está à vista.
  useEffect(() => {
    if (!params.get(chave) && valor !== padrao) {
      const novo = new URLSearchParams(params);
      novo.set(chave, valor);
      setParams(novo, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const definir = useCallback(
    // Aceita valor OU updater `(anterior) => novo`, como o useState — senão
    // todo call-site que faz `setMes(m => proximo(m))` teria que ser
    // reescrito, e o hook viraria um caso especial que ninguém lembra.
    (entrada: T | ((anterior: T) => T)) => {
      const v = typeof entrada === "function" ? (entrada as (a: T) => T)(valor) : entrada;
      setValor(v);
      try {
        sessionStorage.setItem(idArmazenado, v);
      } catch {
        // idem: sem memória, a URL ainda segura o filtro nesta navegação.
      }
      const novo = new URLSearchParams(window.location.search);
      // `replace` e não `push`: cada clique num filtro virando item de
      // histórico faria o botão voltar percorrer os filtros um a um antes de
      // sair da tela.
      if (v === padrao) novo.delete(chave);
      else novo.set(chave, v);
      setParams(novo, { replace: true });
    },
    [chave, idArmazenado, padrao, setParams, valor],
  );

  return [valor, definir];
}
