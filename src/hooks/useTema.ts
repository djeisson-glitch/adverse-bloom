import { useCallback, useEffect, useState } from "react";

const CHAVE = "tema";

/**
 * Tema claro/escuro. O sistema nasceu escuro e continua assim por padrão —
 * quem quiser claro escolhe, e a escolha fica salva nesta máquina.
 *
 * Todo o visual é token CSS, então trocar o tema é só ligar/desligar a classe
 * `light` no <html>: nenhuma tela precisa saber do tema.
 */
export function temaClaroSalvo(): boolean {
  try {
    return localStorage.getItem(CHAVE) === "claro";
  } catch {
    return false;
  }
}

export function aplicarTema(claro: boolean) {
  document.documentElement.classList.toggle("light", claro);
  // A barra do navegador/app instalado acompanha.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", claro ? "#ffffff" : "#0d0d0d");
}

export function useTema() {
  const [claro, setClaro] = useState(temaClaroSalvo);

  useEffect(() => {
    aplicarTema(claro);
  }, [claro]);

  const alternar = useCallback(() => {
    setClaro((atual) => {
      const novo = !atual;
      try {
        localStorage.setItem(CHAVE, novo ? "claro" : "escuro");
      } catch {
        /* sem localStorage (aba anônima): vale só nesta sessão */
      }
      return novo;
    });
  }, []);

  return { claro, alternar };
}
