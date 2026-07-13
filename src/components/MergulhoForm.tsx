import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EntregasField } from "@/components/mergulho/EntregasField";
import { MERGULHO_ESTRUTURA, secaoRespondida, campoRespondido } from "@/lib/mergulho";

/**
 * Renderiza o Briefing/Mergulho (visão INTERNA e leitura no projeto).
 * Mostra as seções do cliente + a "Leitura interna" (lentes do Método),
 * que fica recolhível. No formulário público o cliente NÃO vê a parte interna.
 */
export function MergulhoForm({
  value, onChange, readOnly,
}: {
  value: Record<string, any>;
  onChange?: (key: string, val: any) => void;
  readOnly?: boolean;
}) {
  const secaoInterna = MERGULHO_ESTRUTURA.find((s) => s.interno);
  const [openInterno, setOpenInterno] = useState(secaoInterna ? secaoRespondida(value || {}, secaoInterna) : false);

  return (
    <div className="space-y-6">
      {MERGULHO_ESTRUTURA.map((secao) => {
        const aberta = !secao.interno || openInterno;
        if (readOnly && !secaoRespondida(value || {}, secao)) return null;
        const campos = readOnly ? secao.campos.filter((c) => campoRespondido(value || {}, c)) : secao.campos;

        return (
          <div key={secao.id} className={secao.interno ? "rounded-lg border border-border/50 p-4" : ""}>
            {secao.interno && !readOnly ? (
              <button type="button" onClick={() => setOpenInterno((v) => !v)} className="flex w-full items-center gap-2 text-left">
                {openInterno ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <span className="text-sm font-semibold text-foreground">{secao.titulo}</span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">só do time</span>
              </button>
            ) : (
              <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground">{secao.titulo}</h3>
            )}
            {secao.descricao && !readOnly && (
              <p className={`text-xs text-muted-foreground ${secao.interno ? "mt-1 pl-6" : "mt-1"}`}>{secao.descricao}</p>
            )}

            {aberta && (
              <div className={`space-y-4 ${secao.interno && !readOnly ? "mt-4 pl-6" : "mt-3"}`}>
                {campos.map((c) => (
                  <div key={c.key}>
                    <Label className="text-sm text-foreground">{c.label}</Label>
                    {c.hint && !readOnly && <p className="mb-1 text-[11px] text-muted-foreground">{c.hint}</p>}
                    {c.tipo === "entregas" ? (
                      <div className="mt-1">
                        <EntregasField value={Array.isArray(value?.[c.key]) ? value[c.key] : []} onChange={(v) => onChange?.(c.key, v)} readOnly={readOnly} />
                      </div>
                    ) : readOnly ? (
                      <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted-foreground">{value?.[c.key] || "—"}</p>
                    ) : (
                      <Textarea value={value?.[c.key] || ""} onChange={(e) => onChange?.(c.key, e.target.value)} rows={3} className="mt-1" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Complementos que o cliente respondeu às perguntas sugeridas pela IA */}
      {(() => {
        const extras = Array.isArray(value?.ia_extras)
          ? value.ia_extras.filter((e: any) => (e?.resposta || "").toString().trim())
          : [];
        if (extras.length === 0) return null;
        return (
          <div className="rounded-lg border border-border/50 p-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground">Complementos do cliente</h3>
            <p className="mt-1 text-xs text-muted-foreground">Respostas às perguntas que a IA sugeriu no fim do briefing.</p>
            <div className="mt-3 space-y-3">
              {extras.map((e: any, i: number) => (
                <div key={i}>
                  <Label className="text-sm text-foreground">{e.pergunta}</Label>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted-foreground">{e.resposta}</p>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
