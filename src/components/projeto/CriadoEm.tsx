import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";

/** 2026-07-30T14:32:00Z → "30/07/2026 · 14:32", no fuso de quem está lendo. */
export function fmtCarimbo(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} · ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Date → "2026-07-30T14:32", que é o formato do input datetime-local. */
function paraInput(iso?: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * Quando o projeto nasceu — com dia e hora.
 *
 * Duas datas, porque são dois fatos: `criado_em` é quando o projeto começou
 * de verdade, `created_at` é quando a linha entrou no banco. Nos projetos
 * importados do ClickUp elas divergem por meses (o created_at de todos é o
 * dia da importação), e é por isso que a primeira é editável e a segunda não.
 *
 * Quem edita vê as duas: o valor ajustado em cima e, embaixo, "cadastrado no
 * sistema em ..." — assim a correção nunca apaga o rastro de origem.
 */
export function CriadoEm({ projectId, criadoEm, createdAt, podeEditar, onChanged }: {
  projectId: string;
  criadoEm?: string | null;
  createdAt?: string | null;
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
    setSalvando(true);
    // .select() porque o PostgREST devolve 204 mesmo quando a RLS barra tudo.
    const { data, error } = await (supabase as any)
      .from("projects")
      .update({ criado_em: new Date(valor).toISOString() })
      .eq("id", projectId).select("id");
    setSalvando(false);
    if (error) return toast.error("Não salvou", { description: error.message });
    if (!data?.length) return toast.error("Nada mudou — você tem permissão pra editar este projeto?");
    setEditando(false);
    onChanged();
    // Diz o efeito colateral em vez de escondê-lo: um trigger acabou de
    // reescrever a data de TODAS as peças do projeto, e quem ajustou precisa
    // saber disso antes de estranhar no fechamento.
    toast.success("Data de criação atualizada", {
      description: "Os entregáveis deste projeto passaram a ter a mesma data.",
    });
  };

  if (editando) {
    return (
      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Criado em</p>
        <div className="mt-1 flex items-center gap-1">
          <Input
            type="datetime-local"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            className="h-7 w-52 text-xs"
          />
          <button onClick={salvar} disabled={salvando} className="text-success hover:opacity-70" title="Salvar">
            <Check className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => setEditando(false)} className="text-muted-foreground hover:text-foreground" title="Cancelar">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        {createdAt && (
          <p className="mt-1 text-[10px] text-muted-foreground">
            cadastrado no sistema em {fmtCarimbo(createdAt)}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="group">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Criado em</p>
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
      {/* Data corrigida continua mostrando de onde veio: a correção não apaga
          o carimbo do sistema, ela convive com ele. */}
      {ajustada && (
        <p className="text-[10px] text-muted-foreground" title={`Entrou no sistema em ${fmtCarimbo(createdAt)}`}>
          ajustada · sistema {fmtCarimbo(createdAt).split(" · ")[0]}
        </p>
      )}
    </div>
  );
}
