import { useEffect, useState } from "react";
import { BellOff, Loader2 } from "lucide-react";
import { ativarPush, pushAtivo, pushSuportado, pushConfigurado, permissaoAtual } from "@/lib/push";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const ADIAR_KEY = "adverse-push-adiado";
const SETE_DIAS = 7 * 86400000;

/**
 * Faixa pra quem NÃO vai receber aviso nenhum.
 *
 * Por que na Minha mesa e não no sino: o convite pra ligar o push morava
 * dentro do dropdown do sino — a pessoa precisava abrir a caixa que não
 * funciona pra descobrir que não funciona. Medido em 28/07/2026: 1 assinatura
 * no sistema inteiro; Robert, José e Maiara com ZERO. Não era entrega
 * inconsistente, era ausência de canal — e invisível pros dois lados.
 *
 * A auto-cura (sincronizarPush) conserta assinatura PERDIDA, mas nunca pede
 * permissão, de propósito. Quando a permissão nunca foi concedida, só uma
 * ação da pessoa resolve — e é isso que esta faixa vai buscar.
 */
export function AvisoPushDesligado() {
  const [ligado, setLigado] = useState<boolean | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [adiado, setAdiado] = useState(() => {
    const t = Number(localStorage.getItem(ADIAR_KEY) || 0);
    return Date.now() - t < SETE_DIAS;
  });

  useEffect(() => {
    pushAtivo().then(setLigado).catch(() => setLigado(false));
  }, []);

  if (ligado !== false || adiado) return null;
  if (!pushSuportado() || !pushConfigurado()) return null;

  const bloqueado = permissaoAtual() === "denied";

  const ligar = async () => {
    setOcupado(true);
    const r = await ativarPush();
    setOcupado(false);
    if (r.ok) {
      setLigado(true);
      toast.success("Pronto — agora você recebe os avisos na área de trabalho");
    } else {
      toast.error("Não deu pra ligar", { description: r.motivo });
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3">
      <BellOff className="h-4 w-4 shrink-0 text-warning" />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium text-foreground">Você não está recebendo aviso nenhum</p>
        <p className="text-xs text-muted-foreground">
          {bloqueado
            ? "As notificações estão bloqueadas neste navegador. Abra o cadeado na barra de endereço, libere \"Notificações\" e recarregue."
            : "Nenhum aviso deste sistema chega na sua área de trabalho até você ligar aqui."}
        </p>
      </div>
      {!bloqueado && (
        <Button size="sm" onClick={ligar} disabled={ocupado}>
          {ocupado ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
          Ligar avisos
        </Button>
      )}
      <button
        onClick={() => { localStorage.setItem(ADIAR_KEY, String(Date.now())); setAdiado(true); }}
        className="text-xs text-muted-foreground hover:text-foreground"
      >
        agora não
      </button>
    </div>
  );
}
