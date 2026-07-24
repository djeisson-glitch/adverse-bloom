import { LogoAdverse } from "@/components/LogoAdverse";

/**
 * Cabeçalho e rodapé das páginas que vão PRA FORA (cadastros, solicitação de
 * demanda, portal e proposta). Duas garantias em um lugar só: a marca aparece
 * sempre, e todo link carrega o aviso de confidencialidade / uso interno.
 */

export type TemaPublico = "escuro" | "claro";

export function CabecalhoPublico({
  tema, titulo, subtitulo,
}: {
  tema: TemaPublico; titulo: string; subtitulo?: string;
}) {
  const claro = tema === "claro";
  return (
    <header className="mb-8 text-center">
      <LogoAdverse className={`mx-auto h-7 ${claro ? "text-slate-900" : "text-white"}`} />
      <h1 className={`mt-5 text-2xl font-bold ${claro ? "text-slate-900" : "text-zinc-50"}`}>{titulo}</h1>
      {subtitulo && (
        <p className={`mt-1 text-sm ${claro ? "text-slate-600" : "text-zinc-400"}`}>{subtitulo}</p>
      )}
    </header>
  );
}

/** Aviso de confidencialidade — obrigatório em toda página de link externo. */
export function RodapeConfidencial({ tema }: { tema: TemaPublico }) {
  const claro = tema === "claro";
  return (
    <footer className="mt-10 space-y-3 text-center">
      <div
        className={`rounded-lg border px-4 py-3 text-xs ${
          claro
            ? "border-slate-200 bg-slate-100 text-slate-600"
            : "border-zinc-800 bg-zinc-900/60 text-zinc-400"
        }`}
      >
        <strong className={claro ? "text-slate-800" : "text-zinc-200"}>Documento confidencial · uso interno.</strong>{" "}
        Este link é pessoal e destinado apenas ao destinatário autorizado. Não compartilhe com terceiros
        sem autorização da Adverse.
      </div>
      <p className={`flex items-center justify-center gap-1.5 text-[11px] ${claro ? "text-slate-500" : "text-zinc-600"}`}>
        <LogoAdverse className={`h-3 ${claro ? "text-slate-500" : "text-zinc-600"}`} />
        <span>· {new Date().getFullYear()}</span>
      </p>
    </footer>
  );
}
