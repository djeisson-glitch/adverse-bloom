import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Textarea } from "@/components/ui/textarea";
import { corDoUsuario, handleUsuario } from "@/lib/coresUsuario";

/**
 * Textarea com autocomplete de @menção.
 *
 * Digita "@" e começa a escrever → aparece a lista de gente do sistema.
 * Setas pra navegar, Enter/Tab pra escolher, Esc pra fechar. Escolher insere
 * "@Nome " no texto. Antes o @ só era reconhecido DEPOIS de enviar (tinha que
 * acertar o nome de cabeça) — agora o sistema mostra quem dá pra mencionar.
 *
 * Enter envia (quando onSubmit é passado); Shift+Enter quebra linha. Enquanto a
 * lista de menção está aberta, o Enter escolhe a pessoa (não envia).
 */
export type PessoaMencionavel = { id: string; full_name?: string | null; email?: string | null; ativo?: boolean };

function primeiroNome(p: PessoaMencionavel) {
  return (p.full_name || p.email || "").split(" ")[0] || "";
}
function rotulo(p: PessoaMencionavel) {
  return p.full_name || p.email || "?";
}

export function MentionTextarea({
  value,
  onChange,
  profiles,
  placeholder,
  rows = 2,
  className = "",
  onSubmit,
}: {
  value: string;
  onChange: (v: string) => void;
  profiles: PessoaMencionavel[];
  placeholder?: string;
  rows?: number;
  className?: string;
  onSubmit?: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [aberto, setAberto] = useState(false);
  const [query, setQuery] = useState("");
  const [inicio, setInicio] = useState(0); // índice do "@" no texto
  const [ativo, setAtivo] = useState(0);

  const candidatos = useMemo(() => {
    if (!aberto) return [];
    const q = query
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    return profiles
      // Quem saiu da operacao nao e' SUGERIDO. A lista inteira continua
      // chegando aqui de proposito: e' ela que resolve o nome de quem
      // escreveu mensagem antiga. Filtrar na consulta apagaria o historico.
      // `!== false` e nao `=== true`: quem nao manda o campo segue aparecendo.
      .filter((p) => p.ativo !== false)
      .filter((p) => {
        const nome = rotulo(p)
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");
        return !q || nome.includes(q);
      })
      .slice(0, 6);
  }, [aberto, query, profiles]);

  function detectar(texto: string, cursor: number) {
    // Pega "@palavra" imediatamente antes do cursor (sem espaço no meio).
    const antes = texto.slice(0, cursor);
    const m = antes.match(/(?:^|\s)@([\p{L}0-9._-]*)$/u);
    if (m) {
      setInicio(cursor - m[1].length - 1); // -1 pelo "@"
      setQuery(m[1]);
      setAberto(true);
      setAtivo(0);
    } else {
      setAberto(false);
    }
  }

  function escolher(p: PessoaMencionavel) {
    const el = ref.current;
    const cursor = el?.selectionStart ?? value.length;
    const nome = primeiroNome(p);
    const novo = value.slice(0, inicio) + `@${nome} ` + value.slice(cursor);
    onChange(novo);
    setAberto(false);
    // Recoloca o cursor logo depois da menção inserida.
    const pos = inicio + nome.length + 2;
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  }

  function aoTeclar(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (aberto && candidatos.length) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setAtivo((a) => (a + 1) % candidatos.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setAtivo((a) => (a - 1 + candidatos.length) % candidatos.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        escolher(candidatos[ativo]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setAberto(false);
        return;
      }
    }
    // Enter envia (a lista fechada aqui). Shift+Enter cai fora e quebra linha,
    // como no WhatsApp. ⌘/Ctrl+Enter também envia, por hábito.
    if (e.key === "Enter" && !e.shiftKey && onSubmit) {
      e.preventDefault();
      if (value.trim()) onSubmit();
    }
  }

  return (
    <div className="relative flex-1">
      <Textarea
        ref={ref}
        rows={rows}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          detectar(e.target.value, e.target.selectionStart ?? e.target.value.length);
        }}
        onKeyDown={aoTeclar}
        onBlur={() => setTimeout(() => setAberto(false), 120)} // dá tempo do clique no item
        placeholder={placeholder}
        className={`w-full ${className}`}
      />
      {aberto && candidatos.length > 0 && (
        <div className="absolute bottom-full left-0 z-50 mb-1 w-64 overflow-hidden rounded-md border border-border bg-popover p-1 shadow-lg">
          {candidatos.map((p, i) => (
            <button
              key={p.id}
              type="button"
              // onMouseDown (não onClick) pra rodar antes do onBlur fechar a lista.
              onMouseDown={(e) => {
                e.preventDefault();
                escolher(p);
              }}
              onMouseEnter={() => setAtivo(i)}
              className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm ${
                i === ativo ? "bg-muted" : "hover:bg-muted"
              }`}
            >
              <span
                className="cor-usuario flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold"
                style={{ backgroundColor: `${corDoUsuario(p.id)}26`, color: corDoUsuario(p.id) }}
              >
                {rotulo(p).slice(0, 2).toUpperCase()}
              </span>
              <span className="cor-usuario font-medium" style={{ color: corDoUsuario(p.id) }}>@{handleUsuario(rotulo(p))}</span>
              <span className="truncate text-xs text-muted-foreground">{rotulo(p)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
