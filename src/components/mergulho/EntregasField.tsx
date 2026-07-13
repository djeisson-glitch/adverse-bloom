import { Plus, Trash2 } from "lucide-react";

export type EntregaBriefing = { titulo: string; formato: string; duracao: string };

const FORMATOS = ["16x9", "9x16", "1x1", "4x5", "Outro"];
const vazia = (): EntregaBriefing => ({ titulo: "", formato: "16x9", duracao: "" });

/**
 * Lista de entregas do briefing (quantas peças + formato + duração).
 * Editável (onChange) ou só-leitura (readOnly).
 */
export function EntregasField({
  value, onChange, readOnly,
}: {
  value: EntregaBriefing[];
  onChange?: (v: EntregaBriefing[]) => void;
  readOnly?: boolean;
}) {
  const lista = Array.isArray(value) ? value : [];

  if (readOnly) {
    if (lista.length === 0) return <p className="text-sm text-muted-foreground">—</p>;
    return (
      <ul className="space-y-1">
        {lista.map((e, i) => (
          <li key={i} className="text-sm text-foreground">
            · {e.titulo || `Vídeo ${i + 1}`}
            {e.formato ? <span className="text-muted-foreground"> · {e.formato}</span> : null}
            {e.duracao ? <span className="text-muted-foreground"> · {e.duracao}</span> : null}
          </li>
        ))}
      </ul>
    );
  }

  const set = (i: number, patch: Partial<EntregaBriefing>) =>
    onChange?.(lista.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  const add = () => onChange?.([...lista, vazia()]);
  const rem = (i: number) => onChange?.(lista.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2">
      {lista.map((e, i) => (
        <div key={i} className="rounded-lg border border-border/60 bg-muted/20 p-2.5">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted-foreground">Entrega {i + 1}</span>
            <button type="button" onClick={() => rem(i)} className="text-muted-foreground hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_110px_110px]">
            <input
              value={e.titulo}
              onChange={(ev) => set(i, { titulo: ev.target.value })}
              placeholder="Título / o que é"
              className="h-9 rounded-md border border-input bg-background px-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
            <select
              value={e.formato}
              onChange={(ev) => set(i, { formato: ev.target.value })}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
            >
              {FORMATOS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
            <input
              value={e.duracao}
              onChange={(ev) => set(i, { duracao: ev.target.value })}
              placeholder='Duração (ex.: 30")'
              className="h-9 rounded-md border border-input bg-background px-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
      >
        <Plus className="h-3.5 w-3.5" /> Adicionar entrega
      </button>
    </div>
  );
}
