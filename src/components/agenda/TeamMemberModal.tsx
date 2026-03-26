import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useSaveTeamMember, type TeamMember } from "@/hooks/useTeamMembers";
import { useToast } from "@/hooks/use-toast";

const COLORS = ["#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  member?: TeamMember | null;
}

export function TeamMemberModal({ open, onOpenChange, member }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [roleFunction, setRoleFunction] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [isActive, setIsActive] = useState(true);
  const save = useSaveTeamMember();
  const { toast } = useToast();

  useEffect(() => {
    if (member) {
      setName(member.name);
      setEmail(member.email || "");
      setPhone(member.phone || "");
      setRoleFunction(member.role_function || "");
      setColor(member.color);
      setIsActive(member.is_active);
    } else {
      setName("");
      setEmail("");
      setPhone("");
      setRoleFunction("");
      setColor(COLORS[Math.floor(Math.random() * COLORS.length)]);
      setIsActive(true);
    }
  }, [member, open]);

  const handleSave = () => {
    if (!name.trim()) return;
    save.mutate(
      {
        ...(member ? { id: member.id } : {}),
        name: name.trim(),
        email: email || null,
        phone: phone || null,
        role_function: roleFunction || null,
        color,
        is_active: isActive,
      },
      {
        onSuccess: () => {
          toast({ title: "Membro salvo!" });
          onOpenChange(false);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{member ? "Editar Membro" : "Novo Membro da Equipe"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Nome *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome completo" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">E-mail</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Telefone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Função principal</Label>
            <Input value={roleFunction} onChange={(e) => setRoleFunction(e.target.value)} placeholder="Ex: Operador de câmera" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Cor no calendário</Label>
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`h-7 w-7 rounded-full border-2 transition-all ${color === c ? "border-foreground scale-110" : "border-transparent"}`}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={isActive} onCheckedChange={setIsActive} />
            <Label className="text-xs">Ativo</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!name.trim() || save.isPending}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
