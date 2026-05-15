import React from 'react';
import { Badge } from "@/components/ui/badge";

export type ConfidenceClass = 
  | "best_of_day" 
  | "top_rated_high_variance" 
  | "hidden_value" 
  | "replay_upgrade" 
  | "no_bet";

interface ConfidenceBadgeProps {
  confidenceClass: string;
}

export function ConfidenceBadge({ confidenceClass }: ConfidenceBadgeProps) {
  const getBadgeVariant = (cc: string) => {
    switch (cc) {
      case "best_of_day": return "bg-amber-500 hover:bg-amber-600 text-black";
      case "top_rated_high_variance": return "bg-blue-500 hover:bg-blue-600 text-white";
      case "hidden_value": return "bg-emerald-500 hover:bg-emerald-600 text-white";
      case "replay_upgrade": return "bg-purple-500 hover:bg-purple-600 text-white";
      case "no_bet": return "bg-gray-500 hover:bg-gray-600 text-white";
      default: return "bg-gray-700 hover:bg-gray-800 text-white";
    }
  };

  const getLabel = (cc: string) => {
    return cc.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  };

  return (
    <Badge className={`${getBadgeVariant(confidenceClass)} border-none shadow-none font-medium tracking-tight rounded-sm px-2 py-0.5`} data-testid={`confidence-badge-${confidenceClass}`}>
      {getLabel(confidenceClass)}
    </Badge>
  );
}
