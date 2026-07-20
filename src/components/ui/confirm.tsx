import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

/**
 * Confirmação bonita, no visual do sistema — substitui o window.confirm nativo
 * (que quebrava o design). Uso:
 *
 *   const confirmar = useConfirm();
 *   if (!(await confirmar({ title: "Excluir?", description: "...", destructive: true }))) return;
 *
 * Promessa que resolve true (confirmou) ou false (cancelou/fechou).
 */

type ConfirmOpts = {
  title?: string;
  description?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;   // botão de confirmar em vermelho (ações que apagam)
};

type ConfirmFn = (opts?: ConfirmOpts) => Promise<boolean>;

const ConfirmCtx = createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmCtx);
  if (!ctx) throw new Error("useConfirm precisa estar dentro de <ConfirmProvider>");
  return ctx;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
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

  // Qualquer fechamento (confirmar, cancelar, Esc, clicar fora) cai aqui e
  // resolve a promessa com o resultado corrente.
  const aoMudar = (aberto: boolean) => {
    setOpen(aberto);
    if (!aberto) {
      resolver.current?.(resultado.current);
      resolver.current = null;
    }
  };

  return (
    <ConfirmCtx.Provider value={confirmar}>
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
    </ConfirmCtx.Provider>
  );
}
