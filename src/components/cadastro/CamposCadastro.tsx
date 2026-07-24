import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ReactNode } from "react";

/**
 * Primitivos dos formulários públicos de cadastro (fornecedor e freelancer).
 * Os dois são a MESMA estrutura em temas diferentes — fornecedor no escuro,
 * freelancer no claro — então o tema vem por prop em vez de duplicar tela.
 */

export type Tema = "escuro" | "claro";

export const est = (t: Tema) => ({
  pagina: t === "escuro" ? "min-h-screen bg-[#0b0b0d] text-zinc-100" : "min-h-screen bg-slate-50 text-slate-900",
  cartao: t === "escuro"
    ? "rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 sm:p-6"
    : "rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm",
  seccao: t === "escuro"
    ? "text-[11px] font-semibold uppercase tracking-wider text-indigo-400"
    : "text-[11px] font-semibold uppercase tracking-wider text-slate-500",
  rotulo: t === "escuro" ? "mb-1.5 block text-sm text-zinc-300" : "mb-1.5 block text-sm text-slate-700",
  campo: t === "escuro"
    ? "w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-indigo-500"
    : "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-500",
  nota: t === "escuro"
    ? "rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 text-xs text-zinc-400"
    : "rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600",
  botao: t === "escuro"
    ? "w-full rounded-xl bg-indigo-600 py-3.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
    : "w-full rounded-xl bg-blue-600 py-3.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50",
  rodape: t === "escuro" ? "text-center text-xs text-zinc-600" : "text-center text-xs text-slate-500",
});

export function Secao({ titulo, tema, children }: { titulo: string; tema: Tema; children: ReactNode }) {
  const s = est(tema);
  return (
    <section className={s.cartao}>
      <p className={`${s.seccao} mb-4`}>{titulo}</p>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

/** Linha com 1 ou 2 campos lado a lado (empilha no celular). */
export function Linha({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}

export function Campo({
  rotulo, tema, valor, onChange, placeholder, tipo = "text", obrigatorio, area,
}: {
  rotulo: string; tema: Tema; valor: string; onChange: (v: string) => void;
  placeholder?: string; tipo?: string; obrigatorio?: boolean; area?: boolean;
}) {
  const s = est(tema);
  return (
    <div>
      <label className={s.rotulo}>
        {rotulo} {obrigatorio && <span className="text-red-500">*</span>}
      </label>
      {area ? (
        <textarea className={s.campo} rows={3} value={valor} placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input className={s.campo} type={tipo} value={valor} placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

/** Lista de funções vinda do banco — mesma taxonomia nos dois formulários. */
export function useFuncoes() {
  return useQuery({
    queryKey: ["funcoes-parceiro"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("funcoes_parceiro").select("id, nome, grupo, ordem").order("ordem");
      return (data as { id: string; nome: string; grupo: string | null }[]) || [];
    },
    staleTime: 60 * 60 * 1000,
  });
}

/** Seleção de funções (o ponto que o Djêisson pediu pra filtrar rápido depois). */
export function SeletorFuncoes({
  tema, selecionadas, onChange,
}: {
  tema: Tema; selecionadas: string[]; onChange: (v: string[]) => void;
}) {
  const s = est(tema);
  const { data: funcoes = [] } = useFuncoes();
  const alternar = (id: string) =>
    onChange(selecionadas.includes(id) ? selecionadas.filter((x) => x !== id) : [...selecionadas, id]);

  const grupos = funcoes.reduce((acc, f) => {
    const g = f.grupo || "Outros";
    (acc[g] = acc[g] || []).push(f);
    return acc;
  }, {} as Record<string, typeof funcoes>);

  return (
    <div>
      <label className={s.rotulo}>Funções — marque tudo que você faz</label>
      <div className="space-y-3">
        {Object.entries(grupos).map(([grupo, itens]) => (
          <div key={grupo}>
            <p className={tema === "escuro" ? "mb-1.5 text-[11px] uppercase tracking-wide text-zinc-500" : "mb-1.5 text-[11px] uppercase tracking-wide text-slate-400"}>
              {grupo}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {itens.map((f) => {
                const on = selecionadas.includes(f.id);
                const base = "rounded-full border px-3 py-1.5 text-xs transition";
                const cls = tema === "escuro"
                  ? on ? "border-indigo-500 bg-indigo-500/20 text-indigo-200" : "border-zinc-800 text-zinc-400 hover:border-zinc-700"
                  : on ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-300 text-slate-600 hover:border-slate-400";
                return (
                  <button key={f.id} type="button" onClick={() => alternar(f.id)} className={`${base} ${cls}`}>
                    {f.nome}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Tela de "recebemos seu cadastro". */
export function Enviado({ tema, titulo }: { tema: Tema; titulo: string }) {
  const s = est(tema);
  return (
    <div className={`${s.pagina} flex items-center justify-center p-6`}>
      <div className={`${s.cartao} max-w-md text-center`}>
        <p className="mb-2 text-3xl">✅</p>
        <h1 className="mb-2 text-xl font-semibold">Cadastro enviado!</h1>
        <p className={tema === "escuro" ? "text-sm text-zinc-400" : "text-sm text-slate-600"}>
          Recebemos seus dados de {titulo}. A equipe da Adverse entra em contato quando surgir um trabalho com o seu perfil.
        </p>
      </div>
    </div>
  );
}
