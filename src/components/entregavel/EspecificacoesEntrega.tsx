import { Input } from "@/components/ui/input";

type Props = {
  formato: string;
  duracao: string;
  onChange: (patch: { formato?: string; duracao?: string }) => void;
  onCommit: () => void;
};

export function EspecificacoesEntrega({ formato, duracao, onChange, onCommit }: Props) {
  return <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      Formato
      <Input aria-label="Formato do entregável" value={formato} placeholder="Ex.: 16x9"
        onChange={e => onChange({ formato: e.target.value })} onBlur={onCommit}
        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); onCommit(); } }}
        className="h-8 w-36 text-sm text-foreground" />
    </label>
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      Duração
      <Input aria-label="Duração do entregável" value={duracao} placeholder="Ex.: 30s"
        onChange={e => onChange({ duracao: e.target.value })} onBlur={onCommit}
        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); onCommit(); } }}
        className="h-8 w-28 text-sm text-foreground" />
    </label>
  </div>;
}
