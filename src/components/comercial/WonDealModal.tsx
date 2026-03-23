import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  dealTitle: string;
  onConfirm: (createBudget: boolean) => void;
  onCancel: () => void;
}

export function WonDealModal({ open, dealTitle, onConfirm, onCancel }: Props) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Deal ganho! 🎉</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          O deal <span className="font-medium text-foreground">"{dealTitle}"</span> foi marcado como ganho. Deseja criar um orçamento vinculado?
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onConfirm(false)}>Não, apenas mover</Button>
          <Button onClick={() => onConfirm(true)}>Criar Orçamento</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
