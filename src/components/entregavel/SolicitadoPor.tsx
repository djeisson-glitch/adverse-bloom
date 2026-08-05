import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { UserPlus, Check, X, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Contato = { nome: string; email?: string };

const OUTRO = "__novo__";
const NINGUEM = "__ninguem__";

/**
 * Quem pediu a peça — escolhido entre as pessoas DAQUELE cliente.
 *
 * Era campo de texto livre, e texto livre em nome de pessoa vira "Camila",
 * "camila", "Camila Fernanda" e "Cami" — quatro pessoas diferentes pro
 * sistema, e nenhum relatório por solicitante fecha.
 *
 * A lista sai de `clients.intake_contatos`, que já existe e é a equipe que o
 * cliente cadastrou pro formulário público. Reaproveitar tem um efeito bom de
 * lado: quem for cadastrado aqui aparece lá também, e o cliente para de
 * digitar o próprio nome toda vez que abre uma demanda.
 */
export function SolicitadoPor({ clientId, valor, onChange }: {
  clientId?: string | null;
  valor: string;
  onChange: (v: string) => void;
}) {
  const qc = useQueryClient();
  const [criando, setCriando] = useState(false);
  const [novo, setNovo] = useState({ nome: "", email: "" });
  const [salvando, setSalvando] = useState(false);

  const { data: contatos = [] } = useQuery({
    queryKey: ["contatos-cliente", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      // RPC e não select direto: a RLS de `clients` exige permissão no módulo
      // do cliente, que a coordenação não tem — e dar essa permissão abriria
      // a ficha comercial junto (cobrança, valor-hora, tabela).
      const { data } = await (supabase as any).rpc("contatos_do_cliente", { _client_id: clientId });
      return (Array.isArray(data) ? data : []) as Contato[];
    },
  });

  /**
   * Tira o contato da lista do cliente.
   *
   * NÃO mexe nas peças que já apontam pra esse nome: `solicitado_por` é
   * texto, e apagar o histórico de quem pediu o quê seria pior que um nome a
   * mais na lista.
   */
  const remover = async (nome: string) => {
    if (!clientId) return;
    const { error } = await (supabase as any).rpc("cliente_remover_contato", {
      _client_id: clientId, _nome: nome,
    });
    if (error) return toast.error("Não removeu", { description: error.message });
    qc.invalidateQueries({ queryKey: ["contatos-cliente", clientId] });
    toast.success(`${nome} saiu da lista`, { description: "As peças que já apontam pra ele continuam como estão." });
  };

  const cadastrar = async () => {
    const nome = novo.nome.trim();
    if (!nome) return toast.error("Escreva o nome");
    if (!clientId) return toast.error("Esta peça não tem cliente — defina no projeto primeiro");
    setSalvando(true);
    const { error } = await (supabase as any).rpc("cliente_adicionar_contato", {
      _client_id: clientId, _nome: nome, _email: novo.email.trim() || null,
    });
    setSalvando(false);
    if (error) return toast.error("Não cadastrou", { description: error.message });
    qc.invalidateQueries({ queryKey: ["contatos-cliente", clientId] });
    onChange(nome);
    setNovo({ nome: "", email: "" });
    setCriando(false);
    toast.success(`${nome} cadastrado`, { description: "Aparece também no formulário de demandas deste cliente." });
  };

  if (criando) {
    return (
      <div className="space-y-1.5">
        <Input
          value={novo.nome}
          onChange={(e) => setNovo({ ...novo, nome: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && cadastrar()}
          placeholder="Nome da pessoa"
          className="h-8"
          autoFocus
        />
        <Input
          value={novo.email}
          onChange={(e) => setNovo({ ...novo, email: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && cadastrar()}
          placeholder="e-mail (opcional)"
          className="h-8"
        />
        <div className="flex gap-1">
          <Button size="sm" onClick={cadastrar} disabled={salvando} className="h-7 flex-1 text-xs">
            <Check className="mr-1 h-3 w-3" /> Cadastrar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setCriando(false)} className="h-7 text-xs">
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <Select
        value={valor || ""}
        onValueChange={(v) =>
          v === OUTRO ? setCriando(true) : onChange(v === NINGUEM ? "" : v)
        }
      >
        <SelectTrigger className="h-8">
          <SelectValue placeholder={contatos.length ? "quem pediu" : "ninguém cadastrado"} />
        </SelectTrigger>
        <SelectContent>
          {/* Sem esta opção, um solicitante escolhido por engano fica pra
              sempre: seletor sem saída é armadilha. */}
          {valor && <SelectItem value={NINGUEM}>— ninguém —</SelectItem>}
          {/* Nome que já estava salvo e não está na lista (veio do formulário
              antigo ou de texto livre): aparece pra não sumir da peça. */}
          {valor && !contatos.some((c) => c.nome === valor) && (
            <SelectItem value={valor}>{valor}</SelectItem>
          )}
          {contatos.map((c) => (
            <SelectItem key={c.nome} value={c.nome}>
              {c.nome}
              {c.email && <span className="ml-1.5 text-[10px] text-muted-foreground">{c.email}</span>}
            </SelectItem>
          ))}
          <SelectItem value={OUTRO}>
            <span className="flex items-center gap-1.5 text-primary">
              <UserPlus className="h-3 w-3" /> cadastrar pessoa…
            </span>
          </SelectItem>
        </SelectContent>
      </Select>
      {!contatos.length && (
        <p className="text-[10px] text-muted-foreground">
          Este cliente ainda não tem contatos — cadastre pelo seletor.
        </p>
      )}

      {/* Gerenciar fica escondido atrás de um clique: é manutenção rara, e
          lixeira à vista em lista de gente convida ao acidente. */}
      {!!contatos.length && (
        <details className="text-[10px]">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            gerenciar contatos ({contatos.length})
          </summary>
          <div className="mt-1 space-y-0.5">
            {contatos.map((c) => (
              <div key={c.nome} className="flex items-center justify-between gap-2 rounded px-1 py-0.5 hover:bg-muted/30">
                <span className="truncate text-muted-foreground">{c.nome}</span>
                <button
                  onClick={() => remover(c.nome)}
                  title={`Tirar ${c.nome} da lista deste cliente`}
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
