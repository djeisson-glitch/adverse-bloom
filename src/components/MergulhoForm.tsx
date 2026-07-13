import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MERGULHO_ESTRUTURA, secaoRespondida } from "@/lib/mergulho";

/**
 * Renderiza o Mergulho / Briefing (Método Adverse). Compartilhado pelo
 * formulário público, pela edição interna e pela leitura no projeto (readOnly).
 * A seção "Mergulho profundo" (opcional) é recolhível.
 */
export function MergulhoForm({
  value, onChange, readOnly,
}: {
  value: Record<string, any>;
  onChange?: (key: string, val: string) => void;
  readOnly?: boolean;
}) {
  const [openMergulho, setOpenMergulho] = useState(secaoRespondida(value || {}, MERGULHO_ESTRUTURA[1]));

  return (
    <div className="space-y-6">
      {MERGULHO_ESTRUTURA.map((secao) => {
        const aberta = !secao.opcional || openMergulho;
        // No modo leitura, some com seções sem nenhuma resposta.
        if (readOnly && !secaoRespondida(value || {}, secao)) return null;
        const campos = readOnly
          ? secao.campos.filter((c) => (value?.[c.key] || "").toString().trim())
          : secao.campos;

        return (
          <div key={secao.id} className={secao.opcional ? "rounded-lg border border-border/50 p-4" : ""}>
            {secao.opcional && !readOnly ? (
              <button
                type="button"
                onClick={() => setOpenMergulho((v) => !v)}
                className="flex w-full items-center gap-2 text-left"
              >
                {openMergulho ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <span className="text-sm font-semibold text-foreground">{secao.titulo}</span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">opcional</span>
              </button>
            ) : (
              <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground">{secao.titulo}</h3>
            )}
            {secao.descricao && !readOnly && (
              <p className={`text-xs text-muted-foreground ${secao.opcional && !readOnly ? "mt-1 pl-6" : "mt-1"}`}>{secao.descricao}</p>
            )}

            {aberta && (
              <div className={`space-y-4 ${secao.opcional && !readOnly ? "mt-4 pl-6" : "mt-3"}`}>
                {campos.map((c) => (
                  <div key={c.key}>
                    <Label className="text-sm text-foreground">{c.label}</Label>
                    {c.hint && !readOnly && <p className="mb-1 text-[11px] text-muted-foreground">{c.hint}</p>}
                    {readOnly ? (
                      <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted-foreground">{value?.[c.key] || "—"}</p>
                    ) : (
                      <Textarea
                        value={value?.[c.key] || ""}
                        onChange={(e) => onChange?.(c.key, e.target.value)}
                        rows={3}
                        className="mt-1"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
