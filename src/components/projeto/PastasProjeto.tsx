import { useQuery } from "@tanstack/react-query";
import { FolderCheck, FolderClock, FolderX, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { urlPastaServidor } from "@/lib/pastaServidor";
import { AbrirPastaFinder } from "./AbrirPastaFinder";

export function PastasProjeto({ projectId }: { projectId: string }) {
  const { data, error, isPending } = useQuery({
    queryKey: ["pastas-projeto", projectId],
    enabled: !!projectId,
    retry: false,
    refetchInterval: (query) => {
      const status = query.state.data?.job?.status;
      if (status === "ready") return false;
      return status === "pending" || status === "working" ? 10000 : 30000;
    },
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("pastas_estado", { _project_id: projectId });
      if (error) throw error;
      return data;
    },
  });
  const job = data?.job;
  let label = "Pastas: aguardando liberação";
  let detail = "Criação automática ao liberar em Pré-produção ou Pronto pra editar.";
  let Icon = FolderClock;
  let tone = "text-muted-foreground";

  if (isPending) {
    label = "Verificando pastas…";
    detail = "Consultando o status das pastas.";
    Icon = Loader2;
  } else if (error) {
    label = "Pastas: status indisponível";
    detail = "Não foi possível consultar o servidor.";
    Icon = FolderX;
  } else if (job?.status === "ready") {
    label = "Pastas criadas";
    detail = `PROJETOS_ATIVOS/${job.relative_path}`;
    Icon = FolderCheck;
    tone = "text-success";
  } else if (job?.status === "error") {
    label = "Pastas: erro na criação";
    detail = job.error || "Confira o conector no servidor.";
    Icon = FolderX;
    tone = "text-destructive";
  } else if (!data?.configured) {
    label = "Pastas: servidor não configurado";
    detail = "O conector precisa ser configurado no servidor.";
  } else if (job?.status === "pending" || job?.status === "working") {
    label = job.status === "working" && data.online ? "Criando pastas…" : "Pastas: aguardando servidor";
    detail = data.online ? "Pedido automático em processamento." : "O pedido será atendido quando o servidor conectar.";
    if (job.status === "working" && data.online) Icon = Loader2;
  }

  const folderUrl = !error && job?.status === "ready" ? urlPastaServidor(job.relative_path) : null;
  if (folderUrl) return (
    <span role="status" aria-live="polite" title={detail}>
      <AbrirPastaFinder href={folderUrl} detail={detail} />
    </span>
  );

  return (
    <span role="status" aria-live="polite" title={detail} className={`inline-flex items-center gap-1.5 text-xs ${tone}`}>
      <Icon aria-hidden="true" className={`h-3.5 w-3.5 shrink-0 ${Icon === Loader2 ? "animate-spin" : ""}`} />
      {label}
    </span>
  );
}
