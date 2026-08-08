import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ExternalLink, Download, FileText } from "lucide-react";

/**
 * Ver o anexo sem sair da página.
 *
 * Pedido do Djêisson: "seria muito incrível se a gente conseguisse clicar
 * nesse link e ele abrir tipo um pop-up pra visualizar, ao invés de abrir no
 * navegador". O gesto real é conferir o roteiro DURANTE a edição — abrir uma
 * aba tira a peça da tela, e voltar custa a atenção que estava no trabalho.
 *
 * O que abre aqui: PDF, imagem e vídeo, que é o que a Adverse anexa. O resto
 * (docx, xlsx, link do Drive) o navegador não renderiza embutido, então nem
 * finge: mostra o arquivo e leva pro lugar certo em uma aba, com o download
 * ao lado. Modal que abre em branco é pior que link honesto.
 */

export type Anexo = { nome: string; url: string; tipo?: string | null; mime?: string | null };

/** O que dá pra mostrar embutido de verdade. */
export function podeVerAqui(a: Anexo): boolean {
  const url = (a.url || "").toLowerCase().split("?")[0];
  const mime = (a.mime || "").toLowerCase();
  if (a.tipo === "foto" || mime.startsWith("image/") || /\.(png|jpe?g|webp|gif|avif)$/.test(url)) return true;
  if (a.tipo === "video" || mime.startsWith("video/") || /\.(mp4|webm|mov)$/.test(url)) return true;
  if (mime === "application/pdf" || /\.pdf$/.test(url)) return true;
  return false;
}

function Tipo(a: Anexo): "imagem" | "video" | "pdf" | "outro" {
  const url = (a.url || "").toLowerCase().split("?")[0];
  const mime = (a.mime || "").toLowerCase();
  if (a.tipo === "foto" || mime.startsWith("image/") || /\.(png|jpe?g|webp|gif|avif)$/.test(url)) return "imagem";
  if (a.tipo === "video" || mime.startsWith("video/") || /\.(mp4|webm|mov)$/.test(url)) return "video";
  if (mime === "application/pdf" || /\.pdf$/.test(url)) return "pdf";
  return "outro";
}

export function VisualizarAnexo({ anexo, onClose }: { anexo: Anexo | null; onClose: () => void }) {
  if (!anexo) return null;
  const tipo = Tipo(anexo);

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-5xl gap-0 p-0">
        <div className="flex items-center gap-3 border-b border-border/60 px-4 py-2.5">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground" title={anexo.nome}>
            {anexo.nome}
          </p>
          {/* Abrir fora e baixar ficam SEMPRE à mão: o modal é pra conferir
              rápido, não pra substituir o arquivo. */}
          <a
            href={anexo.url} target="_blank" rel="noreferrer"
            className="flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-xs text-muted-foreground hover:text-primary"
          >
            <ExternalLink className="h-3.5 w-3.5" /> abrir
          </a>
          <a
            href={anexo.url} download
            className="flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-xs text-muted-foreground hover:text-primary"
          >
            <Download className="h-3.5 w-3.5" /> baixar
          </a>
        </div>

        <div className="max-h-[78vh] overflow-auto bg-black/40">
          {tipo === "imagem" && (
            <img src={anexo.url} alt={anexo.nome} className="mx-auto max-h-[78vh] w-auto" />
          )}
          {tipo === "video" && (
            <video src={anexo.url} controls autoPlay className="mx-auto max-h-[78vh] w-full bg-black" />
          )}
          {tipo === "pdf" && (
            // 78vh e não 100%: o <object> precisa de altura explícita, senão
            // colapsa pra zero e o PDF "não abre".
            <object data={anexo.url} type="application/pdf" className="h-[78vh] w-full">
              <p className="p-6 text-center text-sm text-muted-foreground">
                Seu navegador não mostra PDF aqui dentro — use "abrir" acima.
              </p>
            </object>
          )}
          {tipo === "outro" && (
            <p className="p-10 text-center text-sm text-muted-foreground">
              Este tipo de arquivo não abre aqui dentro. Use "abrir" ou "baixar" acima.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
