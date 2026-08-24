import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * Confirmação e prompt bonitos, no visual do sistema — substituem os
 * window.confirm / window.prompt nativos (que quebravam o design). Uso:
 *
 *   const confirmar = useConfirm();
 *   if (!(await confirmar({ title: "Excluir?", description: "...", destructive: true }))) return;
 *
 *   const perguntar = usePrompt();
 *   const texto = await perguntar({ title: "O que o cliente pediu?" });
 *   if (texto === null) return;   // cancelou
 */

type ConfirmOpts = {
  title?: string;
  description?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;   // botão de confirmar em vermelho (ações que apagam)
};

type PromptOpts = {
  title?: string;
  description?: ReactNode;
  placeholder?: string;
  confirmText?: string;
  cancelText?: string;
  obrigatorio?: boolean;   // trava o botão até ter texto (default true)
};

type ConfirmFn = (opts?: ConfirmOpts) => Promise<boolean>;
type PromptFn = (opts?: PromptOpts) => Promise<string | null>;

const ConfirmCtx = createContext<ConfirmFn | null>(null);
const PromptCtx = createContext<PromptFn | null>(null);

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmCtx);
  if (!ctx) throw new Error("useConfirm precisa estar dentro de <ConfirmProvider>");
  return ctx;
}

export function usePrompt(): PromptFn {
  const ctx = useContext(PromptCtx);
  if (!ctx) throw new Error("usePrompt precisa estar dentro de <ConfirmProvider>");
  return ctx;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  // --- confirmação (sim/não) ---
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<ConfirmOpts>({});
  const resolver = useRef<((v: boolean) => void) | null>(null);
  const resultado = useRef(false);   // vira true só se clicar em confirmar

  const confirmar = useCallback<ConfirmFn>((o = {}) => {
    setOpts(o);
    resultado.current = false;
    setOpen(true);
    return new Promise<boolean>((resolve) => { resolver.current = resolve; });
  }, []);

  const aoMudar = (aberto: boolean) => {
    setOpen(aberto);
    if (!aberto) {
      resolver.current?.(resultado.current);
      resolver.current = null;
    }
  };

  // --- prompt (campo de texto) ---
  const [pOpen, setPOpen] = useState(false);
  const [pOpts, setPOpts] = useState<PromptOpts>({});
  const [pValor, setPValor] = useState("");
  const pResolver = useRef<((v: string | null) => void) | null>(null);
  const pConfirmado = useRef(false);   // true só se clicou em confirmar

  const perguntar = useCallback<PromptFn>((o = {}) => {
    setPOpts(o);
    setPValor("");
    pConfirmado.current = false;
    setPOpen(true);
    return new Promise<string | null>((resolve) => { pResolver.current = resolve; });
  }, []);

  /**
   * Resolve a promessa UMA vez, venha o fechamento de onde vier.
   *
   * `pResolver.current = null` logo depois é o que garante o "uma vez": o
   * fechamento do Radix chega DEPOIS do clique em confirmar, e sem essa
   * guarda a segunda chamada devolveria `null` por cima do texto.
   */
  const pResponder = (v: string | null) => {
    pResolver.current?.(v);
    pResolver.current = null;
  };

  const pAoMudar = (aberto: boolean) => {
    setPOpen(aberto);
    // Fechou sem ser pelo botão de confirmar (ESC, clique fora, Cancelar):
    // é desistência, e desistência devolve null.
    if (!aberto) pResponder(pConfirmado.current ? pValor : null);
  };

  const pObrigatorio = pOpts.obrigatorio !== false;
  /**
   * Confirmar RESOLVE na hora — não espera o onOpenChange.
   *
   * Era exatamente aqui que o prompt quebrava (Djêisson, 20/08: "clico em
   * outra opção, coloco o nome e nada acontece"): o botão fazia
   * `e.preventDefault()` — que impede o Radix de fechar — e chamava
   * `setPOpen(false)` na mão. Mudar o state manualmente NÃO dispara
   * `onOpenChange`, então o resolver nunca era chamado e o `await
   * perguntar(...)` ficava pendurado pra sempre. Sem erro, sem toast, sem
   * nada — o pior tipo de falha.
   *
   * O `confirmar` (sim/não) nunca teve o problema porque lá o Action fecha
   * sozinho, e o fechamento é que resolve.
   */
  const pOk = () => {
    pConfirmado.current = true;
    pResponder(pValor);
    setPOpen(false);
  };

  return (
    <ConfirmCtx.Provider value={confirmar}>
      <PromptCtx.Provider value={perguntar}>
        {children}

        <AlertDialog open={open} onOpenChange={aoMudar}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{opts.title || "Confirmar"}</AlertDialogTitle>
              {opts.description && <AlertDialogDescription>{opts.description}</AlertDialogDescription>}
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{opts.cancelText || "Cancelar"}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => { resultado.current = true; }}
                className={cn(opts.destructive && "bg-destructive text-destructive-foreground hover:bg-destructive/90")}
              >
                {opts.confirmText || "Confirmar"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={pOpen} onOpenChange={pAoMudar}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{pOpts.title || "Escreva"}</AlertDialogTitle>
              {pOpts.description && <AlertDialogDescription>{pOpts.description}</AlertDialogDescription>}
            </AlertDialogHeader>
            <Textarea
              autoFocus
              rows={3}
              value={pValor}
              onChange={(e) => setPValor(e.target.value)}
              placeholder={pOpts.placeholder}
              onKeyDown={(e) => {
                // ⌘/Ctrl+Enter confirma; Enter puro deixa quebrar linha.
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && (!pObrigatorio || pValor.trim())) pOk();
              }}
            />
            <AlertDialogFooter>
              <AlertDialogCancel>{pOpts.cancelText || "Cancelar"}</AlertDialogCancel>
              <AlertDialogAction onClick={(e) => { e.preventDefault(); pOk(); }} disabled={pObrigatorio && !pValor.trim()}>
                {pOpts.confirmText || "Enviar"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </PromptCtx.Provider>
    </ConfirmCtx.Provider>
  );
}
