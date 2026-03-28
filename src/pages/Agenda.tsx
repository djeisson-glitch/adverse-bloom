import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Users, CalendarDays, CalendarRange } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { useJobAllocations, type JobAllocation } from "@/hooks/useJobAllocations";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { AgendaCalendar } from "@/components/agenda/AgendaCalendar";
import { CaptureDaysBalance } from "@/components/agenda/CaptureDaysBalance";
import { AllocationModal } from "@/components/agenda/AllocationModal";
import { TeamMemberModal } from "@/components/agenda/TeamMemberModal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { TeamMember } from "@/hooks/useTeamMembers";

export default function Agenda() {
  const { isAdmin } = usePermissions();
  const [view, setView] = useState<"week" | "month">("week");
  const [allocModalOpen, setAllocModalOpen] = useState(false);
  const [memberModalOpen, setMemberModalOpen] = useState(false);
  const [editAlloc, setEditAlloc] = useState<JobAllocation | null>(null);
  const [editMember, setEditMember] = useState<TeamMember | null>(null);
  const [defaultDate, setDefaultDate] = useState<string>("");

  const { data: allocations = [] } = useJobAllocations();
  const { data: members = [] } = useTeamMembers();

  const handleDayClick = (date: string) => {
    if (!isAdmin) return;
    setDefaultDate(date);
    setEditAlloc(null);
    setAllocModalOpen(true);
  };

  const handleAllocClick = (alloc: JobAllocation) => {
    if (isAdmin) {
      setEditAlloc(alloc);
      setAllocModalOpen(true);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Agenda da Equipe</h1>
          <p className="text-sm text-muted-foreground">Alocações e diárias de captação</p>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={view} onValueChange={(v) => setView(v as any)}>
            <TabsList className="h-8">
              <TabsTrigger value="week" className="text-xs gap-1 h-7">
                <CalendarDays className="h-3.5 w-3.5" /> Semanal
              </TabsTrigger>
              <TabsTrigger value="month" className="text-xs gap-1 h-7">
                <CalendarRange className="h-3.5 w-3.5" /> Mensal
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {isAdmin && (
            <>
              <Button size="sm" variant="outline" onClick={() => { setEditMember(null); setMemberModalOpen(true); }}>
                <Users className="h-3.5 w-3.5 mr-1" /> Equipe
              </Button>
              <Button size="sm" onClick={() => { setEditAlloc(null); setDefaultDate(""); setAllocModalOpen(true); }}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Alocar
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        {/* Sidebar */}
        <div className="lg:col-span-1 space-y-4">
          <CaptureDaysBalance />

          {/* Team members */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center justify-between">
                Equipe
                {isAdmin && (
                  <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => { setEditMember(null); setMemberModalOpen(true); }}>
                    <Plus className="h-3 w-3 mr-1" /> Novo
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {members?.filter((m) => m.is_active).map((m) => (
                <button
                  key={m.id}
                  className="flex items-center gap-2 w-full text-left text-sm hover:bg-accent/30 rounded px-2 py-1 transition-colors min-w-0 overflow-hidden"
                  onClick={() => { if (isAdmin) { setEditMember(m); setMemberModalOpen(true); } }}
                >
                  <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: m.color }} />
                  <span className="truncate min-w-0">{m.name}</span>
                  {m.role_function && (
                    <Badge variant="secondary" className="text-[9px] ml-auto shrink-0">{m.role_function}</Badge>
                  )}
                </button>
              ))}
              {(!members || members.filter((m) => m.is_active).length === 0) && (
                <p className="text-xs text-muted-foreground text-center py-3">Nenhum membro cadastrado</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Calendar */}
        <div className="lg:col-span-3">
          <AgendaCalendar
            allocations={allocations}
            view={view}
            onDayClick={handleDayClick}
            onAllocationClick={handleAllocClick}
          />
        </div>
      </div>

      <AllocationModal
        open={allocModalOpen}
        onOpenChange={setAllocModalOpen}
        allocation={editAlloc}
        defaultDate={defaultDate}
      />
      <TeamMemberModal
        open={memberModalOpen}
        onOpenChange={setMemberModalOpen}
        member={editMember}
      />
    </div>
  );
}
