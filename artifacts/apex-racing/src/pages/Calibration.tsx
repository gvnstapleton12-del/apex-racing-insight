import { useState } from "react";
import {
  useGetDailyCalibration, getGetDailyCalibrationQueryKey,
  useListRacecards, getListRacecardsQueryKey,
  useSaveCalibrationEntry,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Plus, TrendingUp, Target, Activity } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";

const today = new Date().toISOString().slice(0, 10);

const entrySchema = z.object({
  date: z.string().min(1),
  racecardId: z.string().min(1),
  predictedClass: z.string().min(1),
  outcome: z.string().min(1),
  apexScore: z.string().optional(),
  notes: z.string().optional(),
});
type EntryForm = z.infer<typeof entrySchema>;

const OUTCOME_LABELS: Record<string, { label: string; color: string }> = {
  win: { label: "Win", color: "text-green-400 border-green-400/30" },
  place: { label: "Place", color: "text-amber-400 border-amber-400/30" },
  unplaced: { label: "Unplaced", color: "text-muted-foreground border-muted" },
  non_runner: { label: "Non-Runner", color: "text-orange-400 border-orange-400/30" },
};

export default function Calibration() {
  const [selectedDate, setSelectedDate] = useState(today);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: calibration, isLoading } = useGetDailyCalibration(
    { date: selectedDate },
    { query: { queryKey: getGetDailyCalibrationQueryKey({ date: selectedDate }) } }
  );
  const { data: racecards } = useListRacecards({}, { query: { queryKey: getListRacecardsQueryKey({}) } });
  const saveEntry = useSaveCalibrationEntry();

  const form = useForm<EntryForm>({
    resolver: zodResolver(entrySchema),
    defaultValues: { date: today, racecardId: "", predictedClass: "no_bet", outcome: "unplaced", apexScore: "", notes: "" },
  });

  const onSubmit = (data: EntryForm) => {
    saveEntry.mutate({
      data: {
        date: data.date,
        racecardId: parseInt(data.racecardId, 10),
        runnerId: null,
        predictedClass: data.predictedClass,
        outcome: data.outcome,
        apexScore: data.apexScore ? parseFloat(data.apexScore) : null,
        notes: data.notes || undefined,
      }
    }, {
      onSuccess: () => {
        toast({ title: "Calibration entry saved" });
        queryClient.invalidateQueries({ queryKey: getGetDailyCalibrationQueryKey({ date: selectedDate }) });
        setDialogOpen(false);
        form.reset({ date: today, racecardId: "", predictedClass: "no_bet", outcome: "unplaced", apexScore: "", notes: "" });
      },
      onError: () => toast({ title: "Failed to save entry", variant: "destructive" }),
    });
  };

  const summary = calibration?.summary;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight mb-1">Calibration</h1>
          <p className="text-muted-foreground text-sm">Daily prediction accuracy review and model tracking.</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Input
            type="date"
            className="flex-1 sm:w-40"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            data-testid="input-calibration-date"
          />
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 shrink-0" data-testid="button-add-calibration-entry">
                <Plus className="h-4 w-4" /> Log Entry
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Log Calibration Entry</DialogTitle></DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField control={form.control} name="date" render={({ field }) => (
                    <FormItem><FormLabel>Date</FormLabel><FormControl><Input type="date" {...field} data-testid="input-entry-date" /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="racecardId" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Race</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger data-testid="select-racecard">
                          <SelectValue placeholder="Select race..." />
                        </SelectTrigger>
                        <SelectContent>
                          {(racecards ?? []).map(r => (
                            <SelectItem key={r.id} value={String(r.id)}>
                              {r.venue} {r.raceTime} — {r.raceName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="predictedClass" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Predicted Class</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <SelectTrigger data-testid="select-predicted-class"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="best_of_day">Best Of Day</SelectItem>
                            <SelectItem value="top_rated_high_variance">Top Rated / High Variance</SelectItem>
                            <SelectItem value="hidden_value">Hidden Value</SelectItem>
                            <SelectItem value="replay_upgrade">Replay Upgrade</SelectItem>
                            <SelectItem value="no_bet">No Bet</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="outcome" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Outcome</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <SelectTrigger data-testid="select-outcome"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="win">Win</SelectItem>
                            <SelectItem value="place">Place</SelectItem>
                            <SelectItem value="unplaced">Unplaced</SelectItem>
                            <SelectItem value="non_runner">Non-Runner</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <FormField control={form.control} name="apexScore" render={({ field }) => (
                    <FormItem><FormLabel>APEX Score (optional)</FormLabel><FormControl><Input type="number" placeholder="0-100" {...field} data-testid="input-apex-score" /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="notes" render={({ field }) => (
                    <FormItem><FormLabel>Notes</FormLabel><FormControl><Input placeholder="Post-race notes..." {...field} data-testid="input-calibration-notes" /></FormControl><FormMessage /></FormItem>
                  )} />
                  <Button type="submit" className="w-full" disabled={saveEntry.isPending} data-testid="button-submit-calibration">
                    {saveEntry.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Save Entry
                  </Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Summary Stats */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {[
            { label: "Total", value: summary.totalPredictions, icon: Target },
            { label: "Wins", value: summary.wins, icon: TrendingUp, color: "text-green-400" },
            { label: "Places", value: summary.places, icon: Activity, color: "text-amber-400" },
            { label: "Strike Rate", value: `${summary.strikeRate}%`, icon: Activity, color: "text-primary" },
            { label: "Place Rate", value: `${summary.placeRate}%`, icon: Activity, color: "text-blue-400" },
            { label: "Unplaced", value: summary.unplaced, color: "text-muted-foreground" },
          ].map(({ label, value, icon: Icon, color }) => (
            <Card key={label}>
              <CardContent className="px-4 py-3">
                <div className="text-xs text-muted-foreground mb-1">{label}</div>
                <div className={`text-2xl font-mono font-bold ${color ?? ""}`} data-testid={`stat-${label.toLowerCase().replace(" ", "-")}`}>{value}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Record breakdown */}
      {summary && (
        <div className="grid grid-cols-2 gap-4">
          <Card className="border-amber-500/20 bg-amber-500/5">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs text-amber-400 uppercase tracking-widest">Best Of Day Record</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="text-3xl font-mono font-bold text-amber-400">{summary.bestOfDayRecord}</div>
            </CardContent>
          </Card>
          <Card className="border-green-500/20 bg-green-500/5">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs text-green-400 uppercase tracking-widest">Hidden Value Record</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="text-3xl font-mono font-bold text-green-400">{summary.hiddenValueRecord}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Entries table */}
      {isLoading ? (
        <div className="flex items-center justify-center h-32"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (calibration?.entries?.length ?? 0) === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center h-32 text-muted-foreground gap-2">
            <Activity className="h-8 w-8 opacity-30" />
            <p className="text-sm">No calibration entries for {selectedDate}.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="px-4 pt-4 pb-2">
            <CardTitle className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              Entries — {selectedDate}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <div className="divide-y divide-border">
              {calibration?.entries.map(entry => {
                const outcomeInfo = OUTCOME_LABELS[entry.outcome] ?? { label: entry.outcome, color: "" };
                return (
                  <div key={entry.id} className="flex items-center justify-between px-4 py-3" data-testid={`entry-${entry.id}`}>
                    <div className="flex items-center gap-4">
                      <ConfidenceBadge confidenceClass={entry.predictedClass} />
                      {entry.apexScore != null && (
                        <span className="font-mono text-sm text-primary font-bold">{entry.apexScore}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {entry.notes && <span className="text-xs text-muted-foreground">{entry.notes}</span>}
                      <Badge variant="outline" className={`text-xs ${outcomeInfo.color}`}>{outcomeInfo.label}</Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
