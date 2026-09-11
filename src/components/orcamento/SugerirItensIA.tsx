import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Loader2, Trash2, Plus, Paperclip, X, FileText, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";

type Categoria = { id: string; codigo: string; nome: string; ordem: number };
type BudgetItem = { categoria_id: string | null };

type Sugestao = {
  chave: string;
  categoriaId: string | null;
  descricao: string;
  quantity: number;
  diaria: number;
  justificativa: string;
  incluido: boolean;
};

/**
 * PDF e imagem vão como arquivo pra IA (ela lê layout, tabela, print de
 * WhatsApp). Word e texto puro viram texto aqui no navegador — a API não lê
 * .docx.
 */
type Anexo = {
  chave: string;
  nome: string;
  tamanho: number;
  media_type?: string;
  base64?: string;
  texto?: string;
};

// Mesmos tetos da edge function (sugerir-itens-orcamento).
const MAX_ANEXOS = 10;
const MAX_BASE64 = 24 * 1024 * 1024;
const MAX_PDF = 18 * 1024 * 1024;
const MAX_TEXTO = 400_000;

const porHora = (cat?: Categoria) =>
  cat ? cat.codigo === "011" || /p[óo]s\s*produ/i.test(cat.nome || "") : false;

const tamanhoLegivel = (b: number) =>
  b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;

function paraBase64(blob: Blob): Promise<string> {
  return new Promise((ok, erro) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(",")[1] || "");
    r.onerror = () => erro(r.error);
    r.readAsDataURL(blob);
  });
}

/**
 * Print de celular tem 4000px e passa do limite da API. A IA reduz tudo pra
 * ~1568px de qualquer jeito, então reduzir aqui não perde nada e deixa o
 * envio leve.
 */
async function reduzirImagem(file: File): Promise<{ media_type: string; base64: string }> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    throw new Error(`${file.name}: o navegador não abriu essa imagem (HEIC?). Exporte como JPG ou PNG.`);
  }
  const escala = Math.min(1, 1568 / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * escala);
  const h = Math.round(bmp.height * escala);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  // Fundo transparente viraria preto no JPEG — e texto preto some.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const blob = await new Promise<Blob>((ok, erro) =>
    canvas.toBlob((b) => (b ? ok(b) : erro(new Error(`${file.name}: não consegui converter`))), "image/jpeg", 0.85),
  );
  return { media_type: "image/jpeg", base64: await paraBase64(blob) };
}

async function lerArquivo(file: File): Promise<Anexo> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  const base = { chave: `${file.name}-${file.size}-${Math.random()}`, nome: file.name, tamanho: file.size };

  if (file.type === "application/pdf" || ext === "pdf") {
    if (file.size > MAX_PDF) throw new Error(`${file.name}: PDF passa de 18 MB — mande só as páginas que importam.`);
    return { ...base, media_type: "application/pdf", base64: await paraBase64(file) };
  }
  if (file.type.startsWith("image/")) {
    return { ...base, ...(await reduzirImagem(file)) };
  }
  if (ext === "docx") {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    if (!value.trim()) throw new Error(`${file.name}: não achei texto nesse Word.`);
    return { ...base, texto: value };
  }
  if (file.type.startsWith("text/") || ["txt", "md", "csv", "json"].includes(ext)) {
    return { ...base, texto: await file.text() };
  }
  if (ext === "doc") throw new Error(`${file.name}: Word antigo (.doc). Salve como .docx ou PDF.`);
  if (["pages", "key", "numbers"].includes(ext)) throw new Error(`${file.name}: exporte como PDF.`);
  throw new Error(`${file.name}: formato não suportado. Use PDF, Word, imagem ou texto.`);
}

/** supabase.functions.invoke devolve data=null em resposta não-2xx — a
 * mensagem em português da função fica no corpo da resposta, em error.context. */
async function mensagemDeErro(error: any, data: any): Promise<string> {
  if (data?.error) return data.error;
  try {
    const corpo = await error?.context?.json();
    if (corpo?.error) return corpo.error;
  } catch { /* corpo não era JSON */ }
  return error?.message || "Erro desconhecido";
}

/**
 * Montar a planilha com IA — um campo como o de um chat: escreve, cola texto
 * ou print, arrasta PDF/Word/imagem. A IA lê isso junto com o briefing já
 * salvo no orçamento e sugere QUAIS LINHAS entrar.
 *
 * Djêisson (10/09): "não sugira valores, os valores eu coloco depois". As
 * linhas nascem com client_unit_price 0 — o mesmo estado de uma linha criada
 * à mão em CategoriaItens — e não existe campo de preço em `Sugestao`. Nada é
 * gravado sem revisão e sem clicar em "Adicionar".
 */
export function SugerirItensIA({
  budgetId, categorias, itens, onChanged,
}: {
  budgetId: string;
  categorias: Categoria[];
  itens: BudgetItem[];
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const inputArquivo = useRef<HTMLInputElement>(null);
  const [texto, setTexto] = useState("");
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [lendo, setLendo] = useState(0);
  const [arrastando, setArrastando] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [sugestoes, setSugestoes] = useState<Sugestao[] | null>(null);
  const [adicionando, setAdicionando] = useState(false);

  const categoriaDe = (id: string | null) => categorias.find((c) => c.id === id);

  const adicionarArquivos = async (lista: FileList | File[]) => {
    const arquivos = Array.from(lista);
    if (!arquivos.length) return;
    if (anexos.length + arquivos.length > MAX_ANEXOS) {
      toast.error(`No máximo ${MAX_ANEXOS} arquivos por vez.`);
      return;
    }
    setLendo((n) => n + arquivos.length);
    const lidos = await Promise.all(
      arquivos.map((f) =>
        lerArquivo(f).catch((e: Error) => {
          toast.error("Arquivo não entrou", { description: e.message });
          return null;
        }),
      ),
    );
    setLendo((n) => n - arquivos.length);
    const ok = lidos.filter((a): a is Anexo => !!a);
    setAnexos((atual) => {
      const soma = [...atual, ...ok].reduce((s, a) => s + (a.base64?.length || 0), 0);
      if (soma > MAX_BASE64) {
        toast.error("Os arquivos juntos passam de ~18 MB", { description: "Mande menos de uma vez ou só as páginas que importam." });
        return atual;
      }
      return [...atual, ...ok];
    });
  };

  /**
   * Colar arquivo (print, arquivo copiado no Finder) anexa; colar TEXTO cola
   * no campo. Texto copiado do Word/Pages vem com uma imagem de brinde no
   * clipboard — se houver texto junto e só imagem de arquivo, é o caso do
   * Word, e o certo é colar o texto.
   */
  const aoColar = (e: React.ClipboardEvent) => {
    const arquivos = Array.from(e.clipboardData.files);
    if (!arquivos.length) return;
    const temTexto = !!e.clipboardData.getData("text/plain").trim();
    const soImagens = arquivos.every((f) => f.type.startsWith("image/"));
    if (temTexto && soImagens) return;
    e.preventDefault();
    adicionarArquivos(arquivos);
  };

  const gerar = async () => {
    const partes = [
      texto.trim(),
      ...anexos.filter((a) => a.texto).map((a) => `=== Arquivo: ${a.nome} ===\n${a.texto}`),
    ].filter(Boolean);
    const textoFinal = partes.join("\n\n");
    if (textoFinal.length > MAX_TEXTO) {
      return toast.error("Texto longo demais", { description: "Passa de ~400 mil caracteres. Mande só as partes que definem o escopo." });
    }
    setGerando(true);
    setSugestoes(null);
    const { data, error } = await (supabase as any).functions.invoke("sugerir-itens-orcamento", {
      body: {
        budget_id: budgetId,
        texto: textoFinal || undefined,
        anexos: anexos
          .filter((a) => a.base64)
          .map((a) => ({ nome: a.nome, media_type: a.media_type, base64: a.base64 })),
      },
    });
    setGerando(false);
    if (error || data?.error) {
      return toast.error("Não deu pra sugerir", { description: await mensagemDeErro(error, data) });
    }
    const lista: Sugestao[] = (data?.itens || []).map((it: any, i: number) => {
      const cat = categorias.find((c) => c.codigo === it.categoria_codigo) || null;
      return {
        chave: `${Date.now()}-${i}`,
        categoriaId: cat?.id || null,
        descricao: it.descricao,
        quantity: it.quantity,
        diaria: it.diaria,
        justificativa: it.justificativa || "",
        incluido: !!cat,
      };
    });
    setSugestoes(lista);
  };

  const atualizar = (chave: string, patch: Partial<Sugestao>) => {
    setSugestoes((lista) => (lista || []).map((s) => (s.chave === chave ? { ...s, ...patch } : s)));
  };
  const remover = (chave: string) => {
    setSugestoes((lista) => (lista || []).filter((s) => s.chave !== chave));
  };

  const selecionadas = (sugestoes || []).filter((s) => s.incluido && s.categoriaId);

  const adicionar = async () => {
    if (!selecionadas.length) return;
    setAdicionando(true);
    // Ordem por categoria: entra depois do que já existe, na ordem em que
    // aparece na lista — mesmo critério de CategoriaItens ao criar uma linha.
    const contagem = new Map<string, number>();
    itens.forEach((i) => {
      const k = i.categoria_id || "";
      contagem.set(k, (contagem.get(k) || 0) + 1);
    });
    const linhas = selecionadas.map((s) => {
      const cat = categoriaDe(s.categoriaId);
      const ordemAtual = (contagem.get(s.categoriaId!) || 0) + 1;
      contagem.set(s.categoriaId!, ordemAtual);
      return {
        budget_id: budgetId,
        categoria_id: s.categoriaId,
        category: cat?.nome || "",
        descricao: s.descricao,
        item_name: s.descricao,
        quantity: s.quantity,
        diaria: s.diaria,
        client_unit_price: 0,
        client_price: 0,
        tira_taxa: false,
        ordem: ordemAtual,
        observacoes: s.justificativa ? `Sugestão IA: ${s.justificativa}` : null,
      };
    });
    const { error } = await (supabase as any).from("budget_items").insert(linhas);
    setAdicionando(false);
    if (error) return toast.error("Não adicionou", { description: error.message });
    qc.invalidateQueries({ queryKey: ["orcamento-itens", budgetId] });
    onChanged();
    toast.success(`${linhas.length} ite${linhas.length === 1 ? "m" : "ns"} adicionado${linhas.length === 1 ? "" : "s"}`, {
      description: "Sem valor ainda — preencha o preço linha a linha na planilha.",
    });
    setSugestoes(null);
    setTexto("");
    setAnexos([]);
  };

  const podeGerar = !gerando && lendo === 0;

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => { e.preventDefault(); setArrastando(false); adicionarArquivos(e.dataTransfer.files); }}
        className={`space-y-2 rounded-lg border p-3 transition-colors ${
          arrastando ? "border-primary bg-primary/5" : "border-border/60 bg-muted/10"
        }`}
      >
        <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <Sparkles className="h-4 w-4 text-primary" />
          Montar com IA
        </p>
        <Textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onPaste={aoColar}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && podeGerar) { e.preventDefault(); gerar(); }
          }}
          placeholder="Descreva o job, cole o roteiro ou arraste arquivos…"
          className="min-h-[88px] resize-y border-border/50 bg-background text-sm"
        />

        {anexos.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {anexos.map((a) => (
              <span key={a.chave} className="flex items-center gap-1.5 rounded-md border border-border/60 bg-background px-2 py-1 text-[11px] text-foreground">
                {a.media_type?.startsWith("image/") ? <ImageIcon className="h-3 w-3 text-muted-foreground" /> : <FileText className="h-3 w-3 text-muted-foreground" />}
                <span className="max-w-[180px] truncate">{a.nome}</span>
                <span className="text-muted-foreground">{tamanhoLegivel(a.tamanho)}</span>
                <button onClick={() => setAnexos((l) => l.filter((x) => x.chave !== a.chave))} title="Tirar" className="text-muted-foreground hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <input
            ref={inputArquivo}
            type="file"
            multiple
            hidden
            accept=".pdf,.docx,.txt,.md,.csv,image/*"
            onChange={(e) => { if (e.target.files) adicionarArquivos(e.target.files); e.target.value = ""; }}
          />
          <Button size="sm" variant="ghost" onClick={() => inputArquivo.current?.click()} className="text-muted-foreground">
            <Paperclip className="mr-1 h-3.5 w-3.5" />
            Anexar
          </Button>
          {lendo > 0 && (
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> lendo arquivo…
            </span>
          )}
          <Button size="sm" className="ml-auto" onClick={gerar} disabled={!podeGerar} title="Lê também o briefing deste orçamento · ⌘ + Enter">
            {gerando ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
            {gerando ? "Lendo…" : sugestoes ? "Sugerir de novo" : "Sugerir itens"}
          </Button>
        </div>
      </div>

      {sugestoes && sugestoes.length > 0 && (
        <div className="space-y-2 rounded-lg border border-primary/30 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {sugestoes.length} {sugestoes.length === 1 ? "sugestão" : "sugestões"}
            </p>
            <button onClick={() => setSugestoes(null)} className="text-[11px] text-muted-foreground hover:text-foreground">
              Descartar
            </button>
          </div>
          {sugestoes.map((s) => {
            const cat = categoriaDe(s.categoriaId);
            return (
              <div key={s.chave} className="flex items-start gap-2 rounded-md border border-border/50 p-2.5">
                <input
                  type="checkbox"
                  checked={s.incluido}
                  disabled={!s.categoriaId}
                  onChange={(e) => atualizar(s.chave, { incluido: e.target.checked })}
                  title={!s.categoriaId ? "Escolha uma categoria pra poder incluir" : undefined}
                  className="mt-2 h-3.5 w-3.5 accent-primary"
                />
                <div className="flex-1 space-y-1.5">
                  <input
                    value={s.descricao}
                    onChange={(e) => atualizar(s.chave, { descricao: e.target.value })}
                    className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      value={s.categoriaId || undefined}
                      onValueChange={(v) => atualizar(s.chave, { categoriaId: v, incluido: true })}
                    >
                      <SelectTrigger className={`h-7 w-[190px] text-xs ${!s.categoriaId ? "border-warning text-warning" : ""}`}>
                        <SelectValue placeholder="Escolher categoria" />
                      </SelectTrigger>
                      <SelectContent>
                        {categorias.map((c) => (
                          <SelectItem key={c.id} value={c.id} className="text-xs">
                            {c.codigo} {c.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      qtd
                      <input
                        type="number"
                        min={1}
                        value={s.quantity}
                        onChange={(e) => atualizar(s.chave, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                        className="h-7 w-14 rounded-md border border-input bg-background px-1.5 text-center text-xs text-foreground"
                      />
                    </label>
                    <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      {porHora(cat) ? "horas" : "diária"}
                      <input
                        type="number"
                        min={0}
                        step={porHora(cat) ? 0.5 : 1}
                        value={s.diaria}
                        onChange={(e) => atualizar(s.chave, { diaria: Math.max(0, Number(e.target.value) || 0) })}
                        className="h-7 w-14 rounded-md border border-input bg-background px-1.5 text-center text-xs text-foreground"
                      />
                    </label>
                    <button
                      onClick={() => remover(s.chave)}
                      className="ml-auto text-muted-foreground hover:text-destructive"
                      title="Remover esta sugestão"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {s.justificativa && (
                    <p className="text-[11px] italic text-muted-foreground">{s.justificativa}</p>
                  )}
                </div>
              </div>
            );
          })}
          <Button
            size="sm"
            onClick={adicionar}
            disabled={adicionando || !selecionadas.length}
            className="w-full bg-primary text-primary-foreground"
          >
            {adicionando ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1.5 h-3.5 w-3.5" />}
            Adicionar {selecionadas.length} ite{selecionadas.length === 1 ? "m" : "ns"} à planilha
          </Button>
        </div>
      )}
    </div>
  );
}
