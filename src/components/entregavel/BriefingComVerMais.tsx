import { useLayoutEffect, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

type Props = { valor: string; onChange: (valor: string) => void; onConcluir?: () => void };
/** O autosave pode renderizar de novo, mas só a pessoa encerra a edição. */
export function BriefingComVerMais({ valor, onChange, onConcluir }: Props) {
  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState(!valor);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const deveFocar = useRef(false);
  const posicao = useRef<{inicio: number; fim: number; direcao: "forward" | "backward" | "none"; rolagem: number} | null>(null);
  const linhas = (valor || "").split("\n");
  const limite = 6;
  const cortado = !aberto && linhas.length > limite;

  const lembrarPosicao = (campo: HTMLTextAreaElement) => {
    posicao.current = {inicio: campo.selectionStart, fim: campo.selectionEnd, direcao: campo.selectionDirection, rolagem: campo.scrollTop};
  };
  useLayoutEffect(() => {
    const campo = textarea.current;
    if (!editando || !deveFocar.current || !campo) return;
    deveFocar.current = false;
    // Capture antes de focar: eventos de seleção disparados pelo foco não
    // podem substituir a posição que a pessoa deixou na sessão anterior.
    const anterior = posicao.current;
    const tamanho = campo.value.length;
    campo.focus({preventScroll: true});
    campo.setSelectionRange(Math.min(anterior?.inicio ?? tamanho, tamanho), Math.min(anterior?.fim ?? tamanho, tamanho), anterior?.direcao || "none");
    campo.scrollTop = anterior?.rolagem ?? campo.scrollHeight;
  }, [editando]);

  if (editando || !valor) {
    return <div className="space-y-2">
      <Textarea ref={textarea} aria-label="Briefing e orientações"
        rows={Math.min(20, Math.max(5, linhas.length + 1))} value={valor}
        onFocus={() => setEditando(true)}
        onChange={e => onChange(e.target.value)}
        onSelect={e => lembrarPosicao(e.currentTarget)}
        onBlur={e => lembrarPosicao(e.currentTarget)}
        placeholder="Direcionamento, referências…"/>
      <div className="flex justify-end"><Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs"
        onClick={() => { setEditando(false); onConcluir?.(); }}>Concluir edição</Button></div>
    </div>;
  }
  return <div>
    <div role="button" tabIndex={0} aria-label="Editar briefing e orientações"
      onClick={() => { deveFocar.current = true; setEditando(true); }}
      onKeyDown={e => { if(e.key === "Enter" || e.key === " "){ e.preventDefault(); deveFocar.current = true; setEditando(true); } }}
      title="Clique para editar"
      className="relative cursor-text whitespace-pre-wrap rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-sm leading-relaxed text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
      {cortado ? linhas.slice(0, limite).join("\n") : valor}
      {cortado && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 rounded-b-md bg-gradient-to-t from-card to-transparent"/>}
    </div>
    {linhas.length > limite && <div className="mt-2 flex justify-center"><button type="button" onClick={() => setAberto(v=>!v)}
      className={`rounded-lg border border-primary/60 px-4 py-1.5 text-xs font-semibold text-primary transition-shadow ${aberto?"":"animate-pulse shadow-[0_0_16px_2px_hsl(var(--primary)/0.55)]"}`}>
      {aberto ? "ver menos" : `ver mais (+${linhas.length-limite} linhas)`}
    </button></div>}
  </div>;
}
