import { Component, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * O app não tinha error boundary nenhum: qualquer exceção no render desmontava
 * a árvore inteira e a pessoa via uma TELA PRETA — sem pista do que quebrou.
 *
 * Agora o erro fica contido na página e aparece legível. Bug continua sendo bug,
 * mas dá pra ver o que é (e o resto do sistema segue de pé).
 */
type Props = { children: ReactNode; onde?: string };
type State = { erro: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { erro: null };

  static getDerivedStateFromError(erro: Error): State {
    return { erro };
  }

  componentDidCatch(erro: Error, info: { componentStack: string }) {
    console.error(`[ErrorBoundary${this.props.onde ? ` · ${this.props.onde}` : ""}]`, erro, info.componentStack);
  }

  render() {
    const { erro } = this.state;
    if (!erro) return this.props.children;

    return (
      <div className="mx-auto max-w-2xl py-10">
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-6">
          <p className="flex items-center gap-2 text-base font-semibold text-foreground">
            <AlertTriangle className="h-5 w-5 text-destructive" /> Essa parte quebrou
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            O resto do sistema continua funcionando. Copie a mensagem abaixo e mande pro time —
            é ela que diz exatamente o que aconteceu.
          </p>

          <pre className="mt-4 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-border/50 bg-background/60 p-3 text-xs text-destructive">
            {erro.message}
            {erro.stack ? `\n\n${erro.stack.split("\n").slice(0, 6).join("\n")}` : ""}
          </pre>

          <div className="mt-4 flex gap-2">
            <Button size="sm" variant="outline" onClick={() => this.setState({ erro: null })}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" /> Tentar de novo
            </Button>
            <Button size="sm" variant="ghost" onClick={() => window.location.reload()}>
              Recarregar a página
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
