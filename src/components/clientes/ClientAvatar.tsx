import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

const COLORS = [
  "bg-red-600", "bg-blue-600", "bg-green-600", "bg-purple-600",
  "bg-amber-600", "bg-teal-600", "bg-pink-600", "bg-indigo-600",
];

function hashName(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return Math.abs(hash);
}

interface Props {
  name: string;
  className?: string;
}

export function ClientAvatar({ name, className }: Props) {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const color = COLORS[hashName(name) % COLORS.length];

  return (
    <Avatar className={cn("h-9 w-9", className)}>
      <AvatarFallback className={cn(color, "text-white font-medium text-xs")}>{initials}</AvatarFallback>
    </Avatar>
  );
}
