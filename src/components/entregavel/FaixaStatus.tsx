import { PessoaAvatar } from "@/components/PessoaAvatar";
import { primeiroNome } from "@/lib/pessoa";
import { iconeStatus, statusLabel, statusTom } from "@/lib/statusEntregavel";

/**
 * Onde a peça está — e com quem está a bola.
 *
 * O status morava dentro do card do fluxo, cercado de botão verde, botão
 * vermelho, selo de retrabalho, trilha R1/R2/Cliente, etapa de pós e cobrança.
 * Tudo colorido, tudo do mesmo tamanho: pra saber em que pé estava a peça era
 * preciso PROCURAR — e a informação mais importante da tela é justamente essa.
 *
 * Aqui ela é a primeira coisa da página e a única coisa da faixa. O card de
 * fluxo abaixo continua respondendo a outra pergunta ("o que eu faço agora"),
 * que é o que os botões são.
 *
 * A segunda linha existe porque "Revisão 1" sozinho não diz quem tem que
 * agir — e "quem tem que agir" é o que trava uma peça na fila.
 */

const CORES: Record<string, { faixa: string; barra: string; texto: string }> = {
  primary:     { faixa: "bg-primary/10 border-primary/30",         barra: "bg-primary",       texto: "text-primary" },
  warning:     { faixa: "bg-warning/10 border-warning/30",         barra: "bg-warning",       texto: "text-warning" },
  destructive: { faixa: "bg-destructive/10 border-destructive/30", barra: "bg-destructive",   texto: "text-destructive" },
  success:     { faixa: "bg-success/10 border-success/30",         barra: "bg-success",       texto: "text-success" },
  info:        { faixa: "bg-cyan-500/10 border-cyan-500/30",       barra: "bg-cyan-500",      texto: "text-info" },
  muted:       { faixa: "bg-muted/40 border-border",               barra: "bg-foreground/40", texto: "text-foreground" },
};

/** Com quem está a bola agora — o que decide se a peça anda ou fica parada. */
export function donoDaVez(
  status: string,
  entregavel: any,
  n1: string | null,
  n2: string | null,
  profiles: any[],
): { pessoa: any | null; papel: string; encerrado: boolean } {
  const acha = (id: string | null | undefined) => (id ? profiles.find((p) => p.id === id) || null : null);

  if (["entregue", "aprovado", "faturado"].includes(status)) {
    return { pessoa: null, papel: "nada a fazer — a peça está encerrada", encerrado: true };
  }
  if (status === "com_cliente") {
    return { pessoa: null, papel: "com o cliente, aguardando retorno", encerrado: false };
  }
  if (status === "pronto") {
    return { pessoa: null, papel: "com a coordenação, pra enviar ao cliente", encerrado: false };
  }
  if (status === "revisao_n2") {
    return { pessoa: acha(n2), papel: "revisa (Revisão 2)", encerrado: false };
  }
  if (status === "revisao_n1" || status === "revisao") {
    return { pessoa: acha(n1), papel: "revisa", encerrado: false };
  }
  // Resto do ciclo (pendente, em edição, em pausa, ajustes) é do editor.
  return { pessoa: acha(entregavel.responsavel_id), papel: "edita", encerrado: false };
}

function desdeQuando(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const dias = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (dias <= 0) return "desde hoje";
  if (dias === 1) return "desde ontem";
  return `há ${dias} dias`;
}

export function FaixaStatus({
  status, entregavel, n1, n2, profiles,
}: {
  status: string; entregavel: any;
  n1: string | null; n2: string | null; profiles: any[];
}) {
  const Icone = iconeStatus(status);
  const c = CORES[statusTom(status)] || CORES.muted;
  const { pessoa, papel, encerrado } = donoDaVez(status, entregavel, n1, n2, profiles);
  const desde = desdeQuando(entregavel.updated_at);
  const retrab = !!entregavel.retrabalho;

  return (
    // Gruda no topo ao rolar. A peça é longa (briefing, alterações, timesheet,
    // anexos) e a etapa é justamente o que se quer conferir enquanto se lê o
    // resto — voltar ao topo pra lembrar em que pé estava é o que a faixa veio
    // evitar. `top-0` e não `top-14`: quem rola é o <main>, então zero já é
    // logo abaixo do cabeçalho do app. Fundo opaco porque o conteúdo passa
    // por baixo.
    <div className="sticky top-0 z-10 -mx-1 bg-background/95 px-1 pb-2 pt-1 backdrop-blur">
      <div className={`flex items-stretch overflow-hidden rounded-xl border shadow-sm ${c.faixa}`}>
        {/* Barra sólida na cor da etapa: dá pra saber a etapa pelo canto do
            olho, de longe, sem ler. */}
        <div className={`w-1.5 shrink-0 ${c.barra}`} />

        <div className="flex flex-1 flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Status do entregável
            </p>
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              <Icone className={`h-5 w-5 shrink-0 ${c.texto}`} />
              <span className={`text-xl font-bold leading-none ${c.texto}`}>{statusLabel(status)}</span>
              {desde && <span className="text-xs text-muted-foreground">· {desde}</span>}
              {retrab && (
                <span
                  className="rounded-md bg-warning/15 px-2 py-0.5 text-[10px] font-medium text-warning"
                  title="Teve ajuste interno ou alteração do cliente — passa por 1 revisão só"
                >
                  ↻ retrabalho · revisão única
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {pessoa ? (
              <>
                <PessoaAvatar
                  nome={pessoa.full_name || pessoa.email}
                  foto={pessoa.avatar_url}
                  seed={pessoa.id}
                  tamanho={32}
                />
                <div className="leading-tight">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    A bola está com
                  </p>
                  <p className="text-sm font-semibold text-foreground">
                    {primeiroNome(pessoa.full_name || pessoa.email)}{" "}
                    <span className="font-normal text-muted-foreground">· {papel}</span>
                  </p>
                </div>
              </>
            ) : (
              <div className="leading-tight">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {encerrado ? "Fim de linha" : "A bola está"}
                </p>
                <p className="text-sm font-semibold text-foreground">{papel}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
