import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Copy } from "lucide-react";

interface Props {
  open: boolean;
  onConfirm: (notes: string) => void;
  onCancel: () => void;
}

export function NewVersionModal({ open, onConfirm, onCancel }: Props) {
  const [notes, setNotes] = useState("");

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5 text-primary" />
            Nova Versão
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">O que mudou nessa versão?</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Ajuste no valor da produção..."
              className="text-sm resize-none"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
          <Button onClick={() => onConfirm(notes)} disabled={!notes.trim()}>
            <Copy className="mr-2 h-4 w-4" /> Criar Versão
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
