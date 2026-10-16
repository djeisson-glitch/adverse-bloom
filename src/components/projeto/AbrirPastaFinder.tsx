import { useState } from "react";
import { FolderCheck, Settings2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

const SETUP_KEY = "adverse-finder-setup-v1";
function configured() {
  try { return localStorage.getItem(SETUP_KEY) === "1"; } catch { return false; }
}

export function AbrirPastaFinder({ href, detail }: { href: string; detail: string }) {
  const [installed, setInstalled] = useState(configured);
  const [setup, setSetup] = useState(false);
  function confirmSetup() {
    setInstalled(true);
    try { localStorage.setItem(SETUP_KEY, "1"); } catch { /* A sessão atual continua funcionando. */ }
    setSetup(false);
  }
  return <>
    <span className="inline-flex items-center gap-2">
      <a href={href} aria-label="Abrir pasta no Finder" title={`Abrir no Finder · ${detail}`}
        onClick={event => { if (!installed) { event.preventDefault(); setSetup(true); } }}
        className="inline-flex items-center gap-1.5 rounded text-xs text-success hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <FolderCheck aria-hidden="true" className="h-3.5 w-3.5 shrink-0" /> Pastas criadas
      </a>
      <button type="button" onClick={() => setSetup(true)} aria-label="Configurar abertura no Finder"
        title="Instalar ou configurar Adverse Finder" className="rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Settings2 aria-hidden="true" className="h-3 w-3" />
      </button>
    </span>
    <Dialog open={setup} onOpenChange={setSetup}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>Abrir no Finder</DialogTitle>
        <DialogDescription>Instale o auxiliar uma vez em cada Mac.</DialogDescription>
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>Baixe e extraia o arquivo.</li>
          <li>Arraste <strong>Adverse Finder</strong> para Aplicativos e abra uma vez.</li>
          <li>Volte aqui e clique em <strong>Já instalei</strong>.</li>
        </ol>
        <p className="text-xs text-muted-foreground">Se o macOS bloquear a abertura, siga o LEIA-ME do pacote. Use a rede da ADVERSE.</p>
        <div className="flex flex-wrap gap-2">
          <a href="/integracoes/adverse-finder-mac.zip" download className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted">Baixar auxiliar para Mac</a>
          <a href={href} onClick={confirmSetup} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">Já instalei · Abrir pasta</a>
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
