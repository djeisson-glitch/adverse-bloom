import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { iniciais } from "@/lib/pessoa";
import { corDoUsuario } from "@/lib/coresUsuario";

/**
 * A pessoa, com foto.
 *
 * Rosto se reconhece antes de o olho terminar de ler duas letras — num chat
 * de projeto ou numa lista de escalados, é a diferença entre varrer e ler.
 * A foto já vem do Google no primeiro acesso (profiles.avatar_url); o que
 * faltava era usá-la.
 *
 * Sem foto, cai nas iniciais coloridas por pessoa — a mesma cor sempre, então
 * mesmo o fallback é reconhecível de relance.
 *
 * `referrerPolicy="no-referrer"` porque o CDN do Google devolve 403 pra
 * requisição com referer de outro domínio, e o avatar sumiria em produção.
 */
export function PessoaAvatar({ nome, foto, seed, tamanho = 28, titulo, className = "" }: {
  nome?: string | null;
  foto?: string | null;
  /** Fonte da cor — passe o id da pessoa pra bater com o resto do sistema. */
  seed?: string | null;
  /** px — o mesmo número vira largura, altura e proporção da fonte. */
  tamanho?: number;
  titulo?: string;
  className?: string;
}) {
  // Mesma função do chat: a cor da pessoa tem que ser a mesma em toda tela.
  const cor = corDoUsuario(seed ?? nome ?? "");
  return (
    <Avatar
      className={`shrink-0 ${className}`}
      style={{ width: tamanho, height: tamanho }}
      title={titulo ?? nome ?? undefined}
    >
      {foto && <AvatarImage src={foto} alt={nome || ""} referrerPolicy="no-referrer" />}
      <AvatarFallback
        className="font-semibold"
        style={{ backgroundColor: `${cor}26`, color: cor, fontSize: Math.max(9, Math.round(tamanho * 0.36)) }}
      >
        {iniciais(nome)}
      </AvatarFallback>
    </Avatar>
  );
}

/**
 * Fila de pessoas sobrepostas — equipe de um projeto, escalados de uma
 * diária. Mostra até `max` e resume o resto em "+N", que é o suficiente pra
 * saber que tem mais gente sem estourar a linha.
 */
export function PessoasAvatares({ pessoas, max = 5, tamanho = 28 }: {
  pessoas: { nome?: string | null; foto?: string | null; seed?: string | null }[];
  max?: number;
  tamanho?: number;
}) {
  const mostrar = pessoas.slice(0, max);
  const resto = pessoas.length - mostrar.length;
  return (
    <div className="flex items-center -space-x-1.5">
      {mostrar.map((p, i) => (
        <PessoaAvatar
          key={i}
          nome={p.nome}
          foto={p.foto}
          seed={p.seed}
          tamanho={tamanho}
          className="ring-2 ring-background"
        />
      ))}
      {resto > 0 && (
        <span
          className="flex items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground ring-2 ring-background"
          style={{ width: tamanho, height: tamanho }}
          title={pessoas.slice(max).map((p) => p.nome).filter(Boolean).join(", ")}
        >
          +{resto}
        </span>
      )}
    </div>
  );
}
