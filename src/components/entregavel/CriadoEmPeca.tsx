import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";

const p2 = (n: number) => String(n).padStart(2, "0");

/** ISO → "05/08/2026 · 09:23", no fuso de quem lê. */
export function fmtCarimbo(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()} · ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

/** ISO → "2026-08-05T09:23", formato do input datetime-local. */
function paraInput(iso?: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

/**
 * Quando a peça entrou — com dia e hora, corrigível.
 *
 * Mesma razão do projeto: o que veio do ClickUp tem a data da importação, não
 * a real. Aqui a pergunta é mais estreita — "quando ESTA peça entrou" —,
 * porque nem toda peça nasce junto do job: um projeto de julho ganha uma
 * redução em agosto.
 *
 * NÃO muda o mês do fechamento: ali vale a data do PROJETO, sempre — um job
 * tem um mês só. É justamente isso que torna este campo seguro de ajustar:
 * ele responde "quando ESTA peça entrou" sem mexer em fatura.
 *
 * Ainda assim não anda pra trás do projeto: peça que nasce antes do job é
 * engano de digitação, e engano que fica no banco vira dúvida no fechamento
 * seguinte. Quem precisa puxar pra trás ajusta o PROJETO — e aí as peças
 * acompanham sozinhas.
 */
export function CriadoEmPeca({ deliverableId, criadoEm, createdAt, pisoProjeto, podeEditar, onChanged }: {
  deliverableId: string;
  criadoEm?: string | null;
  createdAt?: string | null;
  /** Data ajustada do projeto — a peça não pode ser anterior a ela. */
  pisoProjeto?: string | null;
  podeEditar: boolean;
  onChanged: () => void;
}) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(() => paraInput(criadoEm || createdAt));
  const [salvando, setSalvando] = useState(false);

  const efetiva = criadoEm || createdAt;
  const ajustada = !!criadoEm && !!createdAt &&
    new Date(criadoEm).toDateString() !== new Date(createdAt).toDateString();

  const salvar = async () => {
    // O banco também barra (trigger), mas avisar aqui evita a viagem e dá o
    // erro no campo em que a pessoa está olhando.
    if (pisoProjeto && new Date(valor) < new Date(pisoProjeto)) {
      return toast.error("Data anterior ao projeto", {
        description: `O projeto começou em ${fmtCarimbo(pisoProjeto)}. Empurre a peça pra frente, ou ajuste a data do projeto.`,
      });
    }
    setSalvando(true);
    // .select() porque o PostgREST devolve 204 mesmo quando a RLS barra tudo.
    const { data, error } = await (supabase as any)
      .from("deliverables")
      .update({ criado_em: new Date(valor).toISOString() })
      .eq("id", deliverableId).select("id");
    setSalvando(false);
    if (error) return toast.error("Não salvou", { description: error.message });
    if (!data?.length) return toast.error("Nada mudou — sem permissão nesta peça?");
    setEditando(false);
    onChanged();
    toast.success("Data de criação atualizada");
  };

  if (editando) {
    return (
      <div>
        <p className="mb-1 text-[11px] text-muted-foreground">Criado em</p>
        <div className="flex items-center gap-1">
          <Input
            type="datetime-local"
            value={valor}
            min={pisoProjeto ? paraInput(pisoProjeto) : undefined}
            onChange={(e) => setValor(e.target.value)}
            className="h-8 text-xs"
          />
          <button onClick={salvar} disabled={salvando} className="text-success hover:opacity-70" title="Salvar">
            <Check className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => setEditando(false)} className="text-muted-foreground hover:text-foreground" title="Cancelar">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        {pisoProjeto && (
          <p className="mt-1 text-[10px] text-muted-foreground">
            só a partir de {fmtCarimbo(pisoProjeto)} — é quando o projeto entrou.
            O mês do fechamento segue a data do projeto.
          </p>
        )}
        {createdAt && (
          <p className="mt-1 text-[10px] text-muted-foreground">
            cadastrada no sistema em {fmtCarimbo(createdAt)}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="group">
      <p className="mb-1 text-[11px] text-muted-foreground">Criado em</p>
      <p className="flex items-center gap-1.5 text-sm text-foreground">
        {fmtCarimbo(efetiva)}
        {podeEditar && (
          <button
            onClick={() => { setValor(paraInput(efetiva)); setEditando(true); }}
            title="Corrigir a data — útil pro que veio do ClickUp com a data da importação"
            className="text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
          >
            <Pencil className="h-3 w-3" />
          </button>
        )}
      </p>
      {ajustada && (
        <p className="text-[10px] text-muted-foreground" title={`Cadastrada no sistema em ${fmtCarimbo(createdAt)}`}>
          ajustada · sistema {fmtCarimbo(createdAt).split(" · ")[0]}
        </p>
      )}
    </div>
  );
}
