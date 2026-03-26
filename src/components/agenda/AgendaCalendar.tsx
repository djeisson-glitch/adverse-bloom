import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval, addWeeks, addMonths, isSameDay, isSameMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { JobAllocation } from "@/hooks/useJobAllocations";

interface Props {
  allocations: JobAllocation[];
  view: "week" | "month";
  onDayClick?: (date: string) => void;
  onAllocationClick?: (alloc: JobAllocation) => void;
}

export function AgendaCalendar({ allocations, view, onDayClick, onAllocationClick }: Props) {
  const [currentDate, setCurrentDate] = useState(new Date());

  const days = useMemo(() => {
    if (view === "week") {
      const start = startOfWeek(currentDate, { locale: ptBR });
      const end = endOfWeek(currentDate, { locale: ptBR });
      return eachDayOfInterval({ start, end });
    }
    const start = startOfMonth(currentDate);
    const end = endOfMonth(currentDate);
    const monthStart = startOfWeek(start, { locale: ptBR });
    const monthEnd = endOfWeek(end, { locale: ptBR });
    return eachDayOfInterval({ start: monthStart, end: monthEnd });
  }, [currentDate, view]);

  const navigate = (dir: number) => {
    setCurrentDate((d) => view === "week" ? addWeeks(d, dir) : addMonths(d, dir));
  };

  const getAllocsForDay = (day: Date) =>
    allocations.filter((a) => isSameDay(new Date(a.allocation_date + "T12:00:00"), day));

  const isToday = (day: Date) => isSameDay(day, new Date());

  return (
    <div className="space-y-3">
      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button variant="outline" size="icon" onClick={() => navigate(-1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h3 className="text-sm font-semibold capitalize">
          {view === "week"
            ? `${format(days[0], "dd MMM", { locale: ptBR })} — ${format(days[days.length - 1], "dd MMM yyyy", { locale: ptBR })}`
            : format(currentDate, "MMMM yyyy", { locale: ptBR })}
        </h3>
        <Button variant="outline" size="icon" onClick={() => navigate(1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Days header */}
      <div className={`grid ${view === "week" ? "grid-cols-7" : "grid-cols-7"} gap-1`}>
        {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
          <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">{d}</div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const dayAllocs = getAllocsForDay(day);
          const inMonth = isSameMonth(day, currentDate);
          return (
            <Card
              key={day.toISOString()}
              className={`cursor-pointer transition-colors hover:bg-accent/30 ${
                !inMonth && view === "month" ? "opacity-40" : ""
              } ${isToday(day) ? "ring-1 ring-primary" : ""}`}
              onClick={() => onDayClick?.(format(day, "yyyy-MM-dd"))}
            >
              <CardContent className={`p-1.5 ${view === "week" ? "min-h-[120px]" : "min-h-[80px]"}`}>
                <p className={`text-xs font-medium mb-1 ${isToday(day) ? "text-primary" : "text-foreground"}`}>
                  {format(day, "d")}
                </p>
                <div className="space-y-0.5">
                  {dayAllocs.slice(0, view === "week" ? 5 : 3).map((a) => (
                    <button
                      key={a.id}
                      className="w-full text-left rounded px-1 py-0.5 text-[10px] truncate leading-tight"
                      style={{
                        backgroundColor: `${a.team_member?.color || "#3b82f6"}20`,
                        borderLeft: `2px solid ${a.team_member?.color || "#3b82f6"}`,
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onAllocationClick?.(a);
                      }}
                    >
                      <span className="font-medium">{a.team_member?.name?.split(" ")[0]}</span>
                      {" — "}
                      {a.budget?.project_name || "Job"}
                    </button>
                  ))}
                  {dayAllocs.length > (view === "week" ? 5 : 3) && (
                    <Badge variant="secondary" className="text-[9px] h-4">
                      +{dayAllocs.length - (view === "week" ? 5 : 3)}
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
