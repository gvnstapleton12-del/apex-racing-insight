import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import {
  useGetRunner, getGetRunnerQueryKey,
  useGetRacecard, getGetRacecardQueryKey,
  useListRunners, getListRunnersQueryKey,
  useListScores, getListScoresQueryKey,
  useCreateScore, useUpdateScore,
  useListHorseNotes, getListHorseNotesQueryKey,
  useCreateHorseNote,
  useDeleteNote,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ChevronLeft, Save, Zap, RotateCcw, Plus, Trash2, Brain, Target, Film, Gem, ChevronDown, ChevronUp, BookOpen, FlameKindling } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { Link } from "wouter";
import { runApexEngine, type ApexEngineResult, type HorseMemory } from "@/lib/apexEngine";
import type { HorseNote } from "@workspace/api-client-react";

// ── Note type config ─────────────────────────────────────────────────────────
const NOTE_TYPES = [
  {
    key: "replay",
    label: "Replay Notes",
    Icon: Film,
    desc: "What the replay revealed — interference, unlucky passages, hidden class",
    color: "text-cyan-400",
    bg: "bg-cyan-400/8",
    border: "border-cyan-400/25",
  },
  {
    key: "behaviour",
    label: "Behavioural Tags",
    Icon: Brain,
    desc: "Quirks, gate habits, equipment, temperament under pressure",
    color: "text-purple-400",
    bg: "bg-purple-400/8",
    border: "border-purple-400/25",
  },
  {
    key: "tactical",
    label: "Tactical Observations",
    Icon: Target,
    desc: "Positional preferences, pace needs, ground requirements",
    color: "text-blue-400",
    bg: "bg-blue-400/8",
    border: "border-blue-400/25",
  },
  {
    key: "pressure",
    label: "Pressure Response",
    Icon: FlameKindling,
    desc: "How the horse responds when challenged — battles, folds, or hangs",
    color: "text-orange-400",
    bg: "bg-orange-400/8",
    border: "border-orange-400/25",
  },
  {
    key: "hidden_value",
    label: "Hidden Value Flags",
    Icon: Gem,
    desc: "Trainer angles, market moves, equipment changes, course specialists",
    color: "text-green-400",
    bg: "bg-green-400/8",
    border: "border-green-400/25",
  },
] as const;

type NoteTypeKey = typeof NOTE_TYPES[number]["key"];

// ── Horse Memory Panel ────────────────────────────────────────────────────────
function HorseMemoryPanel({
  profileId,
  raceName,
  venue,
}: {
  profileId: number;
  raceName: string;
  venue: string;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: notes = [], isLoading } = useListHorseNotes(profileId, {
    query: { queryKey: getListHorseNotesQueryKey(profileId) },
  });
  const createNote = useCreateHorseNote();
  const deleteNote = useDeleteNote();

  const [expanded, setExpanded] = useState<NoteTypeKey | null>(null);
  const [draft, setDraft] = useState<Record<NoteTypeKey, string>>({
    replay: "", behaviour: "", tactical: "", pressure: "", hidden_value: "",
  });
  const [adding, setAdding] = useState<NoteTypeKey | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (adding && textareaRef.current) textareaRef.current.focus();
  }, [adding]);

  const totalCount = notes.length;

  const handleAdd = (type: NoteTypeKey) => {
    const content = draft[type].trim();
    if (!content) return;
    createNote.mutate(
      { id: profileId, data: { noteType: type, content, raceRef: raceName, venue } },
      {
        onSuccess: () => {
          setDraft(d => ({ ...d, [type]: "" }));
          setAdding(null);
          queryClient.invalidateQueries({ queryKey: getListHorseNotesQueryKey(profileId) });
          toast({ title: "Note saved to horse memory" });
        },
        onError: () => toast({ title: "Failed to save note", variant: "destructive" }),
      }
    );
  };

  const handleDelete = (noteId: number) => {
    deleteNote.mutate({ id: noteId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListHorseNotesQueryKey(profileId) });
        toast({ title: "Note removed" });
      },
      onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
    });
  };

  const [panelOpen, setPanelOpen] = useState(false);

  // Auto-expand if there are notes
  useEffect(() => {
    if (notes.length > 0) setPanelOpen(true);
  }, [notes.length]);

  return (
    <Card className="border-border/60">
      <button
        className="w-full text-left"
        onClick={() => setPanelOpen(o => !o)}
        data-testid="horse-memory-toggle"
      >
        <CardHeader className="pb-2 pt-4 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary shrink-0" />
            <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Horse Memory
            </CardTitle>
            {totalCount > 0 && (
              <Badge variant="outline" className="text-xs h-4 px-1.5 text-primary border-primary/30 bg-primary/10">
                {totalCount}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {isLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
            {panelOpen
              ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
              : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        </CardHeader>
      </button>

      {panelOpen && (
        <CardContent className="pt-0 pb-3 space-y-3">
          <p className="text-xs text-muted-foreground/70 -mt-1 px-0.5">
            Notes persist across races — they automatically feed into the APEX engine when Auto-Score runs.
          </p>
          {NOTE_TYPES.map(nt => {
            const typeNotes = notes.filter(n => n.noteType === nt.key);
            const isExpanded = expanded === nt.key;
            const isAdding = adding === nt.key;
            const Icon = nt.Icon;
            return (
              <div key={nt.key} className={`rounded-lg border px-3 py-2.5 ${nt.border} ${nt.bg}`}>
                <button
                  className="w-full text-left"
                  onClick={() => {
                    setExpanded(e => e === nt.key ? null : nt.key);
                    setAdding(null);
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon className={`h-3.5 w-3.5 shrink-0 ${nt.color}`} />
                      <span className={`text-xs font-semibold ${nt.color}`}>{nt.label}</span>
                      {typeNotes.length > 0 && (
                        <span className="text-xs text-muted-foreground">({typeNotes.length})</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        className={`h-5 w-5 flex items-center justify-center rounded-full border ${nt.border} hover:opacity-80 ${nt.color}`}
                        onClick={e => {
                          e.stopPropagation();
                          setAdding(a => a === nt.key ? null : nt.key);
                          setExpanded(nt.key);
                        }}
                        data-testid={`add-note-${nt.key}`}
                        title="Add note"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                      {(isExpanded || isAdding)
                        ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                        : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                    </div>
                  </div>
                </button>

                {(isExpanded || isAdding) && (
                  <div className="mt-2 space-y-2">
                    {!isExpanded && typeNotes.length === 0 && !isAdding && (
                      <p className="text-xs text-muted-foreground/60 italic px-0.5">{nt.desc}</p>
                    )}
                    {isExpanded && typeNotes.length === 0 && !isAdding && (
                      <p className="text-xs text-muted-foreground/60 italic px-0.5">No notes yet — {nt.desc.toLowerCase()}</p>
                    )}
                    {typeNotes.map(note => (
                      <div key={note.id} className="flex items-start gap-2 group">
                        <div className="flex-1 min-w-0 bg-background/40 rounded px-2.5 py-2 border border-border/40">
                          <p className="text-xs text-foreground leading-snug">{note.content}</p>
                          {(note.venue || note.raceRef || note.date) && (
                            <p className="text-xs text-muted-foreground/50 mt-0.5 leading-tight truncate">
                              {[note.venue, note.raceRef, note.date].filter(Boolean).join(" · ")}
                            </p>
                          )}
                        </div>
                        <button
                          className="shrink-0 mt-1 opacity-0 group-hover:opacity-100 hover:text-red-400 text-muted-foreground/40 transition-opacity"
                          onClick={() => handleDelete(note.id)}
                          title="Delete note"
                          data-testid={`delete-note-${note.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}

                    {isAdding && (
                      <div className="space-y-2">
                        <Textarea
                          ref={textareaRef}
                          placeholder={nt.desc}
                          className="min-h-[64px] text-xs bg-background/40 resize-none"
                          value={draft[nt.key]}
                          onChange={e => setDraft(d => ({ ...d, [nt.key]: e.target.value }))}
                          onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleAdd(nt.key); }}
                          data-testid={`note-textarea-${nt.key}`}
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className={`h-7 text-xs px-3 gap-1`}
                            onClick={() => handleAdd(nt.key)}
                            disabled={!draft[nt.key].trim() || createNote.isPending}
                            data-testid={`save-note-${nt.key}`}
                          >
                            {createNote.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs px-3"
                            onClick={() => { setAdding(null); setDraft(d => ({ ...d, [nt.key]: "" })); }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      )}
    </Card>
  );
}

// ── Score Categories ──────────────────────────────────────────────────────────
const CATEGORIES = [
  { key: "abilityScore",            label: "Ability",             engineKey: "ability",            description: "Raw racing ability based on form, ratings, and class",          color: "bg-amber-500",  bar: "from-amber-600 to-amber-400"  },
  { key: "paceFitScore",            label: "Pace Fit",            engineKey: "paceFit",            description: "How well the pace scenario suits this horse",                   color: "bg-blue-500",   bar: "from-blue-600 to-blue-400"    },
  { key: "tacticalResilienceScore", label: "Tactical Resilience", engineKey: "tacticalResilience", description: "Ability to handle adversity, traffic, and positional changes",  color: "bg-purple-500", bar: "from-purple-600 to-purple-400" },
  { key: "groundTripScore",         label: "Ground / Trip",       engineKey: "groundTrip",         description: "Proven suitability to today's conditions and distance",          color: "bg-green-500",  bar: "from-green-600 to-green-400"  },
  { key: "replayIntelligenceScore", label: "Replay Intelligence", engineKey: "replayIntelligence", description: "Evidence from replay analysis showing latent performance",       color: "bg-cyan-500",   bar: "from-cyan-600 to-cyan-400"    },
  { key: "hiddenValueScore",        label: "Hidden Value",        engineKey: "hiddenValue",        description: "Market underestimation, second-run bonus, first-time equipment", color: "bg-orange-500", bar: "from-orange-600 to-orange-400" },
  { key: "volatilityRisk",          label: "Volatility Risk",     engineKey: "volatilityRisk",     description: "Behavioural risk and inconsistency (lower is better)",           color: "bg-red-500",    bar: "from-red-600 to-red-400"      },
] as const;

type CatKey = typeof CATEGORIES[number]["key"];

const CONFIDENCE_CLASSES = [
  { value: "best_of_day",            label: "Best Of Day",              color: "text-amber-400 border-amber-400/40 bg-amber-400/10" },
  { value: "top_rated_high_variance",label: "Top Rated / High Variance",color: "text-purple-400 border-purple-400/40 bg-purple-400/10" },
  { value: "hidden_value",           label: "Hidden Value",             color: "text-green-400 border-green-400/40 bg-green-400/10" },
  { value: "replay_upgrade",         label: "Replay Upgrade",           color: "text-cyan-400 border-cyan-400/40 bg-cyan-400/10" },
  { value: "no_bet",                 label: "No Bet",                   color: "text-muted-foreground border-border bg-secondary/30" },
];

function computeTotal(scores: Record<string, number>): number {
  const weighted =
    scores.abilityScore * 0.25 +
    scores.paceFitScore * 0.15 +
    scores.tacticalResilienceScore * 0.15 +
    scores.groundTripScore * 0.15 +
    scores.replayIntelligenceScore * 0.15 +
    scores.hiddenValueScore * 0.15 -
    scores.volatilityRisk * 0.1;
  return Math.max(0, Math.min(100, Math.round(weighted * 10) / 10));
}

function ScoreBar({
  label, description, value, note, onChange, color, bar, isVolatility,
}: {
  label: string; description: string; value: number; note: string;
  onChange: (v: number) => void; color: string; bar: string; isVolatility: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{label}</span>
            {isVolatility && <span className="text-xs text-muted-foreground">(lower = better)</span>}
          </div>
          <p className="text-xs text-muted-foreground leading-snug">{description}</p>
        </div>
        <div className={`text-2xl font-mono font-bold w-12 text-right shrink-0 ${isVolatility ? "text-red-400" : "text-primary"}`}>
          {value}
        </div>
      </div>

      <div className="relative h-7 flex items-center">
        <div className="w-full h-2.5 bg-secondary rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all bg-gradient-to-r ${bar}`}
            style={{ width: `${value}%` }}
          />
        </div>
        <input
          type="range" min={0} max={100} step={1} value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="absolute inset-0 w-full opacity-0 cursor-pointer h-7"
          data-testid={`slider-${label.toLowerCase().replace(/[\s/]+/g, "-")}`}
        />
      </div>

      {note && (
        <p className={`text-xs px-2 py-1 rounded border-l-2 ${isVolatility ? "border-red-500/40 bg-red-500/5 text-red-300/80" : `${color.replace("bg-", "border-")}/40 bg-secondary/30 text-muted-foreground`}`}>
          {note}
        </p>
      )}
    </div>
  );
}

function TotalScoreRing({ score }: { score: number }) {
  const pct = score / 100;
  const r = 36;
  const circ = 2 * Math.PI * r;
  const dash = pct * circ;
  const color = score >= 72 ? "#f59e0b" : score >= 60 ? "#22c55e" : score >= 45 ? "#3b82f6" : "#6b7280";

  return (
    <div className="relative w-24 h-24 flex items-center justify-center">
      <svg className="absolute inset-0 -rotate-90" width="96" height="96" viewBox="0 0 96 96">
        <circle cx="48" cy="48" r={r} fill="none" stroke="hsl(220 25% 18%)" strokeWidth="8" />
        <circle
          cx="48" cy="48" r={r} fill="none"
          stroke={color} strokeWidth="8"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          className="transition-all duration-500"
        />
      </svg>
      <div className="text-center">
        <div className="text-2xl font-mono font-bold" style={{ color }}>{score}</div>
        <div className="text-xs text-muted-foreground leading-none">APEX</div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function buildMemoryFromNotes(notes: HorseNote[]): HorseMemory {
  const join = (type: string) =>
    notes.filter(n => n.noteType === type).map(n => n.content).join(". ") || undefined;
  return {
    replay:      join("replay"),
    behaviour:   join("behaviour"),
    tactical:    join("tactical"),
    pressure:    join("pressure"),
    hiddenValue: join("hidden_value"),
  };
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function ScoreEditor() {
  const { id, runnerId } = useParams<{ id: string; runnerId: string }>();
  const racecardId = parseInt(id, 10);
  const runnerIdNum = parseInt(runnerId, 10);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: runner, isLoading: runnerLoading } = useGetRunner(runnerIdNum, {
    query: { queryKey: getGetRunnerQueryKey(runnerIdNum) }
  });
  const { data: racecard, isLoading: racecardLoading } = useGetRacecard(racecardId, {
    query: { queryKey: getGetRacecardQueryKey(racecardId) }
  });
  const { data: allRunners } = useListRunners(racecardId, {
    query: { queryKey: getListRunnersQueryKey(racecardId) }
  });
  const { data: scores } = useListScores(
    { runnerId: runnerIdNum },
    { query: { queryKey: getListScoresQueryKey({ runnerId: runnerIdNum }) } }
  );

  // Horse profile id — resolved via find-or-create
  const [profileId, setProfileId] = useState<number | null>(
    runner?.horseId ?? null
  );

  // Fetch/create horse profile as soon as the runner name is available
  useEffect(() => {
    if (!runner?.horseName) return;
    if (runner.horseId) { setProfileId(runner.horseId); return; }
    if (profileId !== null) return; // already resolved
    fetch("/api/horses/find-or-create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: runner.horseName }),
    })
      .then(r => r.json())
      .then((h: { id: number }) => setProfileId(h.id))
      .catch(() => { /* non-fatal */ });
  }, [runner?.horseName, runner?.horseId, profileId]);

  // Load memory notes (enabled once profileId is known)
  const { data: memoryNotes = [] } = useListHorseNotes(profileId ?? 0, {
    query: {
      queryKey: getListHorseNotesQueryKey(profileId ?? 0),
      enabled: profileId !== null && profileId > 0,
    },
  });

  const existingScore = (scores ?? []).find(s => s.runnerId === runnerIdNum);

  const [vals, setVals] = useState<Record<CatKey, number>>({
    abilityScore: 50, paceFitScore: 50, tacticalResilienceScore: 50,
    groundTripScore: 50, replayIntelligenceScore: 50, hiddenValueScore: 50, volatilityRisk: 30,
  });
  const [confidenceClass, setConfidenceClass] = useState("no_bet");
  const [analystNotes, setAnalystNotes] = useState("");
  const [replayContext, setReplayContext] = useState("");
  const [contextualIntelligence, setContextualIntelligence] = useState("");
  const [scoreNotes, setScoreNotes] = useState<Record<string, string>>({});
  const [classificationNote, setClassificationNote] = useState("");
  const [autoScored, setAutoScored] = useState(false);
  const [initialised, setInitialised] = useState(false);

  const runEngine = (rc = racecard, rn = runner, runners = allRunners, notes = memoryNotes) => {
    if (!rc || !rn) return;
    const fieldSize = (runners ?? []).filter(r => !r.isNonRunner && !r.scratched).length || 1;
    const memory = buildMemoryFromNotes(notes);
    const result: ApexEngineResult = runApexEngine(
      {
        horseName: rn.horseName,
        draw: rn.draw,
        age: rn.age ?? undefined,
        form: rn.form ?? undefined,
        odds: rn.odds ?? undefined,
        jockey: rn.jockey,
        trainer: rn.trainer,
        weight: rn.weight,
        memory,
      },
      {
        raceName: rc.raceName,
        distance: rc.distance,
        going: rc.going,
        raceClass: rc.raceClass,
        prize: rc.prize,
        trackProfile: rc.trackProfile,
        marketContext: rc.marketContext,
        trainerComments: rc.trainerComments,
        nonRunners: rc.nonRunners,
        fieldSize,
      }
    );

    setVals({
      abilityScore: result.ability.score,
      paceFitScore: result.paceFit.score,
      tacticalResilienceScore: result.tacticalResilience.score,
      groundTripScore: result.groundTrip.score,
      replayIntelligenceScore: result.replayIntelligence.score,
      hiddenValueScore: result.hiddenValue.score,
      volatilityRisk: result.volatilityRisk.score,
    });
    setConfidenceClass(result.confidenceClass);
    setClassificationNote(result.classificationNote);
    setScoreNotes({
      abilityScore: result.ability.note,
      paceFitScore: result.paceFit.note,
      tacticalResilienceScore: result.tacticalResilience.note,
      groundTripScore: result.groundTrip.note,
      replayIntelligenceScore: result.replayIntelligence.note,
      hiddenValueScore: result.hiddenValue.note,
      volatilityRisk: result.volatilityRisk.note,
    });
    setAutoScored(true);
  };

  useEffect(() => {
    if (existingScore && !initialised) {
      setVals({
        abilityScore: existingScore.abilityScore,
        paceFitScore: existingScore.paceFitScore,
        tacticalResilienceScore: existingScore.tacticalResilienceScore,
        groundTripScore: existingScore.groundTripScore,
        replayIntelligenceScore: existingScore.replayIntelligenceScore,
        hiddenValueScore: existingScore.hiddenValueScore,
        volatilityRisk: existingScore.volatilityRisk,
      });
      setConfidenceClass(existingScore.confidenceClass);
      setAnalystNotes(existingScore.analystNotes ?? "");
      setReplayContext(existingScore.replayContext ?? "");
      setContextualIntelligence(existingScore.contextualIntelligence ?? "");
      setInitialised(true);
    } else if (!existingScore && !initialised && racecard && runner && allRunners) {
      runEngine(racecard, runner, allRunners, memoryNotes);
      setInitialised(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingScore, initialised, racecard, runner, allRunners]);

  const createScore = useCreateScore();
  const updateScore = useUpdateScore();
  const totalScore = computeTotal(vals);

  const save = () => {
    const payload = { ...vals, confidenceClass, analystNotes, replayContext, contextualIntelligence };
    if (existingScore) {
      updateScore.mutate({ id: existingScore.id, data: payload }, {
        onSuccess: () => {
          toast({ title: "APEX Score updated" });
          queryClient.invalidateQueries({ queryKey: getListScoresQueryKey({ runnerId: runnerIdNum }) });
          queryClient.invalidateQueries({ queryKey: getListScoresQueryKey({ racecardId }) });
          setLocation(`/racecards/${racecardId}`);
        },
        onError: () => toast({ title: "Failed to save", variant: "destructive" }),
      });
    } else {
      createScore.mutate({ data: { runnerId: runnerIdNum, racecardId, ...payload } }, {
        onSuccess: () => {
          toast({ title: "APEX Score saved" });
          queryClient.invalidateQueries({ queryKey: getListScoresQueryKey({ runnerId: runnerIdNum }) });
          queryClient.invalidateQueries({ queryKey: getListScoresQueryKey({ racecardId }) });
          setLocation(`/racecards/${racecardId}`);
        },
        onError: () => toast({ title: "Failed to save", variant: "destructive" }),
      });
    }
  };

  if (runnerLoading || racecardLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }
  if (!runner || !racecard) {
    return <div className="text-muted-foreground text-center mt-10">Runner or racecard not found</div>;
  }

  const activeRunners = (allRunners ?? []).filter(r => !r.isNonRunner && !r.scratched).length;
  const confInfo = CONFIDENCE_CLASSES.find(c => c.value === confidenceClass) ?? CONFIDENCE_CLASSES[4];

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-2xl pb-8">

      {/* ── Back ── */}
      <Link href={`/racecards/${racecardId}`}>
        <Button variant="ghost" size="sm" className="gap-1 -ml-2" data-testid="button-back-race">
          <ChevronLeft className="h-4 w-4" /> {racecard.venue}
        </Button>
      </Link>

      {/* ── Hero header ── */}
      <div className="flex items-center gap-4">
        <TotalScoreRing score={totalScore} />
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold tracking-tight leading-tight">{runner.horseName}</h1>
          <div className="text-xs text-muted-foreground mt-0.5 leading-snug">
            {runner.jockey}{runner.trainer ? ` · ${runner.trainer}` : ""}
          </div>
          <div className="text-xs text-muted-foreground leading-snug">
            {racecard.raceTime} · {racecard.venue} · {racecard.raceName}
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <Badge variant="outline" className={`text-xs ${confInfo.color}`}>
              {confInfo.label}
            </Badge>
            {runner.odds && <span className="text-xs font-mono text-primary">{runner.odds}</span>}
            {runner.age && <span className="text-xs text-muted-foreground">{runner.age}yo</span>}
            {runner.form && <span className="text-xs font-mono text-muted-foreground">{runner.form}</span>}
            {activeRunners > 0 && <span className="text-xs text-muted-foreground">{activeRunners} runners</span>}
            {memoryNotes.length > 0 && (
              <Badge variant="outline" className="text-xs text-primary border-primary/30 bg-primary/8 gap-1">
                <BookOpen className="h-2.5 w-2.5" /> {memoryNotes.length} memory note{memoryNotes.length !== 1 ? "s" : ""}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* ── Auto-score banner ── */}
      <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg bg-secondary/40 border border-border/40">
        <div className="flex items-center gap-2 text-sm">
          <Zap className="h-4 w-4 text-primary shrink-0" />
          <span className="text-muted-foreground text-xs">
            {autoScored
              ? memoryNotes.length > 0
                ? `Engine scores loaded — memory notes applied (${memoryNotes.length} notes)`
                : "Engine scores loaded — adjust sliders to override"
              : "Scores from previous save — re-run engine to refresh"}
          </span>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 shrink-0 text-xs h-7 px-2.5"
          onClick={() => runEngine(racecard, runner, allRunners, memoryNotes)}
          data-testid="button-auto-score"
        >
          <RotateCcw className="h-3 w-3" /> Auto-Score
        </Button>
      </div>

      {/* ── Classification note ── */}
      {classificationNote && (
        <div className={`px-3 py-2 rounded-lg border-l-2 text-xs ${confInfo.color}`}>
          <span className="font-semibold">{confInfo.label}: </span>{classificationNote}
        </div>
      )}

      {/* ── Horse Memory Panel ── */}
      {profileId !== null && (
        <HorseMemoryPanel
          profileId={profileId}
          raceName={racecard.raceName}
          venue={racecard.venue}
        />
      )}

      {/* ── Score sliders ── */}
      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Predictor Categories
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 pt-2">
          {CATEGORIES.map(cat => (
            <ScoreBar
              key={cat.key}
              label={cat.label}
              description={cat.description}
              value={vals[cat.key]}
              note={scoreNotes[cat.key] ?? ""}
              onChange={v => setVals(prev => ({ ...prev, [cat.key]: v }))}
              color={cat.color}
              bar={cat.bar}
              isVolatility={cat.key === "volatilityRisk"}
            />
          ))}
        </CardContent>
      </Card>

      {/* ── Confidence Classification ── */}
      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Confidence Classification
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-2">
            {CONFIDENCE_CLASSES.map(c => (
              <button
                key={c.value}
                onClick={() => setConfidenceClass(c.value)}
                data-testid={`option-${c.value}`}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all text-left ${
                  confidenceClass === c.value
                    ? `${c.color} ring-1 ring-current`
                    : "border-border/40 text-muted-foreground hover:border-border hover:text-foreground"
                }`}
              >
                <div className={`w-2 h-2 rounded-full shrink-0 ${
                  confidenceClass === c.value ? "bg-current" : "bg-muted-foreground/30"
                }`} />
                {c.label}
                {confidenceClass === c.value && classificationNote && (
                  <span className="text-xs font-normal opacity-70 ml-auto hidden sm:block truncate max-w-[200px]">
                    Engine suggestion
                  </span>
                )}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Intelligence Fields ── */}
      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Analyst Intelligence
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block uppercase tracking-wide">Analyst Notes</Label>
            <Textarea
              data-testid="textarea-analyst-notes"
              placeholder="General analysis notes..."
              className="min-h-[72px] text-sm"
              value={analystNotes}
              onChange={e => setAnalystNotes(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block uppercase tracking-wide">Replay Context</Label>
            <Textarea
              data-testid="textarea-replay-context"
              placeholder="What did the replay show? Interference, pace scenario, hidden sections..."
              className="min-h-[72px] text-sm"
              value={replayContext}
              onChange={e => setReplayContext(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block uppercase tracking-wide">Contextual Intelligence</Label>
            <Textarea
              data-testid="textarea-contextual-intelligence"
              placeholder="Track specialist behaviour, trainer context, market clues..."
              className="min-h-[72px] text-sm"
              value={contextualIntelligence}
              onChange={e => setContextualIntelligence(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Button
        className="w-full gap-2 h-11 text-base font-semibold"
        onClick={save}
        disabled={createScore.isPending || updateScore.isPending}
        data-testid="button-save-score"
      >
        {(createScore.isPending || updateScore.isPending)
          ? <Loader2 className="h-4 w-4 animate-spin" />
          : <Save className="h-4 w-4" />}
        {existingScore ? "Update APEX Score" : "Save APEX Score"}
      </Button>
    </div>
  );
}
