import { useMemo } from "react";
import {
  useGetRacecardAnalysis,
  getGetRacecardAnalysisQueryKey,
} from "@workspace/api-client-react";
import { runApexEngineForField, computeRaceVolatility, type VolatilityTier } from "@/lib/apexEngine";
import { Trophy, Ban, ShieldAlert, Loader2 } from "lucide-react";

interface Props {
  racecardId: number;
  raceName: string;
  distance?: string | null;
  going?: string | null;
  raceClass?: string | null;
  prize?: string | null;
  trackProfile?: string | null;
  marketContext?: string | null;
  trainerComments?: string | null;
  nonRunners?: string | null;
}

const TIER_CHIP: Record<VolatilityTier, string> = {
  low:     "text-green-400 bg-green-500/10 border-green-500/30",
  medium:  "text-amber-400 bg-amber-500/10 border-amber-500/30",
  high:    "text-orange-400 bg-orange-500/10 border-orange-500/30",
  extreme: "text-red-400   bg-red-500/10   border-red-500/30",
};

const CONF_CHIP: Record<string, string> = {
  best_of_day:             "text-amber-300 bg-amber-400/10 border-amber-400/25",
  top_rated_high_variance: "text-blue-300  bg-blue-400/10  border-blue-400/25",
  each_way_value:          "text-teal-300  bg-teal-400/10  border-teal-400/25",
  no_bet:                  "text-muted-foreground bg-muted/20 border-border/30",
};

const CONF_LABEL: Record<string, string> = {
  best_of_day:             "Best Of Day",
  top_rated_high_variance: "Top Rated",
  each_way_value:          "EW Value",
  no_bet:                  "No Bet",
};

export function RaceApexQuickPick({
  racecardId,
  raceName,
  distance,
  going,
  raceClass,
  prize,
  trackProfile,
  marketContext,
  trainerComments,
  nonRunners,
}: Props) {
  const { data: analysis, isLoading } = useGetRacecardAnalysis(racecardId, {
    query: {
      queryKey: getGetRacecardAnalysisQueryKey(racecardId),
      staleTime: 60_000,
    },
  });

  const picks = useMemo(() => {
    if (!analysis) return null;
    const active = analysis.runners.filter(r => !r.isNonRunner && !r.scratched);
    if (active.length === 0) return null;

    const racecardInput = {
      raceName,
      distance:        distance        ?? null,
      going:           going           ?? null,
      raceClass:       raceClass       ?? null,
      prize:           prize           ?? null,
      trackProfile:    trackProfile    ?? null,
      marketContext:   marketContext   ?? null,
      trainerComments: trainerComments ?? null,
      nonRunners:      nonRunners      ?? null,
      fieldSize:       active.length,
    };

    const volatility = computeRaceVolatility(racecardInput);
    const isNoBetRace = volatility.tier === "extreme";

    if (isNoBetRace) {
      return { leader: null, volatility, isNoBetRace: true, count: active.length };
    }

    const runnerInputs = active.map(r => ({
      horseName: r.horseName, draw: r.draw, age: r.age, form: r.form,
      odds: r.odds, jockey: r.jockey, trainer: r.trainer, weight: r.weight,
    }));

    const fieldResults = runApexEngineForField(runnerInputs, racecardInput);
    const leader = fieldResults[0]; // rank-1 by relative score

    return { leader, volatility, isNoBetRace: false, count: active.length };
  }, [analysis, raceName, distance, going, raceClass, prize, trackProfile, marketContext, trainerComments, nonRunners]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-1.5 mt-1.5">
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground/40" />
        <span className="text-[10px] text-muted-foreground/40">Analysing…</span>
      </div>
    );
  }

  if (!picks) {
    return (
      <div className="mt-1.5">
        <span className="text-[10px] text-muted-foreground/40">No runners — upload runners to generate picks</span>
      </div>
    );
  }

  const { leader, volatility, isNoBetRace, count } = picks;

  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
      {/* Volatility badge */}
      <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${TIER_CHIP[volatility.tier]}`}>
        <ShieldAlert className="h-2.5 w-2.5 shrink-0" />
        {volatility.label}
      </span>

      {isNoBetRace || !leader ? (
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border text-red-400 bg-red-500/10 border-red-500/30">
          <Ban className="h-2.5 w-2.5 shrink-0" />
          No Bet Race
        </span>
      ) : (
        <>
          {/* Top horse in field */}
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border text-amber-400 bg-amber-400/10 border-amber-400/30">
            <Trophy className="h-2.5 w-2.5 shrink-0" />
            {leader.runner.horseName}
            <span className="font-mono opacity-70">{Math.round(leader.relativeScore)}</span>
            {leader.fieldEdge > 0 && (
              <span className="text-green-400/70 font-mono">+{leader.fieldEdge.toFixed(1)}</span>
            )}
          </span>

          {/* Classification chip */}
          <span className={`inline-flex text-[10px] font-semibold px-1.5 py-0.5 rounded border ${CONF_CHIP[leader.result.confidenceClass] ?? CONF_CHIP.no_bet}`}>
            {CONF_LABEL[leader.result.confidenceClass] ?? leader.result.confidenceClass}
          </span>
        </>
      )}

      <span className="text-[10px] text-muted-foreground/40 font-mono">{count} runners</span>
    </div>
  );
}
