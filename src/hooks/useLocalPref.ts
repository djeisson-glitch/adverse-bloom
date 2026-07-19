import { useCallback, useState } from "react";

/**
 * Preferência de tela guardada no navegador (visão padrão, ordenação, agrupamento).
 *
 * Não vai pro banco de propósito: é escolha de quem está olhando naquele momento,
 * não um dado do projeto. Efeito prático: a última visão escolhida vira a padrão
 * quando a pessoa volta pra tela.
 */
export function useLocalPref<T extends string>(
  chave: string,
  padrao: T,
  validos: readonly T[],
) {
  const [valor, setValor] = useState<T>(() => {
    try {
      const salvo = localStorage.getItem(`adverse:${chave}`) as T | null;
      return salvo && validos.includes(salvo) ? salvo : padrao;
    } catch {
      return padrao; // navegador em modo privado / storage bloqueado
    }
  });

  const definir = useCallback(
    (v: T) => {
      setValor(v);
      try {
        localStorage.setItem(`adverse:${chave}`, v);
      } catch {
        /* sem persistir, mas a tela continua funcionando */
      }
    },
    [chave],
  );

  return [valor, definir] as const;
}
