import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, Star, Eye, AlertTriangle, Film, TrendingUp, Zap } from "lucide-react";
import {
  runApexEngine,
  type ApexEngineResult,
  type RacecardInput,
  type RaceVolatilityResult,
  type ScoreBreakdown,
  type VolatilityTier,
} from "@/lib/apexEngine";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
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
  fieldEdge: number;       // score - fieldAvg (positive = above average)
  fieldN: number;          // total active runners
  categoryRanks: CategoryRanks;
}

interface Props {
  racecardInput: RacecardInput;
  runners: Runner[];
  raceVolatility: RaceVolatilityResult;
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

const RANK_STYLE: Record<number, { outer: string; text: string }> = {
  1: { outer: "bg-amber-500/20 border-amber-500/50",   text: "text-amber-400" },
  2: { outer: "bg-slate-500/15 border-slate-400/30",   text: "text-slate-300" },
  3: { outer: "bg-orange-700/15 border-orange-600/30", text: "text-orange-400" },
};

const SCORE_COLOR = (s: number) =>
  s >= 72 ? "text-amber-400" : s >= 65 ? "text-blue-400" : s >= 55 ? "text-green-400" : s >= 45 ? "text-yellow-400" : "text-muted-foreground";

const SCORE_RING_STROKE = (s: number) =>
  s >= 72 ? "#f59e0b" : s >= 65 ? "#3b82f6" : s >= 55 ? "#22c55e" : s >= 45 ? "#eab308" : "#6b7280";

const TIER_ACCENT: Record<VolatilityTier, string> = {
  low: "text-green-400", medium: "text-amber-400", high: "text-orange-400", extreme: "text-red-400",
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

const HIGHLIGHT_CONFIG: Record<Highlight, { icon: React.ReactNode; label: string; style: string }> = {
  top_rated:           { icon: <Star className="h-2.5 w-2.5" />,          label: "Top Rated",      style: "text-amber-400 border-amber-400/40 bg-amber-400/10" },
  hidden_value_pick:   { icon: <Eye className="h-2.5 w-2.5" />,           label: "Hidden Value",   style: "text-emerald-400 border-emerald-400/40 bg-emerald-400/10" },
  dangerous_favourite: { icon: <AlertTriangle className="h-2.5 w-2.5" />, label: "Danger Fav",    style: "text-red-400 border-red-400/40 bg-red-400/10" },
  replay_trigger:      { icon: <Film className="h-2.5 w-2.5" />,          label: "Replay Trigger", style: "text-purple-400 border-purple-400/40 bg-purple-400/10" },
};

const CLASS_CONFIG: Record<string, { label: string; accent: string; dot: string }> = {
  best_of_day:            { label: "Best Of Day",             accent: "text-amber-400",   dot: "bg-amber-400" },
  top_rated_high_variance: { label: "Top Rated / High Var",  accent: "text-blue-400",    dot: "bg-blue-400" },
  hidden_value:           { label: "Hidden Value",            accent: "text-emerald-400", dot: "bg-emerald-400" },
  replay_upgrade:         { label: "Replay Upgrade",          accent: "text-purple-400",  dot: "bg-purple-400" },
  no_bet:                 { label: "No Bet",                  accent: "text-muted-foreground", dot: "bg-muted-foreground/30" },
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
      {note && <p className="text-[10px] text-muted-foreground/60 leading-snug pl-36 pr-22">{note}</p>}
    </div>
  );
}

// ── Engine Selection Output ───────────────────────────────────────────────────

function EngineSelectionOutput({ ranked }: { ranked: RankedEntry[] }) {
  const selections = ranked.filter(e => e.result.confidenceClass !== "no_bet");
  const noBets = ranked.filter(e => e.result.confidenceClass === "no_bet");

  const classOrder = ["best_of_day", "top_rated_high_variance", "hidden_value", "replay_upgrade"];

  return (
    <div className="border-b border-border/30 px-4 py-3 space-y-2">
      <div className="flex items-center gap-2 mb-3">
        <Zap className="h-3.5 w-3.5 text-primary" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Engine Selection Output</span>
      </div>

      {selections.length === 0 ? (
        <div className="flex items-center gap-2 py-1">
          <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30 shrink-0" />
          <span className="text-xs text-muted-foreground">
            No qualifying selections — race environment or scores insufficient
          </span>
        </div>
      ) : (
        <div className="space-y-1.5">
          {classOrder.map(cls => {
            const picks = ranked.filter(e => e.result.confidenceClass === cls);
            if (picks.length === 0) return null;
            const cfg = CLASS_CONFIG[cls];
            return (
              <div key={cls} className="flex items-start gap-2.5">
                <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${cfg.dot}`} />
                <div className="flex-1 min-w-0">
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${cfg.accent}`}>{cfg.label}</span>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                    {picks.map(p => (
                      <div key={p.runner.id} className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold">{p.runner.horseName}</span>
                        <span className="text-[10px] font-mono text-muted-foreground">{p.result.totalScore}</span>
                        {p.runner.odds && (
                          <span className="text-[10px] text-primary font-mono">{p.runner.odds}</span>
                        )}
                        <span className={`text-[10px] font-mono ${p.fieldEdge >= 0 ? "text-green-400/70" : "text-muted-foreground/40"}`}>
                          {p.fieldEdge >= 0 ? "+" : ""}{p.fieldEdge} vs field
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
          {noBets.length > 0 && (
            <div className="flex items-start gap-2.5">
              <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 bg-muted-foreground/20" />
              <div className="flex-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">No Bet</span>
                <div className="flex flex-wrap gap-x-3 mt-0.5">
                  {noBets.map(p => (
                    <span key={p.runner.id} className="text-xs text-muted-foreground/40">{p.runner.horseName}</span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ApexRaceAnalysis({ racecardInput, runners, raceVolatility }: Props) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const ranked: RankedEntry[] = useMemo(() => {
    const active = runners.filter(r => !r.isNonRunner && !r.scratched);
    if (active.length === 0) return [];

    // ── Score every runner ────────────────────────────────────────────────────
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

    // ── Sort by total score ───────────────────────────────────────────────────
    scored.sort((a, b) => b.result.totalScore - a.result.totalScore);
    const n = scored.length;

    // ── Field statistics ──────────────────────────────────────────────────────
    const fieldAvg = scored.reduce((sum, e) => sum + e.result.totalScore, 0) / n;

    // Per-category rank maps: 1 = best in field
    type ScoredEntry = typeof scored[0];
    const catRankById = (sortFn: (a: ScoredEntry, b: ScoredEntry) => number) => {
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
      volatilityRisk:     catRankById((a, b) => a.result.volatilityRisk.score - b.result.volatilityRisk.score), // lower is better
    };

    const catRank = (runnerId: number, key: string) => rankMaps[key]?.get(runnerId) ?? n;

    // ── Highlight candidates ──────────────────────────────────────────────────
    const bestHV = scored.reduce<typeof scored[0] | null>((best, cur) =>
      cur.result.hiddenValue.score > (best?.result.hiddenValue.score ?? -1) ? cur : best, null);

    const byOdds = scored
      .map(e => ({ e, dec: parseOddsDecimal(e.runner.odds) }))
      .filter(x => x.dec !== null)
      .sort((a, b) => a.dec! - b.dec!);
    const shortFav = byOdds[0]?.e;
    const favIsDangerous = shortFav &&
      (shortFav.result.volatilityRisk.score >= 50 || raceVolatility.tier === "high" || raceVolatility.tier === "extreme");

    // ── Build final ranked entries ────────────────────────────────────────────
    return scored.map((entry, i) => {
      const rid = entry.runner.id;
      const highlights: Highlight[] = [];
      if (i === 0) highlights.push("top_rated");
      if (bestHV && rid === bestHV.runner.id && entry.result.hiddenValue.score >= 58)
        highlights.push("hidden_value_pick");
      if (favIsDangerous && rid === shortFav.runner.id)
        highlights.push("dangerous_favourite");
      if (entry.triggers.length > 0)
        highlights.push("replay_trigger");

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

  // ── Empty state ───────────────────────────────────────────────────────────
  if (ranked.length === 0) {
    const activeCount = runners.filter(r => !r.isNonRunner && !r.scratched).length;
    return (
      <Card className="border-border/40" data-testid="apex-race-analysis">
        <CardContent className="flex flex-col items-center justify-center py-8 gap-2">
          <TrendingUp className="h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">
            {activeCount === 0
              ? "Add runners to generate the APEX ranking"
              : "Loading race analysis…"}
          </p>
        </CardContent>
      </Card>
    );
  }

  const replayHorses = ranked.filter(e => e.highlights.includes("replay_trigger"));
  const hvPick = ranked.find(e => e.highlights.includes("hidden_value_pick"));
  const dangerFav = ranked.find(e => e.highlights.includes("dangerous_favourite"));

  return (
    <Card className="border-primary/20 overflow-hidden" data-testid="apex-race-analysis">
      {/* ── Header ── */}
      <CardHeader className="px-4 pt-4 pb-0">
        <div className="flex items-center justify-between gap-3 pb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-semibold tracking-tight">APEX Race Analysis</CardTitle>
            <span className="text-[10px] text-muted-foreground/60 font-mono">{ranked.length} runners scored</span>
          </div>
          <span className={`text-[10px] font-semibold ${TIER_ACCENT[raceVolatility.tier]}`}>
            {raceVolatility.label} · {raceVolatility.score}/100
          </span>
        </div>

        {/* ── Insight chips ── */}
        <div className="flex flex-wrap gap-1.5 pb-3 border-b border-border/30">
          <div className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-full bg-amber-400/10 border border-amber-400/30 text-amber-400 font-semibold">
            <Star className="h-2.5 w-2.5" />
            {ranked[0].runner.horseName} · {ranked[0].result.totalScore}
          </div>
          {hvPick && hvPick.runner.id !== ranked[0].runner.id && (
            <div className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-full bg-emerald-400/10 border border-emerald-400/30 text-emerald-400 font-semibold">
              <Eye className="h-2.5 w-2.5" />
              {hvPick.runner.horseName} HV {hvPick.result.hiddenValue.score}
            </div>
          )}
          {dangerFav && (
            <div className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-full bg-red-400/10 border border-red-400/30 text-red-400 font-semibold">
              <AlertTriangle className="h-2.5 w-2.5" />
              Fav at risk: {dangerFav.runner.horseName}
            </div>
          )}
          {replayHorses.length > 0 && (
            <div className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-full bg-purple-400/10 border border-purple-400/30 text-purple-400 font-semibold">
              <Film className="h-2.5 w-2.5" />
              {replayHorses.length} replay trigger{replayHorses.length > 1 ? "s" : ""}
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {/* ── Engine Selection Output ── */}
        <EngineSelectionOutput ranked={ranked} />

        {/* ── Ranked list ── */}
        <div className="divide-y divide-border/20">
          {ranked.map(entry => {
            const { runner, result, rank, highlights, triggers, fieldEdge, fieldN, categoryRanks } = entry;
            const rankS = RANK_STYLE[rank];
            const isExpanded = expandedId === runner.id;

            return (
              <div key={runner.id} data-testid={`apex-rank-row-${runner.id}`}>
                {/* ── Row ── */}
                <button
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/20 transition-colors text-left"
                  onClick={() => setExpandedId(isExpanded ? null : runner.id)}
                  data-testid={`apex-rank-toggle-${runner.id}`}
                >
                  {/* Rank medal */}
                  <div className={`w-8 h-8 rounded-full border flex items-center justify-center shrink-0 ${rankS ? rankS.outer : "bg-secondary/30 border-border/30"}`}>
                    <span className={`text-xs font-bold font-mono ${rankS ? rankS.text : "text-muted-foreground"}`}>{rank}</span>
                  </div>

                  {/* Horse info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm leading-tight">{runner.horseName}</span>
                      {runner.odds && (
                        <span className="text-xs font-mono font-semibold text-primary shrink-0">{runner.odds}</span>
                      )}
                      <ConfidenceBadge confidenceClass={result.confidenceClass} />
                      {highlights.map(h => (
                        <span key={h} className={`hidden sm:inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded border ${HIGHLIGHT_CONFIG[h].style}`}>
                          {HIGHLIGHT_CONFIG[h].icon}{HIGHLIGHT_CONFIG[h].label}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {runner.jockey && <span className="text-[11px] text-muted-foreground">{runner.jockey}</span>}
                      {runner.form && <span className="text-[11px] font-mono text-muted-foreground/50">{runner.form}</span>}
                    </div>
                  </div>

                  {/* Score ring + field edge + expand */}
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right hidden sm:block">
                      <span className={`text-[10px] font-mono font-semibold ${fieldEdge >= 0 ? "text-green-400/70" : "text-muted-foreground/40"}`}>
                        {fieldEdge >= 0 ? "+" : ""}{fieldEdge}
                      </span>
                      <div className="text-[9px] text-muted-foreground/40 leading-none">vs field</div>
                    </div>
                    <ScoreRing score={result.totalScore} size={46} />
                    {isExpanded
                      ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                  </div>
                </button>

                {/* ── Expanded breakdown ── */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-2 space-y-4 border-t border-border/20 bg-secondary/5">

                    {/* Mobile highlight chips */}
                    {highlights.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 sm:hidden">
                        {highlights.map(h => (
                          <span key={h} className={`inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded border ${HIGHLIGHT_CONFIG[h].style}`}>
                            {HIGHLIGHT_CONFIG[h].icon}{HIGHLIGHT_CONFIG[h].label}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Classification + governance */}
                    <div className="space-y-1.5">
                      {result.classificationNote && (
                        <p className={`text-xs px-2.5 py-1.5 rounded border-l-2 border-primary/30 bg-primary/5 ${SCORE_COLOR(result.totalScore)}`}>
                          <span className="font-semibold">{result.confidenceClass.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}: </span>
                          {result.classificationNote}
                        </p>
                      )}
                      {raceVolatility.blockedClasses.length > 0 && (
                        <p className="text-[10px] px-2.5 py-1 rounded border-l-2 border-orange-500/30 bg-orange-500/5 text-orange-400/70">
                          {raceVolatility.governanceNote}
                        </p>
                      )}
                    </div>

                    {/* Field comparison summary */}
                    <div className="flex items-center gap-4 text-[10px] bg-secondary/40 rounded-lg px-3 py-2">
                      <span className="text-muted-foreground/60">Field edge:</span>
                      <span className={`font-mono font-semibold ${fieldEdge >= 5 ? "text-green-400" : fieldEdge >= 0 ? "text-amber-400/70" : "text-red-400/60"}`}>
                        {fieldEdge >= 0 ? "+" : ""}{fieldEdge} pts
                      </span>
                      <span className="text-muted-foreground/40">·</span>
                      <span className="text-muted-foreground/60">Rank:</span>
                      <span className="font-mono font-semibold">#{rank} of {fieldN}</span>
                    </div>

                    {/* Category bars with field ranks */}
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
      </CardContent>
    </Card>
  );
}
