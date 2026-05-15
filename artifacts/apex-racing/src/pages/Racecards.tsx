import { useState } from "react";
import { Link } from "wouter";
import {
  useListRacecards,
  getListRacecardsQueryKey,
  useCreateRacecard,
  useDeleteRacecard,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Plus, Search, Trash2, ChevronRight, Calendar, Flag } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const createSchema = z.object({
  venue: z.string().min(1),
  raceDate: z.string().min(1),
  raceTime: z.string().min(1),
  raceName: z.string().min(1),
  distance: z.string().min(1),
  going: z.string().min(1),
  raceClass: z.string().min(1),
  prize: z.string().optional(),
  trackProfile: z.string().optional(),
  marketContext: z.string().optional(),
  trainerComments: z.string().optional(),
  nonRunners: z.string().optional(),
  calibrationNote: z.string().optional(),
});

type CreateForm = z.infer<typeof createSchema>;

export default function Racecards() {
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: racecards, isLoading } = useListRacecards(
    dateFilter ? { date: dateFilter } : {},
    { query: { queryKey: getListRacecardsQueryKey(dateFilter ? { date: dateFilter } : {}) } }
  );

  const createRacecard = useCreateRacecard();
  const deleteRacecard = useDeleteRacecard();

  const form = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      venue: "", raceDate: "", raceTime: "", raceName: "",
      distance: "", going: "", raceClass: "", prize: "", trackProfile: "",
      marketContext: "", trainerComments: "", nonRunners: "", calibrationNote: "",
    },
  });

  const filtered = (racecards ?? []).filter(r =>
    r.venue.toLowerCase().includes(search.toLowerCase()) ||
    r.raceName.toLowerCase().includes(search.toLowerCase())
  );

  // Group by date
  const grouped = filtered.reduce<Record<string, typeof filtered>>((acc, r) => {
    acc[r.raceDate] = acc[r.raceDate] ?? [];
    acc[r.raceDate].push(r);
    return acc;
  }, {});

  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  const onSubmit = (data: CreateForm) => {
    createRacecard.mutate({ data }, {
      onSuccess: () => {
        toast({ title: "Racecard created" });
        queryClient.invalidateQueries({ queryKey: getListRacecardsQueryKey() });
        setDialogOpen(false);
        form.reset();
      },
      onError: () => toast({ title: "Failed to create racecard", variant: "destructive" }),
    });
  };

  const handleDelete = (id: number) => {
    deleteRacecard.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Racecard deleted" });
        queryClient.invalidateQueries({ queryKey: getListRacecardsQueryKey() });
      },
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight mb-1">Racecards</h1>
          <p className="text-muted-foreground text-sm">Structured race intelligence by meeting.</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-racecard" className="gap-2">
              <Plus className="h-4 w-4" /> New Racecard
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>New Racecard</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="venue" render={({ field }) => (
                    <FormItem><FormLabel>Venue</FormLabel><FormControl><Input data-testid="input-venue" placeholder="Cheltenham" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="raceDate" render={({ field }) => (
                    <FormItem><FormLabel>Date</FormLabel><FormControl><Input data-testid="input-raceDate" type="date" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="raceTime" render={({ field }) => (
                    <FormItem><FormLabel>Race Time</FormLabel><FormControl><Input data-testid="input-raceTime" placeholder="14:30" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="raceName" render={({ field }) => (
                    <FormItem><FormLabel>Race Name</FormLabel><FormControl><Input data-testid="input-raceName" placeholder="Champion Hurdle" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="distance" render={({ field }) => (
                    <FormItem><FormLabel>Distance</FormLabel><FormControl><Input data-testid="input-distance" placeholder="2m" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="going" render={({ field }) => (
                    <FormItem><FormLabel>Going</FormLabel><FormControl><Input data-testid="input-going" placeholder="Good to Firm" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="raceClass" render={({ field }) => (
                    <FormItem><FormLabel>Class</FormLabel><FormControl><Input data-testid="input-raceClass" placeholder="Grade 1" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="prize" render={({ field }) => (
                    <FormItem><FormLabel>Prize</FormLabel><FormControl><Input data-testid="input-prize" placeholder="£500,000" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="trackProfile" render={({ field }) => (
                  <FormItem><FormLabel>Track Profile</FormLabel><FormControl><Input data-testid="input-trackProfile" placeholder="Stayers track, pace collapse in final..." {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="marketContext" render={({ field }) => (
                  <FormItem><FormLabel>Market Context</FormLabel><FormControl><Input data-testid="input-marketContext" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="trainerComments" render={({ field }) => (
                  <FormItem><FormLabel>Trainer Comments</FormLabel><FormControl><Input data-testid="input-trainerComments" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="nonRunners" render={({ field }) => (
                  <FormItem><FormLabel>Non-Runners</FormLabel><FormControl><Input data-testid="input-nonRunners" placeholder="Horse A, Horse B..." {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <Button type="submit" className="w-full" disabled={createRacecard.isPending} data-testid="button-submit-racecard">
                  {createRacecard.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Create Racecard
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            data-testid="input-search-racecards"
            className="pl-9"
            placeholder="Search venue or race name..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Input
          data-testid="input-filter-date"
          type="date"
          className="w-44"
          value={dateFilter}
          onChange={e => setDateFilter(e.target.value)}
        />
        {dateFilter && (
          <Button variant="outline" onClick={() => setDateFilter("")} data-testid="button-clear-date">
            Clear
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-32"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : sortedDates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
            <Flag className="h-8 w-8 opacity-30" />
            <p className="text-sm">No racecards found. Create your first meeting above.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {sortedDates.map(date => (
            <div key={date}>
              <div className="flex items-center gap-2 mb-3">
                <Calendar className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold text-muted-foreground tracking-widest uppercase">{date}</h2>
              </div>
              <div className="grid gap-2">
                {grouped[date].map(race => (
                  <Card key={race.id} className="group hover:border-primary/40 transition-colors" data-testid={`card-racecard-${race.id}`}>
                    <CardContent className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-4">
                        <div className="text-lg font-mono font-bold text-primary w-16">{race.raceTime}</div>
                        <div>
                          <div className="font-semibold text-sm">{race.venue} — {race.raceName}</div>
                          <div className="text-xs text-muted-foreground flex gap-3 mt-0.5">
                            <span>{race.distance}</span>
                            <span>{race.going}</span>
                            <span>{race.raceClass}</span>
                            {race.prize && <span>{race.prize}</span>}
                          </div>
                          {race.nonRunners && (
                            <div className="text-xs text-orange-400 mt-0.5">NR: {race.nonRunners}</div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                          onClick={() => handleDelete(race.id)}
                          data-testid={`button-delete-racecard-${race.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        <Link href={`/racecards/${race.id}`}>
                          <Button variant="outline" size="sm" className="gap-1" data-testid={`button-view-racecard-${race.id}`}>
                            Analyse <ChevronRight className="h-3 w-3" />
                          </Button>
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
