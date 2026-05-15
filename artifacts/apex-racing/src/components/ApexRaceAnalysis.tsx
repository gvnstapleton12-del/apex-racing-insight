import React, { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { HorseLink } from "@/components/HorseLink";
import {
  Star, Eye, AlertTriangle, Film, TrendingUp, ChevronDown, ChevronUp,
  Zap, ShieldAlert, Trophy, Ban,
} from "lucide-react";
import {
  runApexEngine,
  type ApexEngineResult,
  type RacecardInput,
  type RaceVolatilityResult,
  type ScoreBreakdown,
  type VolatilityTier,
} from "@/lib/apexEngine";
import { detectReplayTriggers, type DetectedTrigger } from "@/lib/replayTriggers";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Runner {
  id: number;
  horseName: string;
  draw?: number | null;
  age?: string | null;
  form?: string | null;
  odds?: string | null;
  jockey?: string | null;
  trainer?: string | null;
  weight?: string | null;
  isNonRunner?: boolean;
  scratched?: boolean;
}

type Highlight = "top_rated" | "hidden_value_pick" | "dangerous_favourite" | "replay_trigger";

interface CategoryRanks {
  ability: number;
  paceFit: number;
  tacticalResilience: number;
  groundTrip: number;
  replayIntelligence: number;
  hiddenValue: number;
  volatilityRisk: number;
}

interface RankedEntry {
  runner: Runner;
  result: ApexEngineResult;
  rank: number;
  highlights: Highlight[];
  triggers: DetectedTrigger[];
  fieldEdge: number;
  fieldN: number;
  categoryRanks: CategoryRanks;
}

interface Props {
  racecardInput: RacecardInput;
  runners: Runner[];
  raceVolatility: RaceVolatilityResult;
  racecardId?: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseOddsDecimal(odds: string | null | undefined): number | null {
  if (!odds) return null;
  const s = odds.trim().toLowerCase();
  if (s === "evs" || s === "evens") return 2.0;
  const slash = s.indexOf("/");
  if (slash !== -1) {
    const num = parseFloat(s.slice(0, slash));
    const den = parseFloat(s.slice(slash + 1));
    if (!isNaN(num) && !isNaN(den) && den > 0) return num / den + 1;
  }
  const dec = parseFloat(s);
  if (!isNaN(dec)) return dec;
  return null;
}

const CAT_KEYS = ["ability", "paceFit", "tacticalResilience", "groundTrip", "replayIntelligence", "hiddenValue"] as const;
type CatKey = typeof CAT_KEYS[number];

// ── Visual constants ──────────────────────────────────────────────────────────

const SCORE_COLOR = (s: number) =>
  s >= 72 ? "text-amber-400" : s >= 65 ? "text-blue-400" : s >= 55 ? "text-green-400" : s >= 45 ? "text-yellow-400" : "text-muted-foreground";

const SCORE_RING_STROKE = (s: number) =>
  s >= 72 ? "#f59e0b" : s >= 65 ? "#3b82f6" : s >= 55 ? "#22c55e" : s >= 45 ? "#eab308" : "#6b7280";

const TIER_ACCENT: Record<VolatilityTier, string> = {
  low: "text-green-400", medium: "text-amber-400", high: "text-orange-400", extreme: "text-red-400",
};

const TIER_BORDER: Record<VolatilityTier, string> = {
  low: "border-green-500/30 bg-green-500/5",
  medium: "border-amber-500/30 bg-amber-500/5",
  high: "border-orange-500/30 bg-orange-500/5",
  extreme: "border-red-500/30 bg-red-500/5",
};

const CATS = [
  { key: "ability",            label: "Ability",             bar: "bg-amber-500" },
  { key: "paceFit",            label: "Pace Fit",            bar: "bg-blue-500" },
  { key: "tacticalResilience", label: "Tactical Resilience", bar: "bg-purple-500" },
  { key: "groundTrip",         label: "Ground / Trip",       bar: "bg-green-500" },
  { key: "replayIntelligence", label: "Replay Intelligence", bar: "bg-fuchsia-500" },
  { key: "hiddenValue",        label: "Hidden Value",        bar: "bg-emerald-500" },
  { key: "volatilityRisk",     label: "Volatility Risk",     bar: "bg-red-500", inverted: true },
] as const;

const RANK_STYLE: Record<number, { outer: string; text: string }> = {
  1: { outer: "bg-amber-500/20 border-amber-500/50",   text: "text-amber-400" },
  2: { outer: "bg-slate-500/15 border-slate-400/30",   text: "text-slate-300" },
  3: { outer: "bg-orange-700/15 border-orange-600/30", text: "text-orange-400" },
};

// ── Sub-components ────────────────────────────────────────────────────────────

function ScoreRing({ score, size = 50 }: { score: number; size?: number }) {
  const r = size * 0.37;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const stroke = SCORE_RING_STROKE(score);
  return (
    <div className="relative flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg className="absolute inset-0 -rotate-90" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(220 25% 18%)" strokeWidth="5" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={stroke} strokeWidth="5"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" className="transition-all duration-700" />
      </svg>
      <span className={`font-mono font-bold text-sm leading-none ${SCORE_COLOR(score)}`}>{score}</span>
    </div>
  );
}

function CatBar({ label, score, note, bar, fieldRank, fieldN, inverted }:
  { label: string; score: number; note: string; bar: string; fieldRank: number; fieldN: number; inverted?: boolean }) {
  const display = inverted ? 100 - score : score;
  const isFieldBest = fieldRank === 1;
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground/80 w-36 shrink-0">{label}</span>
        <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${bar} transition-all duration-700`} style={{ width: `${display}%` }} />
        </div>
        <span className="font-mono w-6 text-right text-muted-foreground shrink-0">{score}</span>
        <span className={`text-[10px] w-16 text-right shrink-0 ${isFieldBest ? "text-amber-400 font-semibold" : "text-muted-foreground/40"}`}>
          #{fieldRank}/{fieldN}
        </span>
      </div>
      {note && <p className="text-[10px] text-muted-foreground/60 leading-snug pl-36">{note}</p>}
    </div>
  );
}

// ── Pick Card ─────────────────────────────────────────────────────────────────

interface PickCardProps {
  type: "top_rated" | "best_of_day" | "hidden_value" | "replay_upgrade" | "dangerous_fav";
  entry?: RankedEntry;
  reason?: string;
  governanceNote?: string;
  racecardId?: number;
}

const PICK_CONFIG = {
  top_rated:      { label: "TOP RATED",       icon: <Trophy className="h-3.5 w-3.5" />,       border: "border-amber-500/40",   bg: "bg-amber-500/8",   accent: "text-amber-400",   dot: "bg-amber-400"   },
  best_of_day:    { label: "BEST OF DAY",     icon: <Star className="h-3.5 w-3.5" />,          border: "border-amber-400/30",   bg: "bg-amber-400/5",   accent: "text-amber-300",   dot: "bg-amber-300"   },
  hidden_value:   { label: "HIDDEN VALUE",    icon: <Eye className="h-3.5 w-3.5" />,           border: "border-emerald-500/40", bg: "bg-emerald-500/8", accent: "text-emerald-400", dot: "bg-emerald-400" },
  replay_upgrade: { label: "REPLAY UPGRADE",  icon: <Film className="h-3.5 w-3.5" />,          border: "border-purple-500/40",  bg: "bg-purple-500/8",  accent: "text-purple-400",  dot: "bg-purple-400"  },
  dangerous_fav:  { label: "DANGER FAVOURITE", icon: <AlertTriangle className="h-3.5 w-3.5" />, border: "border-red-500/40",     bg: "bg-red-500/8",     accent: "text-red-400",     dot: "bg-red-400"     },
};

function PickCard({ type, entry, reason, governanceNote, racecardId }: PickCardProps) {
  const cfg = PICK_CONFIG[type];
  const isEmpty = !entry;

  return (
    <div className={`rounded-lg border p-3 flex flex-col gap-1.5 ${cfg.border} ${cfg.bg}`}>
      <div className={`flex items-center gap-1.5 ${cfg.accent}`}>
        {cfg.icon}
        <span className="text-[10px] font-bold uppercase tracking-widest">{cfg.label}</span>
      </div>

      {isEmpty ? (
        <div className="flex flex-col gap-0.5">
          <span className="text-sm text-muted-foreground/50 font-medium">None</span>
          {governanceNote && (
            <span className="text-[10px] text-muted-foreground/40 leading-snug">{governanceNote}</span>
          )}
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <HorseLink horseName={entry.runner.horseName} racecardId={racecardId} runnerId={entry.runner.id} className="font-bold text-base leading-tight" />
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {entry.runner.odds && (
                  <span className="text-xs font-mono font-semibold text-primary">{entry.runner.odds}</span>
                )}
                <span className={`text-[10px] font-mono ${entry.fieldEdge >= 0 ? "text-green-400/70" : "text-muted-foreground/40"}`}>
                  {entry.fieldEdge >= 0 ? "+" : ""}{entry.fieldEdge} vs field
                </span>
              </div>
            </div>
            <ScoreRing score={entry.result.totalScore} size={40} />
          </div>
          {reason && (
            <p className="text-[10px] text-muted-foreground/60 leading-snug border-t border-border/20 pt-1.5">
              {reason}
            </p>
          )}
        </>
      )}
    </div>
  );
}

// ── No Bet Banner ─────────────────────────────────────────────────────────────

function NoBetBanner({ raceVolatility }: { raceVolatility: RaceVolatilityResult }) {
  return (
    <div className="mx-4 my-3 rounded-lg border border-red-500/40 bg-red-500/8 px-4 py-3 flex items-start gap-3">
      <Ban className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
      <div>
        <div className="text-sm font-bold text-red-400 uppercase tracking-wide">NO BET — Race Volatility Too High</div>
        <p className="text-[11px] text-muted-foreground/60 mt-0.5 leading-snug">
          {raceVolatility.label} · {raceVolatility.score}/100 — {raceVolatility.governanceNote}
        </p>
        {raceVolatility.factors.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {raceVolatility.factors.map((f, i) => (
              <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400/70 border border-red-500/20">{f}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ApexRaceAnalysis({ racecardInput, runners, raceVolatility, racecardId }: Props) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const ranked: RankedEntry[] = useMemo(() => {
    const active = runners.filter(r => !r.isNonRunner && !r.scratched);
    if (active.length === 0) return [];

    // Score every runner
    const scored = active.map(runner => ({
      runner,
      result: runApexEngine(
        { horseName: runner.horseName, draw: runner.draw, age: runner.age,
          form: runner.form, odds: runner.odds, jockey: runner.jockey,
          trainer: runner.trainer, weight: runner.weight },
        racecardInput,
      ),
      triggers: detectReplayTriggers({ form: runner.form, odds: runner.odds, age: runner.age }),
    }));

    // Sort by total score descending
    scored.sort((a, b) => b.result.totalScore - a.result.totalScore);
    const n = scored.length;
    const fieldAvg = scored.reduce((sum, e) => sum + e.result.totalScore, 0) / n;

    // Per-category rank maps (1 = best)
    type SE = typeof scored[0];
    const catRankById = (sortFn: (a: SE, b: SE) => number) => {
      const order = [...scored].sort(sortFn);
      return new Map(order.map((e, i) => [e.runner.id, i + 1]));
    };
    const rankMaps: Record<string, Map<number, number>> = {
      ability:            catRankById((a, b) => b.result.ability.score - a.result.ability.score),
      paceFit:            catRankById((a, b) => b.result.paceFit.score - a.result.paceFit.score),
      tacticalResilience: catRankById((a, b) => b.result.tacticalResilience.score - a.result.tacticalResilience.score),
      groundTrip:         catRankById((a, b) => b.result.groundTrip.score - a.result.groundTrip.score),
      replayIntelligence: catRankById((a, b) => b.result.replayIntelligence.score - a.result.replayIntelligence.score),
      hiddenValue:        catRankById((a, b) => b.result.hiddenValue.score - a.result.hiddenValue.score),
      volatilityRisk:     catRankById((a, b) => a.result.volatilityRisk.score - b.result.volatilityRisk.score),
    };
    const catRank = (id: number, key: string) => rankMaps[key]?.get(id) ?? n;

    // Highlight candidates
    const bestHV = scored.reduce<typeof scored[0] | null>((best, cur) =>
      cur.result.hiddenValue.score > (best?.result.hiddenValue.score ?? -1) ? cur : best, null);

    const byOdds = scored
      .map(e => ({ e, dec: parseOddsDecimal(e.runner.odds) }))
      .filter(x => x.dec !== null)
      .sort((a, b) => a.dec! - b.dec!);
    const shortFav = byOdds[0]?.e;
    const favIsDangerous = shortFav &&
      (shortFav.result.volatilityRisk.score >= 50 || raceVolatility.tier === "high" || raceVolatility.tier === "extreme");

    return scored.map((entry, i) => {
      const rid = entry.runner.id;
      const highlights: Highlight[] = [];
      if (i === 0) highlights.push("top_rated");
      if (bestHV && rid === bestHV.runner.id && entry.result.hiddenValue.score >= 58) highlights.push("hidden_value_pick");
      if (favIsDangerous && rid === shortFav.runner.id) highlights.push("dangerous_favourite");
      if (entry.triggers.length > 0) highlights.push("replay_trigger");

      return {
        ...entry,
        rank: i + 1,
        highlights,
        fieldEdge: Math.round(entry.result.totalScore - fieldAvg),
        fieldN: n,
        categoryRanks: {
          ability:            catRank(rid, "ability"),
          paceFit:            catRank(rid, "paceFit"),
          tacticalResilience: catRank(rid, "tacticalResilience"),
          groundTrip:         catRank(rid, "groundTrip"),
          replayIntelligence: catRank(rid, "replayIntelligence"),
          hiddenValue:        catRank(rid, "hiddenValue"),
          volatilityRisk:     catRank(rid, "volatilityRisk"),
        },
      };
    });
  }, [runners, racecardInput, raceVolatility.tier]);

  // Empty state
  if (ranked.length === 0) {
    const activeCount = runners.filter(r => !r.isNonRunner && !r.scratched).length;
    return (
      <Card className="border-border/40" data-testid="apex-race-analysis">
        <CardContent className="flex flex-col items-center justify-center py-8 gap-2">
          <TrendingUp className="h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">
            {activeCount === 0 ? "Add runners to generate the APEX ranking" : "Loading race analysis…"}
          </p>
        </CardContent>
      </Card>
    );
  }

  // Derive picks from ranked list
  const topRated   = ranked[0];
  const bestOfDay  = ranked.find(e => e.result.confidenceClass === "best_of_day");
  const allBOD     = ranked.filter(e => e.result.confidenceClass === "best_of_day");
  const hvPick     = ranked.find(e => e.result.confidenceClass === "hidden_value" || e.highlights.includes("hidden_value_pick"));
  const replayPick = ranked.find(e => e.result.confidenceClass === "replay_upgrade");
  const allReplay  = ranked.filter(e => e.result.confidenceClass === "replay_upgrade");
  const dangerFav  = ranked.find(e => e.highlights.includes("dangerous_favourite"));

  const allNoBet = ranked.every(e => e.result.confidenceClass === "no_bet");
  const isNoBetRace = allNoBet || raceVolatility.tier === "extreme";

  const blocked = raceVolatility.blockedClasses;
  const govNote = raceVolatility.governanceNote;

  return (
    <Card className="border-primary/20 overflow-hidden" data-testid="apex-race-analysis">

      {/* ── Header bar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-border/30">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          <span className="text-sm font-bold tracking-tight">APEX PICKS</span>
          <span className="text-[10px] text-muted-foreground/50 font-mono">{ranked.length} runners analysed</span>
        </div>
        <div className={`flex items-center gap-1.5 text-[10px] font-semibold px-2 py-1 rounded-full border ${TIER_BORDER[raceVolatility.tier]} ${TIER_ACCENT[raceVolatility.tier]}`}>
          <ShieldAlert className="h-3 w-3" />
          {raceVolatility.label} · {raceVolatility.score}/100
        </div>
      </div>

      {/* ── No Bet Race warning ──────────────────────────────────────────────── */}
      {isNoBetRace && <NoBetBanner raceVolatility={raceVolatility} />}

      {/* ── Pick cards grid ──────────────────────────────────────────────────── */}
      <div className={`px-4 py-3 grid gap-2.5 ${isNoBetRace ? "opacity-50 pointer-events-none" : ""}`}
           style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>

        {/* TOP RATED — always shown */}
        <PickCard
          type="top_rated"
          entry={topRated}
          reason={topRated.result.ability.note}
          racecardId={racecardId}
        />

        {/* BEST OF DAY */}
        {blocked.includes("best_of_day") ? (
          <PickCard type="best_of_day" governanceNote={`Blocked — ${govNote}`} racecardId={racecardId} />
        ) : (
          <PickCard
            type="best_of_day"
            entry={bestOfDay}
            reason={bestOfDay
              ? `${bestOfDay.result.classificationNote}${allBOD.length > 1 ? ` · Also: ${allBOD.slice(1).map(e => e.runner.horseName).join(", ")}` : ""}`
              : "No horse reached Best Of Day threshold"}
            racecardId={racecardId}
          />
        )}

        {/* HIDDEN VALUE */}
        {blocked.includes("hidden_value") ? (
          <PickCard type="hidden_value" governanceNote={`Blocked — ${govNote}`} racecardId={racecardId} />
        ) : (
          <PickCard
            type="hidden_value"
            entry={hvPick}
            reason={hvPick ? hvPick.result.hiddenValue.note : "No hidden value candidate identified"}
            racecardId={racecardId}
          />
        )}

        {/* REPLAY UPGRADE */}
        {blocked.includes("replay_upgrade") ? (
          <PickCard type="replay_upgrade" governanceNote={`Blocked — ${govNote}`} racecardId={racecardId} />
        ) : (
          <PickCard
            type="replay_upgrade"
            entry={replayPick}
            reason={replayPick
              ? `${replayPick.result.replayIntelligence.note}${allReplay.length > 1 ? ` · Also: ${allReplay.slice(1).map(e => e.runner.horseName).join(", ")}` : ""}`
              : "No replay upgrade candidate"}
            racecardId={racecardId}
          />
        )}

        {/* DANGEROUS FAVOURITE */}
        <PickCard
          type="dangerous_fav"
          entry={dangerFav}
          reason={dangerFav
            ? `High volatility risk (${dangerFav.result.volatilityRisk.score}/100) · ${dangerFav.result.volatilityRisk.note}`
            : undefined}
          racecardId={racecardId}
          governanceNote={!dangerFav ? "Market favourite not flagged as dangerous" : undefined}
        />
      </div>

      {/* ── Governance note (non-extreme) ────────────────────────────────────── */}
      {!isNoBetRace && blocked.length > 0 && (
        <div className="mx-4 mb-3 flex items-center gap-2 text-[10px] text-orange-400/70 bg-orange-500/5 border border-orange-500/20 rounded px-3 py-2">
          <ShieldAlert className="h-3 w-3 shrink-0" />
          <span>{govNote}</span>
        </div>
      )}

      {/* ── Ranked field ─────────────────────────────────────────────────────── */}
      <div className="border-t border-border/30">
        <div className="flex items-center gap-2 px-4 py-2.5">
          <TrendingUp className="h-3.5 w-3.5 text-primary/60" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
            Full Field Ranking — Strongest to Weakest
          </span>
        </div>

        <div className="divide-y divide-border/20">
          {ranked.map(entry => {
            const { runner, result, rank, highlights, triggers, fieldEdge, fieldN, categoryRanks } = entry;
            const rankS = RANK_STYLE[rank];
            const isExpanded = expandedId === runner.id;

            // Confidence label + colour
            const confLabel = result.confidenceClass.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
            const confColor =
              result.confidenceClass === "best_of_day"            ? "bg-amber-400/20 text-amber-300 border-amber-400/30" :
              result.confidenceClass === "top_rated_high_variance" ? "bg-blue-400/20 text-blue-300 border-blue-400/30" :
              result.confidenceClass === "hidden_value"            ? "bg-emerald-400/20 text-emerald-300 border-emerald-400/30" :
              result.confidenceClass === "replay_upgrade"          ? "bg-purple-400/20 text-purple-300 border-purple-400/30" :
              "bg-muted/20 text-muted-foreground/50 border-border/30";

            return (
              <div key={runner.id} data-testid={`apex-rank-row-${runner.id}`}>
                <button
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/20 transition-colors text-left"
                  onClick={() => setExpandedId(isExpanded ? null : runner.id)}
                >
                  {/* Rank medal */}
                  <div className={`w-7 h-7 rounded-full border flex items-center justify-center shrink-0 ${rankS ? rankS.outer : "bg-secondary/30 border-border/30"}`}>
                    <span className={`text-xs font-bold font-mono ${rankS ? rankS.text : "text-muted-foreground"}`}>{rank}</span>
                  </div>

                  {/* Horse info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <HorseLink horseName={runner.horseName} racecardId={racecardId} runnerId={runner.id} className="font-semibold text-sm" />
                      {runner.odds && <span className="text-xs font-mono font-semibold text-primary shrink-0">{runner.odds}</span>}
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${confColor}`}>{confLabel}</span>
                      {triggers.length > 0 && (
                        <span className="hidden sm:inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded border text-purple-400 border-purple-400/40 bg-purple-400/10">
                          <Film className="h-2.5 w-2.5" />Replay Trigger
                        </span>
                      )}
                      {highlights.includes("hidden_value_pick") && (
                        <span className="hidden sm:inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded border text-emerald-400 border-emerald-400/40 bg-emerald-400/10">
                          <Eye className="h-2.5 w-2.5" />Hidden Value
                        </span>
                      )}
                      {highlights.includes("dangerous_favourite") && (
                        <span className="hidden sm:inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded border text-red-400 border-red-400/40 bg-red-400/10">
                          <AlertTriangle className="h-2.5 w-2.5" />Danger Fav
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {runner.jockey && <span className="text-[11px] text-muted-foreground">{runner.jockey}</span>}
                      {runner.form && <span className="text-[11px] font-mono text-muted-foreground/50">{runner.form}</span>}
                    </div>
                  </div>

                  {/* Score ring + field edge */}
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right hidden sm:block">
                      <span className={`text-[10px] font-mono font-semibold ${fieldEdge >= 0 ? "text-green-400/70" : "text-muted-foreground/40"}`}>
                        {fieldEdge >= 0 ? "+" : ""}{fieldEdge}
                      </span>
                      <div className="text-[9px] text-muted-foreground/40 leading-none">vs field</div>
                    </div>
                    <ScoreRing score={result.totalScore} size={44} />
                    {isExpanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                  </div>
                </button>

                {/* Expanded breakdown */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-2 space-y-4 border-t border-border/20 bg-secondary/5">

                    {/* Classification note */}
                    {result.classificationNote && (
                      <p className={`text-xs px-2.5 py-1.5 rounded border-l-2 border-primary/30 bg-primary/5 ${SCORE_COLOR(result.totalScore)}`}>
                        <span className="font-semibold">{confLabel}: </span>
                        {result.classificationNote}
                      </p>
                    )}
                    {!isNoBetRace && raceVolatility.blockedClasses.length > 0 && (
                      <p className="text-[10px] px-2.5 py-1 rounded border-l-2 border-orange-500/30 bg-orange-500/5 text-orange-400/70">
                        {raceVolatility.governanceNote}
                      </p>
                    )}

                    {/* Field comparison */}
                    <div className="flex items-center gap-4 text-[10px] bg-secondary/40 rounded-lg px-3 py-2">
                      <span className="text-muted-foreground/60">Field edge:</span>
                      <span className={`font-mono font-semibold ${fieldEdge >= 5 ? "text-green-400" : fieldEdge >= 0 ? "text-amber-400/70" : "text-red-400/60"}`}>
                        {fieldEdge >= 0 ? "+" : ""}{fieldEdge} pts
                      </span>
                      <span className="text-muted-foreground/40">·</span>
                      <span className="text-muted-foreground/60">Rank:</span>
                      <span className="font-mono font-semibold">#{rank} of {fieldN}</span>
                    </div>

                    {/* 7-category bars */}
                    <div className="space-y-2.5">
                      {CATS.map(cat => {
                        const bd = result[cat.key as keyof ApexEngineResult] as ScoreBreakdown;
                        const fRank = categoryRanks[cat.key as keyof CategoryRanks];
                        return (
                          <CatBar
                            key={cat.key}
                            label={cat.label}
                            score={bd.score}
                            note={bd.note}
                            bar={cat.bar}
                            fieldRank={fRank}
                            fieldN={fieldN}
                            inverted={"inverted" in cat ? cat.inverted : false}
                          />
                        );
                      })}
                    </div>

                    {/* Replay triggers */}
                    {triggers.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-[10px] text-purple-400/70 font-bold uppercase tracking-wider">Replay Triggers</div>
                        <div className="flex flex-wrap gap-1.5">
                          {triggers.map((t, i) => (
                            <div key={i} className="text-[10px] px-2 py-1 rounded border border-purple-500/30 bg-purple-500/5 text-purple-300/80 flex items-center gap-1">
                              <Film className="h-2.5 w-2.5 shrink-0" />
                              <span className="font-semibold">{t.label}</span>
                              {t.reason && <span className="opacity-60">— {t.reason}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
