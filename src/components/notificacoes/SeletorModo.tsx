import { Bell, BellOff, Zap, Clock } from "lucide-react";
import type { Modo } from "@/hooks/useNotifPrefs";

/**
 * Controle de 3 estados de um tipo de notificação pra uma pessoa.
 *
 * O rótulo do "push" muda com o NÍVEL do tipo, porque é isso que a pessoa
 * realmente vai sentir: nível 1 interrompe na hora, nível 2 chega junto no
 * resumo. Chamar os dois de "push" esconderia a diferença que importa.
 *
 * Tipo de nível 3 NÃO oferece push: o roteador nega push pra nível 3 de
 * qualquer forma, então um botão ligado que não dispara nada seria mentira.
 */
export function SeletorModo({
  nivel, valor, onChange, disabled,
}: {
  nivel: number; valor: Modo; onChange: (m: Modo) => void; disabled?: boolean;
}) {
  const opcoes: { modo: Modo; label: string; Icon: typeof Bell; dica: string }[] = [
    ...(nivel === 3
      ? []
      : [{
          modo: "push" as Modo,
          label: nivel === 1 ? "Na hora" : "No resumo",
          Icon: nivel === 1 ? Zap : Clock,
          dica: nivel === 1
            ? "Interrompe na hora, mesmo com o sistema fechado"
            : "Junta com as outras e chega nos horários do resumo",
        }]),
    { modo: "sino", label: "Só no sino", Icon: Bell, dica: "Aparece na central, sem interromper" },
    { modo: "off", label: "Desligado", Icon: BellOff, dica: "Não recebe de jeito nenhum" },
  ];

  return (
    <div className="flex shrink-0 gap-1">
      {opcoes.map(({ modo, label, Icon, dica }) => {
        const ativo = valor === modo;
        return (
          <button
            key={modo}
            type="button"
            disabled={disabled}
            title={dica}
            onClick={() => onChange(modo)}
            className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors disabled:opacity-50 ${
              ativo
                ? modo === "off"
                  ? "border-border bg-muted text-muted-foreground"
                  : modo === "sino"
                  ? "border-info/40 bg-info/10 text-info"
                  : "border-primary/40 bg-primary/10 text-primary"
                : "border-transparent text-muted-foreground hover:bg-muted/50"
            }`}
          >
            <Icon className="h-3 w-3" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
