import { useState, useMemo, useRef, useEffect } from "react";
import { useClients } from "@/hooks/useDeals";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, ChevronsUpDown, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { NewClientModal } from "./NewClientModal";

interface ClientSelectProps {
  value: string | null;
  onChange: (clientId: string | null, clientName: string) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  size?: "sm" | "default";
}

export function ClientSelect({ value, onChange, disabled, className, placeholder = "Selecionar cliente", size = "default" }: ClientSelectProps) {
  const { clients } = useClients();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [newClientOpen, setNewClientOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(() => clients.find((c) => c.id === value), [clients, value]);

  const filtered = useMemo(() => {
    if (!search) return clients;
    const q = search.toLowerCase();
    return clients.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.company || "").toLowerCase().includes(q)
    );
  }, [clients, search]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setSearch("");
    }
  }, [open]);

  const sizeClasses = size === "sm" ? "h-8 text-sm" : "h-10 text-sm";

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              "w-full justify-between font-normal",
              sizeClasses,
              !selected && "text-muted-foreground",
              className
            )}
          >
            <span className="truncate">
              {selected ? `${selected.name}${selected.company ? ` — ${selected.company}` : ""}` : placeholder}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <div className="flex items-center border-b border-border px-3 py-2">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <input
              ref={inputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome ou empresa..."
              className="flex h-8 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-[240px] overflow-y-auto p-1">
            {filtered.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">Nenhum cliente encontrado</p>
            )}
            {filtered.map((c) => (
              <button
                key={c.id}
                className={cn(
                  "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                  value === c.id && "bg-accent text-accent-foreground"
                )}
                onClick={() => {
                  onChange(c.id, c.name);
                  setOpen(false);
                }}
              >
                {value === c.id && (
                  <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                    <Check className="h-4 w-4" />
                  </span>
                )}
                <span className="truncate">
                  {c.name}{c.company ? ` — ${c.company}` : ""}
                </span>
              </button>
            ))}
          </div>
          <div className="border-t border-border p-1">
            <button
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-primary hover:bg-accent"
              onClick={() => {
                setOpen(false);
                setNewClientOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              Criar novo cliente
            </button>
          </div>
        </PopoverContent>
      </Popover>

      <NewClientModal
        open={newClientOpen}
        onOpenChange={setNewClientOpen}
        onCreated={(id) => {
          const client = clients.find((c) => c.id === id);
          onChange(id, client?.name || "");
        }}
      />
    </>
  );
}
