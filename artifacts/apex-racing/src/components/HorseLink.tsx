import { useState } from "react";
import { useLocation } from "wouter";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { ExternalLink, Film, BookOpen, BarChart2, ChevronRight } from "lucide-react";

interface HorseLinkProps {
  horseName: string;
  racecardId?: number;
  runnerId?: number;
  horseId?: number;
  className?: string;
}

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

interface Action {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
  bgHover: string;
  href: string;
  external: boolean;
}

export function HorseLink({
  horseName,
  racecardId,
  runnerId,
  horseId,
  className = "",
}: HorseLinkProps) {
  const [open, setOpen] = useState(false);
  const [, navigate] = useLocation();

  const slug    = toSlug(horseName);
  const encoded = encodeURIComponent(horseName);

  const actions: Action[] = [
    {
      id:          "atr-form",
      label:       "ATR Form",
      description: "Full form, ratings & race record",
      icon:        ExternalLink,
      color:       "text-amber-400",
      bgHover:     "hover:bg-amber-400/8",
      href:        `https://www.attheraces.com/form/${slug}`,
      external:    true,
    },
    {
      id:          "atr-replays",
      label:       "ATR Replays",
      description: "Watch race replays at ATR",
      icon:        Film,
      color:       "text-cyan-400",
      bgHover:     "hover:bg-cyan-400/8",
      href:        `https://www.attheraces.com/replays?horse=${encoded}`,
      external:    true,
    },
    {
      id:          "apex-notes",
      label:       "APEX Horse Notes",
      description: "Memory, replay & intelligence",
      icon:        BookOpen,
      color:       "text-blue-400",
      bgHover:     "hover:bg-blue-400/8",
      href:        horseId ? `/horses/${horseId}` : `/horses`,
      external:    false,
    },
    ...(racecardId
      ? [{
          id:          "predictor",
          label:       "Predictor Breakdown",
          description: "Full APEX score analysis",
          icon:        BarChart2,
          color:       "text-purple-400",
          bgHover:     "hover:bg-purple-400/8",
          href:        runnerId
            ? `/racecards/${racecardId}/score/${runnerId}`
            : `/racecards/${racecardId}`,
          external:    false,
        }]
      : []),
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={`cursor-pointer leading-tight transition-colors hover:text-amber-300 ${className}`}
          style={{
            textDecoration:      "underline dotted",
            textDecorationColor: "rgba(251,191,36,0.35)",
            textUnderlineOffset: "3px",
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOpen(v => !v);
          }}
        >
          {horseName}
        </button>
      </PopoverTrigger>

      <PopoverContent
        className="w-64 p-0 shadow-2xl border-border/50 bg-card"
        align="start"
        sideOffset={8}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-3 py-2.5 border-b border-border/30 bg-secondary/30">
          <p className="text-xs font-bold text-foreground tracking-wide truncate">{horseName}</p>
          <p className="text-[10px] text-muted-foreground/50 mt-0.5">Quick access</p>
        </div>

        {/* Action list */}
        <div className="py-1">
          {actions.map((action) => {
            const Icon = action.icon;

            const handleClick = (e: React.MouseEvent) => {
              e.stopPropagation();
              setOpen(false);
              if (action.external) {
                window.open(action.href, "_blank", "noopener,noreferrer");
              } else {
                navigate(action.href);
              }
            };

            return (
              <button
                key={action.id}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${action.bgHover}`}
                onClick={handleClick}
              >
                <Icon className={`h-3.5 w-3.5 shrink-0 ${action.color}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground leading-tight">{action.label}</p>
                  <p className="text-[10px] text-muted-foreground/55 leading-tight mt-0.5">{action.description}</p>
                </div>
                {action.external
                  ? <ExternalLink className="h-2.5 w-2.5 text-muted-foreground/25 shrink-0" />
                  : <ChevronRight  className="h-2.5 w-2.5 text-muted-foreground/25 shrink-0" />
                }
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
