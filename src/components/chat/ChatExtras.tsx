import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Smile, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// Emojis mais usados, por fila temática — picker leve, sem lib nem API. Quem
// quiser um emoji fora daqui usa o teclado de emoji do sistema (funciona igual).
const EMOJIS = [
  "😀","😂","🤣","😅","😊","😍","😘","😎","🤩","🥳",
  "🤔","😴","😭","😢","😤","😡","🤯","😱","🙄","😬",
  "👍","👎","👏","🙌","🙏","💪","🤝","👊","✌️","🤙",
  "❤️","🔥","✨","🎉","🚀","💯","⚡","💡","✅","❌",
  "🎬","🎥","🎞️","📸","🎧","🎨","✂️","🖥️","⏰","📌",
];

/** Botão 😊 que abre um grid de emojis. onPick recebe o emoji escolhido. */
export function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Emoji"
          className="flex h-8 w-8 items-center justify-center rounded-md border border-border/60 text-muted-foreground hover:text-primary hover:bg-primary/10"
        >
          <Smile className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <div className="grid grid-cols-8 gap-0.5">
          {EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => { onPick(e); setOpen(false); }}
              className="flex h-7 w-7 items-center justify-center rounded text-lg hover:bg-muted"
            >
              {e}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

type Gif = { id: string; preview: string; url: string; w: number; h: number };

/** Botão GIF que abre a busca (Giphy via edge function). onPick recebe a URL
 *  do GIF escolhido. Sem termo, mostra os em alta. */
export function GifPicker({ onPick }: { onPick: (url: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [gifs, setGifs] = useState<Gif[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const buscar = async (termo: string) => {
    setCarregando(true);
    setErro(null);
    try {
      const { data, error } = await supabase.functions.invoke("giphy-search", { body: { q: termo } });
      if (error) throw error;
      if ((data as any)?.error) { setErro((data as any).error); setGifs([]); return; }
      setGifs(((data as any)?.gifs || []) as Gif[]);
    } catch {
      setErro("Não deu pra buscar GIFs agora.");
      setGifs([]);
    } finally {
      setCarregando(false);
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(v) => { setOpen(v); if (v && gifs.length === 0) buscar(""); }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          title="GIF"
          className="flex h-8 items-center justify-center rounded-md border border-border/60 px-1.5 text-[11px] font-bold text-muted-foreground hover:text-primary hover:bg-primary/10"
        >
          GIF
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-2">
        <Input
          autoFocus
          value={q}
          onChange={(e) => { setQ(e.target.value); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); buscar(q); } }}
          placeholder="Buscar GIF… (Enter)"
          className="h-8"
        />
        <div className="mt-2 h-64 overflow-y-auto">
          {carregando ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : erro ? (
            <p className="px-1 py-6 text-center text-xs text-muted-foreground">{erro}</p>
          ) : gifs.length === 0 ? (
            <p className="px-1 py-6 text-center text-xs text-muted-foreground">Nada encontrado.</p>
          ) : (
            <div className="columns-2 gap-1.5">
              {gifs.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => { onPick(g.url); setOpen(false); }}
                  className="mb-1.5 block w-full overflow-hidden rounded hover:ring-2 hover:ring-primary"
                >
                  <img src={g.preview} alt="" loading="lazy" className="w-full" />
                </button>
              ))}
            </div>
          )}
        </div>
        <p className="pt-1 text-center text-[10px] text-muted-foreground/60">via GIPHY</p>
      </PopoverContent>
    </Popover>
  );
}
