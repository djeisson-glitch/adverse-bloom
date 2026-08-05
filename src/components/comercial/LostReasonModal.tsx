import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, XCircle, Paperclip, Loader2, Trash2, FileText } from "lucide-react";
import { format, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { Tables } from "@/integrations/supabase/types";

interface Props {
  open: boolean;
  clientName?: string;
  profiles: Tables<"profiles">[];
  lossReasons: string[];
  followupDays?: number;
  onConfirm: (data: {
    reason: string; otherReason?: string;
    /** O que o cliente respondeu, com as palavras dele. */
    obs?: string;
    /** Prints/arquivos da recusa — a prova que o follow-up de 60 dias vai querer. */
    anexos?: Anexo[];
    followup?: { title: string; dueDate: string; responsibleId: string };
  }) => void;
  onCancel: () => void;
}

type Anexo = { nome: string; url: string; storage_path: string; mime?: string | null; tamanho?: number | null };

export function LostReasonModal({ open, clientName, profiles, lossReasons, followupDays = 60, onConfirm, onCancel }: Props) {
  const [reason, setReason] = useState("");
  const [otherReason, setOtherReason] = useState("");
  const [enableFollowup, setEnableFollowup] = useState(true);
  const [followupTitle, setFollowupTitle] = useState("");
  const [followupDate, setFollowupDate] = useState<Date>();
  const [followupResponsible, setFollowupResponsible] = useState("");
  const [obs, setObs] = useState("");
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [enviando, setEnviando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setReason("");
      setOtherReason("");
      setEnableFollowup(true);
      setFollowupTitle(`Recontato — ${clientName || "cliente"}`);
      setFollowupDate(addDays(new Date(), followupDays));
      setFollowupResponsible(profiles[0]?.id || "");
      setObs("");
      setAnexos([]);
    }
  }, [open, clientName, followupDays, profiles]);

  /**
   * Sobe o print pro mesmo bucket dos anexos de demanda — bucket novo é RLS
   * nova pra manter, e este já aceita o que a equipe manda.
   */
  const enviarArquivos = async (files: FileList | null) => {
    const lista = files ? Array.from(files) : [];
    if (!lista.length) return;
    setEnviando(true);
    try {
      const novos: Anexo[] = [];
      for (const file of lista) {
        const safe = file.name.replace(/[^\w.\-]+/g, "_");
        const path = `perdidos/${crypto.randomUUID()}-${safe}`;
        const { error } = await supabase.storage.from("demandas")
          .upload(path, file, { cacheControl: "3600", contentType: file.type || undefined });
        if (error) throw new Error(`Falha ao subir "${file.name}": ${error.message}`);
        const { data: pub } = supabase.storage.from("demandas").getPublicUrl(path);
        novos.push({ nome: file.name, url: pub.publicUrl, storage_path: path,
                     mime: file.type || null, tamanho: file.size });
      }
      setAnexos((a) => [...a, ...novos]);
    } catch (e: any) {
      toast.error("Não anexou", { description: e.message });
    } finally {
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const canSubmit = reason && (reason !== "Outro" || otherReason.trim());

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-destructive" />
            Mover para Perdido
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Motivo da perda <span className="text-destructive">*</span></Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue placeholder="Selecionar motivo" /></SelectTrigger>
              <SelectContent>
                {lossReasons.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {reason === "Outro" && (
            <div>
              <Label>Especificar motivo</Label>
              <Input value={otherReason} onChange={(e) => setOtherReason(e.target.value)} placeholder="Descreva o motivo..." />
            </div>
          )}

          {/* A resposta do cliente, com as palavras dele. Em 60 dias, quando o
              follow-up de reaquecimento dispara, "Escolheu concorrente" não
              diz o que reabre a conversa — isto diz. */}
          <div className="border-t border-border pt-4 space-y-2">
            <Label className="text-sm">O que o cliente respondeu <span className="font-normal text-muted-foreground">(opcional)</span></Label>
            <Textarea
              rows={2}
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              placeholder="Cole o que ele disse, ou anote o contexto — orçamento apertado, adiou pro ano que vem, fechou com fulano…"
              className="text-sm"
            />

            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={enviando}>
                {enviando ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Paperclip className="mr-1 h-3.5 w-3.5" />}
                {enviando ? "Enviando…" : "Anexar print / arquivo"}
              </Button>
              <span className="text-[11px] text-muted-foreground">print do WhatsApp, e-mail, PDF…</span>
              <input
                ref={inputRef} type="file" multiple className="hidden"
                accept="image/*,application/pdf,.doc,.docx,.eml,.msg"
                onChange={(e) => enviarArquivos(e.target.files)}
              />
            </div>

            {anexos.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {anexos.map((a) => (
                  <div key={a.storage_path} className="group relative overflow-hidden rounded-md border border-border/50 bg-muted/20">
                    {a.mime?.startsWith("image/") ? (
                      <img src={a.url} alt={a.nome} className="h-20 w-full object-cover" />
                    ) : (
                      <div className="flex h-20 w-full flex-col items-center justify-center gap-1 text-muted-foreground">
                        <FileText className="h-6 w-6" />
                        <span className="max-w-full truncate px-1 text-[9px]">{a.nome}</span>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setAnexos((l) => l.filter((x) => x.storage_path !== a.storage_path))}
                      className="absolute right-1 top-1 rounded bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                      title="Remover"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-border pt-4 space-y-3">
            <div className="flex items-center gap-2">
              <Checkbox id="lost-followup" checked={enableFollowup} onCheckedChange={(v) => setEnableFollowup(!!v)} />
              <Label htmlFor="lost-followup" className="text-sm font-medium cursor-pointer">Agendar follow-up de reaquecimento</Label>
            </div>

            {enableFollowup && (
              <div className="space-y-3 pl-6">
                <div>
                  <Label className="text-xs">Título</Label>
                  <Input value={followupTitle} onChange={(e) => setFollowupTitle(e.target.value)} className="h-8 text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Data</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className={cn("w-full justify-start text-left font-normal", !followupDate && "text-muted-foreground")}>
                          <CalendarIcon className="mr-1 h-3 w-3" />
                          {followupDate ? format(followupDate, "dd/MM/yyyy") : "Data"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={followupDate} onSelect={setFollowupDate} locale={ptBR} className="p-3 pointer-events-auto" />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div>
                    <Label className="text-xs">Responsável</Label>
                    <Select value={followupResponsible} onValueChange={setFollowupResponsible}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                      <SelectContent>
                        {profiles.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
          <Button variant="destructive" disabled={!canSubmit || enviando} onClick={() => {
            onConfirm({
              reason: reason === "Outro" ? otherReason : reason,
              otherReason: reason === "Outro" ? otherReason : undefined,
              obs: obs.trim() || undefined,
              anexos: anexos.length ? anexos : undefined,
              followup: enableFollowup && followupTitle ? {
                title: followupTitle,
                dueDate: followupDate ? format(followupDate, "yyyy-MM-dd") : "",
                responsibleId: followupResponsible,
              } : undefined,
            });
          }}>Confirmar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
