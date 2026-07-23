import { createContext, useContext, useState, type ReactNode } from "react";
import { setOcultarValores } from "@/lib/format";

/**
 * Modo apresentação — esconde TODOS os valores em R$ da tela com um clique
 * (admin), pra mostrar o sistema pro time sem expor números. Persiste por
 * máquina (localStorage). Ao alternar, remonta a árvore pela key pra todo
 * formatCurrency reavaliar de uma vez.
 */

type Ctx = { ocultar: boolean; alternar: () => void };
const PrivacidadeCtx = createContext<Ctx>({ ocultar: false, alternar: () => {} });
export const useValoresOcultos = () => useContext(PrivacidadeCtx);

const CHAVE = "valores_ocultos";

export function PrivacidadeProvider({ children }: { children: ReactNode }) {
  const [ocultar, setOcultar] = useState(() => {
    const v = typeof localStorage !== "undefined" && localStorage.getItem(CHAVE) === "1";
    setOcultarValores(v);
    return v;
  });

  // Mantém a flag do módulo em sincronia com o estado (inclusive em remounts).
  setOcultarValores(ocultar);

  const alternar = () => {
    setOcultar((v) => {
      const nv = !v;
      try { localStorage.setItem(CHAVE, nv ? "1" : "0"); } catch { /* ignora */ }
      setOcultarValores(nv);   // síncrono, antes do re-render, pra pintar já certo
      return nv;
    });
  };

  return (
    <PrivacidadeCtx.Provider value={{ ocultar, alternar }}>
      {/* A key troca ao ligar/desligar → remonta a árvore e todo formatCurrency
          reavalia, escondendo/mostrando os valores de uma vez. */}
      <div key={ocultar ? "oculto" : "visivel"} className="contents">{children}</div>
    </PrivacidadeCtx.Provider>
  );
}
