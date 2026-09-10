/**
 * O briefing como o formulário foi preenchido, campo a campo.
 *
 * Djêisson (12/08): "precisamos ver como o formulário foi entregue (hoje tem
 * só 1 entrega, mas ta tudo junto)".
 *
 * O formulário grava `Rótulo: valor` uma por linha e o downstream lê tudo
 * junto como um parágrafo — foi assim que um roteiro de 4 cenas virou "3
 * peças" na cabeça de quem leu. Aqui a gente desmonta de volta: cada rótulo
 * vira um campo, e o que era um bloco de texto passa a mostrar a FORMA da
 * resposta. Linha sem rótulo (texto colado direto) sai como parágrafo, sem
 * inventar estrutura que não existe.
 *
 * Extraído de Demandas.tsx (10/09) pra ser reaproveitado também na exportação
 * em PDF — mesma leitura nas duas telas, sem duas versões do parser divergindo.
 */
export function CamposDoFormulario({ briefing }: { briefing: string }) {
  const linhas = String(briefing).split("\n").map((l) => l.trim()).filter(Boolean);
  return (
    <div className="mt-2 space-y-1.5">
      {linhas.map((linha, i) => {
        const corte = linha.indexOf(":");
        const rotulo = corte > 0 && corte <= 28 ? linha.slice(0, corte) : null;
        const valor = rotulo ? linha.slice(corte + 1).trim() : linha;
        return (
          <div key={i} className="text-xs leading-relaxed">
            {rotulo && (
              <span className="mr-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                {rotulo}
              </span>
            )}
            <span className="text-muted-foreground">{valor}</span>
          </div>
        );
      })}
    </div>
  );
}
