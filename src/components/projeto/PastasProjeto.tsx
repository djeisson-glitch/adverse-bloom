import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderPlus, Loader2, Copy, Settings2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useConfirm } from "@/components/ui/confirm";
import { toast } from "sonner";

export function pastaClienteInicial(nome: string) {
  if (nome === "Sicredi Região da Produção RS/SC/MG") return "Sicredi Região da Produção";
  if (nome === "Sicredi Sul Minas RS/MG") return "Sicredi Sul Minas";
  return nome;
}

export function PastasProjeto({ project, isAdmin }: { project: any; isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const [clientFolder, setClientFolder] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const confirmar = useConfirm();
  const qc = useQueryClient();
  const key = ["pastas-projeto", project.id];
  const { data, error, isPending } = useQuery({
    queryKey: key, enabled: open, retry: false, refetchInterval: open ? 5000 : false,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("pastas_estado", { _project_id: project.id });
      if (error) throw error;
      return data;
    },
  });
  const job = data?.job;
  const nomeCliente = clientFolder ?? data?.client_folder ?? pastaClienteInicial(project.client_name || "");
  const date = new Date(project.criado_em || project.created_at);
  const month = Number(new Intl.DateTimeFormat("en", { timeZone: "America/Sao_Paulo", month: "numeric" }).format(date));
  const year = new Intl.DateTimeFormat("en", { timeZone: "America/Sao_Paulo", year: "numeric" }).format(date);
  const mes = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", month: "long" }).format(date);
  const caminho = `PROJETOS_ATIVOS / _. Database ${year} / 01. Clientes - Projetos / ${String(month).padStart(2, "0")}. ${mes.charAt(0).toUpperCase()+mes.slice(1)} / ${nomeCliente} / ${project.nome_padrao || project.name}`;

  const caminhoCriado = `PROJETOS_ATIVOS/${job?.relative_path || ""}`;

  const pedir = async () => {
    setBusy(true);
    try {
      const { error } = await (supabase as any).rpc("pastas_solicitar", { _project_id: project.id, _client_folder: nomeCliente });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: key });
      toast.success("Pedido enviado ao servidor");
    } catch (e: any) { toast.error("Não foi possível solicitar as pastas", { description: e.message }); }
    finally { setBusy(false); }
  };
  const configurar = async () => {
    if (!(await confirmar({ title: "Configurar o servidor de pastas?", description: data?.configured
      ? "Uma nova chave será gerada. O conector atual para de funcionar até instalar a nova configuração no servidor."
      : "Baixe a configuração e instale o conector uma única vez no servidor Unraid.", confirmText: "Baixar configuração" }))) return;
    setBusy(true);
    try {
      const { data: token, error } = await (supabase as any).rpc("pastas_configurar_servidor");
      if (error) throw error;
      const blob = new Blob([JSON.stringify({ url: import.meta.env.VITE_SUPABASE_URL,
        public_key: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, token }, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob); const a = document.createElement("a");
      a.href = url; a.download = "adverse-pastas-config.json"; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      await qc.invalidateQueries({ queryKey: key });
      toast.success("Configuração baixada. Instale no servidor Unraid.");
    } catch (e: any) { toast.error("Não foi possível configurar", { description: e.message }); }
    finally { setBusy(false); }
  };
  return <>
    <Button variant="outline" size="sm" onClick={() => setOpen(true)}><FolderPlus className="mr-2 h-4 w-4" />Pastas no servidor</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader><DialogTitle>Pastas do projeto</DialogTitle></DialogHeader>
        {isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : error ? <p className="text-sm text-muted-foreground">Integração indisponível. Tente novamente após configurar o sistema.</p> : <>
          <p className={`text-xs ${data?.online ? "text-success" : "text-muted-foreground"}`}>{data?.online ? "Servidor conectado" : data?.configured ? "Servidor desconectado · pedidos aguardam na fila" : "Servidor ainda não configurado"}</p>
          {job?.status === "ready" ? <>
            <p className="text-sm font-medium text-success">Pastas criadas</p>
            <p className="break-all rounded-lg bg-muted p-3 text-sm">{caminhoCriado}</p>
            <Button variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(caminhoCriado); toast.success("Caminho copiado"); } catch { toast.error("Não foi possível copiar"); } }}><Copy className="mr-2 h-4 w-4" />Copiar caminho</Button>
          </> : <>
            <Label htmlFor="pasta-cliente">Pasta do cliente no servidor</Label>
            <Input id="pasta-cliente" value={nomeCliente} disabled={busy || ["pending","working"].includes(job?.status)} onChange={e=>setClientFolder(e.target.value)} />
            <p className="break-words rounded-lg bg-muted p-3 text-xs leading-relaxed text-muted-foreground">{caminho}</p>
            {!project.client_id && <p role="alert" className="text-sm text-muted-foreground">Vincule um cliente ao projeto para criar as pastas.</p>}
            {job?.status === "error" && <p role="alert" className="text-sm text-destructive">{job.error}</p>}
            {["pending","working"].includes(job?.status) ? <p role="status" className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />{job.status === "working" ? "Criando pastas…" : "Aguardando o servidor"}</p>
              : <Button disabled={busy || !data?.configured || !nomeCliente.trim() || !project.client_id} onClick={pedir}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{job?.status === "error" ? "Tentar novamente" : "Criar pastas"}</Button>}
          </>}
          {isAdmin && <details className="border-t border-border pt-3 text-xs text-muted-foreground">
            <summary className="cursor-pointer">Configurar servidor</summary>
            <div className="mt-3 space-y-3">
              <Button size="sm" variant="outline" disabled={busy} onClick={configurar}><Settings2 className="mr-2 h-4 w-4" />Baixar configuração</Button>
              <a className="block text-primary underline" href="/integracoes/adverse-pastas-unraid.tar.gz" download>Baixar conector para Unraid</a>
              <p>Instale uma vez pelo terminal do Unraid. Guarde o arquivo de configuração; ele contém a chave do conector.</p>
            </div>
          </details>}
        </>}
      </DialogContent>
    </Dialog>
  </>;
}
