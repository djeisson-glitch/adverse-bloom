import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from "@/components/ui/command";
import { Search, FolderKanban, Users, FileSpreadsheet, Film, Loader2 } from "lucide-react";

/**
 * Busca global (⌘K / Ctrl+K) — procura em projetos, clientes, orçamentos e
 * entregáveis ao mesmo tempo e leva direto pro registro. Substitui o antigo
 * campo que só mostrava "chega em melhoria futura".
 *
 * A busca é no servidor (ilike), então `shouldFilter={false}` no Command — quem
 * filtra é o Postgres, não o cmdk.
 */

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

type Resultados = {
  projetos: any[];
  clientes: any[];
  deals: any[];
  entregaveis: any[];
};

export function BuscaGlobal() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  // Tira vírgula/parênteses: quebrariam a sintaxe do .or() do PostgREST.
  const termo = useDebounced(q.replace(/[,()]/g, " ").trim(), 220);

  // ⌘K / Ctrl+K abre e fecha de qualquer tela.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const { data, isFetching } = useQuery<Resultados>({
    queryKey: ["busca-global", termo],
    enabled: open && termo.length >= 2,
    queryFn: async () => {
      const like = `%${termo}%`;
      const [proj, cli, deal, ent] = await Promise.all([
        (supabase as any).from("projects").select("id, name, numero, status")
          .or(`name.ilike.${like},numero.ilike.${like}`).limit(6),
        (supabase as any).from("clients").select("id, name, trade_name")
          .or(`name.ilike.${like},trade_name.ilike.${like}`).limit(6),
        (supabase as any).from("deals").select("id, numero, title, client:clients(name)")
          .or(`title.ilike.${like},numero.ilike.${like}`).limit(6),
        (supabase as any).from("deliverables").select("id, titulo, project:projects(id, name, numero)")
          .ilike("titulo", like).limit(6),
      ]);
      return {
        projetos: proj.data || [],
        clientes: cli.data || [],
        deals: deal.data || [],
        entregaveis: ent.data || [],
      };
    },
  });

  const ir = (to: string) => {
    setOpen(false);
    setQ("");
    navigate(to);
  };

  const vazio = data &&
    !data.projetos.length && !data.clientes.length && !data.deals.length && !data.entregaveis.length;

  return (
    <>
      {/* Gatilho no header — parece um campo, mas abre a paleta. */}
      <button
        onClick={() => setOpen(true)}
        className="relative hidden max-w-md flex-1 items-center rounded-lg border border-border bg-muted/40 py-1.5 pl-9 pr-12 text-left text-sm text-muted-foreground hover:bg-muted/60 md:flex"
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
        <span className="truncate">Buscar projeto, cliente, orçamento…</span>
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium">⌘K</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="overflow-hidden p-0 shadow-lg">
          <Command
            shouldFilter={false}
            className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-2.5 [&_[cmdk-item]_svg]:h-4 [&_[cmdk-item]_svg]:w-4"
          >
            <CommandInput value={q} onValueChange={setQ} placeholder="Buscar projeto, cliente, orçamento, entregável…" />
            <CommandList>
              {termo.length < 2 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Digite ao menos 2 letras para buscar.</div>
              ) : isFetching ? (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Buscando…
                </div>
              ) : vazio ? (
                <CommandEmpty>Nada encontrado para "{termo}".</CommandEmpty>
              ) : (
                <>
                  {!!data?.projetos.length && (
                    <CommandGroup heading="Projetos">
                      {data.projetos.map((p) => (
                        <CommandItem key={p.id} value={`proj-${p.id}`} onSelect={() => ir(`/projetos/${p.id}`)}>
                          <FolderKanban className="mr-2 text-muted-foreground" />
                          <span className="truncate">{p.name}</span>
                          {p.numero && <span className="ml-auto pl-2 text-xs text-muted-foreground">{p.numero}</span>}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                  {!!data?.entregaveis.length && (
                    <CommandGroup heading="Entregáveis">
                      {data.entregaveis.map((e) => (
                        <CommandItem key={e.id} value={`ent-${e.id}`}
                          onSelect={() => e.project?.id && ir(`/projetos/${e.project.id}/entregaveis/${e.id}`)}>
                          <Film className="mr-2 text-muted-foreground" />
                          <span className="truncate">{e.titulo}</span>
                          {e.project?.name && <span className="ml-auto pl-2 truncate text-xs text-muted-foreground">{e.project.name}</span>}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                  {!!data?.deals.length && (
                    <CommandGroup heading="Orçamentos">
                      {data.deals.map((d) => (
                        <CommandItem key={d.id} value={`deal-${d.id}`} onSelect={() => ir(`/orcamentos/${d.id}`)}>
                          <FileSpreadsheet className="mr-2 text-muted-foreground" />
                          {d.numero && <span className="text-xs text-muted-foreground">#{d.numero}</span>}
                          <span className="truncate">{d.title || "(sem título)"}</span>
                          {d.client?.name && <span className="ml-auto pl-2 truncate text-xs text-muted-foreground">{d.client.name}</span>}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                  {!!data?.clientes.length && (
                    <CommandGroup heading="Clientes">
                      {data.clientes.map((c) => (
                        <CommandItem key={c.id} value={`cli-${c.id}`} onSelect={() => ir(`/clientes/${c.id}`)}>
                          <Users className="mr-2 text-muted-foreground" />
                          <span className="truncate">{c.trade_name || c.name}</span>
                          {c.trade_name && c.name && c.trade_name !== c.name && (
                            <span className="ml-auto pl-2 truncate text-xs text-muted-foreground">{c.name}</span>
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                </>
              )}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
