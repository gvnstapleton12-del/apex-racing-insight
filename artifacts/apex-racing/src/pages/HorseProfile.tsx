import { useState } from "react";
import { useParams, Link } from "wouter";
import {
  useGetHorse, getGetHorseQueryKey,
  useUpdateHorse,
  useListHorseNotes, getListHorseNotesQueryKey,
  useCreateHorseNote, useUpdateNote, useDeleteNote,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2, ChevronLeft, Plus, Trash2, Edit2, Save, X, BookOpen } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const NOTE_TYPES = [
  { value: "memory", label: "Memory" },
  { value: "replay", label: "Replay" },
  { value: "track", label: "Track" },
  { value: "context", label: "Context" },
  { value: "trainer", label: "Trainer" },
  { value: "market", label: "Market" },
];

const NOTE_TYPE_COLORS: Record<string, string> = {
  memory: "text-amber-400 border-amber-400/30 bg-amber-400/5",
  replay: "text-cyan-400 border-cyan-400/30 bg-cyan-400/5",
  track: "text-green-400 border-green-400/30 bg-green-400/5",
  context: "text-purple-400 border-purple-400/30 bg-purple-400/5",
  trainer: "text-blue-400 border-blue-400/30 bg-blue-400/5",
  market: "text-orange-400 border-orange-400/30 bg-orange-400/5",
};

export default function HorseProfile() {
  const { id } = useParams<{ id: string }>();
  const horseId = parseInt(id, 10);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: horse, isLoading } = useGetHorse(horseId, {
    query: { queryKey: getGetHorseQueryKey(horseId) }
  });
  const { data: notes } = useListHorseNotes(horseId, {
    query: { queryKey: getListHorseNotesQueryKey(horseId) }
  });

  const updateHorse = useUpdateHorse();
  const createNote = useCreateHorseNote();
  const updateNote = useUpdateNote();
  const deleteNote = useDeleteNote();

  const [editField, setEditField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [newNoteType, setNewNoteType] = useState("memory");
  const [newNoteContent, setNewNoteContent] = useState("");
  const [newNoteRaceRef, setNewNoteRaceRef] = useState("");
  const [editNoteId, setEditNoteId] = useState<number | null>(null);
  const [editNoteContent, setEditNoteContent] = useState("");

  const startEdit = (field: string, value: string | null) => {
    setEditField(field);
    setEditValue(value ?? "");
  };

  const saveEdit = () => {
    if (!editField) return;
    updateHorse.mutate({ id: horseId, data: { [editField]: editValue } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetHorseQueryKey(horseId) });
        setEditField(null);
      },
      onError: () => toast({ title: "Failed to save", variant: "destructive" }),
    });
  };

  const addNote = () => {
    if (!newNoteContent.trim()) return;
    createNote.mutate({
      id: horseId,
      data: {
        noteType: newNoteType,
        content: newNoteContent,
        raceRef: newNoteRaceRef || undefined,
      }
    }, {
      onSuccess: () => {
        toast({ title: "Note added" });
        queryClient.invalidateQueries({ queryKey: getListHorseNotesQueryKey(horseId) });
        setNewNoteContent("");
        setNewNoteRaceRef("");
      },
      onError: () => toast({ title: "Failed to add note", variant: "destructive" }),
    });
  };

  const saveNoteEdit = (noteId: number) => {
    updateNote.mutate({ id: noteId, data: { content: editNoteContent } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListHorseNotesQueryKey(horseId) });
        setEditNoteId(null);
      },
      onError: () => toast({ title: "Failed to update note", variant: "destructive" }),
    });
  };

  const removeNote = (noteId: number) => {
    deleteNote.mutate({ id: noteId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListHorseNotesQueryKey(horseId) });
      },
    });
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  if (!horse) {
    return <div className="text-muted-foreground text-center mt-10">Horse not found</div>;
  }

  const EditableField = ({ field, value, multiline = false, placeholder = "Click to add..." }: { field: string; value: string | null; multiline?: boolean; placeholder?: string }) => {
    if (editField === field) {
      return (
        <div className="flex items-start gap-2">
          {multiline ? (
            <Textarea className="text-sm min-h-[80px]" value={editValue} onChange={e => setEditValue(e.target.value)} autoFocus data-testid={`input-edit-${field}`} />
          ) : (
            <Input className="text-sm h-8" value={editValue} onChange={e => setEditValue(e.target.value)} autoFocus data-testid={`input-edit-${field}`} />
          )}
          <Button size="icon" variant="ghost" className="h-8 w-8 text-primary shrink-0" onClick={saveEdit} data-testid={`button-save-${field}`}>
            <Save className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => setEditField(null)}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      );
    }
    return (
      <div className="flex items-start gap-2 group/edit cursor-pointer" onClick={() => startEdit(field, value)} data-testid={`field-${field}`}>
        <span className={value ? "text-sm" : "text-sm text-muted-foreground/50 italic"}>{value || placeholder}</span>
        <Edit2 className="h-3 w-3 opacity-0 group-hover/edit:opacity-100 transition-opacity text-muted-foreground mt-0.5 shrink-0" />
      </div>
    );
  };

  const notesByType = NOTE_TYPES.reduce<Record<string, typeof notes>>((acc, t) => {
    acc[t.value] = (notes ?? []).filter(n => n.noteType === t.value);
    return acc;
  }, {});

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link href="/horses">
          <Button variant="ghost" size="sm" className="gap-1 -ml-2" data-testid="button-back-horses">
            <ChevronLeft className="h-4 w-4" /> Horses
          </Button>
        </Link>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{horse.name}</h1>
          <div className="flex flex-wrap gap-2 mt-2">
            {horse.trainer && <Badge variant="outline" className="text-xs">{horse.trainer}</Badge>}
            {horse.age && <Badge variant="outline" className="text-xs">{horse.age}yo</Badge>}
            {horse.sex && <Badge variant="outline" className="text-xs">{horse.sex}</Badge>}
            {horse.colour && <Badge variant="outline" className="text-xs">{horse.colour}</Badge>}
            {horse.volatilityRating && (
              <Badge variant="outline" className={`text-xs ${
                horse.volatilityRating.toLowerCase() === 'low' ? 'text-green-400 border-green-400/30' :
                horse.volatilityRating.toLowerCase() === 'high' ? 'text-red-400 border-red-400/30' :
                'text-amber-400 border-amber-400/30'
              }`}>{horse.volatilityRating} volatility</Badge>
            )}
          </div>
        </div>
        <div className="text-right flex gap-6 text-sm">
          {horse.totalRuns != null && (
            <div><div className="text-2xl font-mono font-bold">{horse.totalRuns}</div><div className="text-xs text-muted-foreground">Runs</div></div>
          )}
          {horse.wins != null && (
            <div><div className="text-2xl font-mono font-bold text-green-400">{horse.wins}</div><div className="text-xs text-muted-foreground">Wins</div></div>
          )}
          {horse.places != null && (
            <div><div className="text-2xl font-mono font-bold text-amber-400">{horse.places}</div><div className="text-xs text-muted-foreground">Places</div></div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[
          { label: "Pedigree", children: (
            <div className="space-y-1 text-sm">
              <div className="flex gap-2"><span className="text-muted-foreground w-8">Sire</span><EditableField field="sire" value={horse.sire ?? null} /></div>
              <div className="flex gap-2"><span className="text-muted-foreground w-8">Dam</span><EditableField field="dam" value={horse.dam ?? null} /></div>
            </div>
          )},
          { label: "Conditions", children: (
            <div className="space-y-1 text-sm">
              <div className="flex gap-2"><span className="text-muted-foreground w-24 shrink-0">Pref Going</span><EditableField field="preferredGoing" value={horse.preferredGoing ?? null} /></div>
              <div className="flex gap-2"><span className="text-muted-foreground w-24 shrink-0">Pref Distance</span><EditableField field="preferredDistance" value={horse.preferredDistance ?? null} /></div>
              <div className="flex gap-2"><span className="text-muted-foreground w-24 shrink-0">Volatility</span><EditableField field="volatilityRating" value={horse.volatilityRating ?? null} /></div>
            </div>
          )},
        ].map(({ label, children }) => (
          <Card key={label}>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs font-semibold text-muted-foreground tracking-widest uppercase">{label}</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">{children}</CardContent>
          </Card>
        ))}
      </div>

      {[
        { field: "behaviourProfile", label: "Behaviour Profile" },
        { field: "trackSpecialistNotes", label: "Track Specialist Notes" },
        { field: "hiddenValueFlags", label: "Hidden Value Flags" },
        { field: "memoryNotes", label: "Memory Notes" },
        { field: "replayNotes", label: "Replay Notes" },
      ].map(({ field, label }) => (
        <Card key={field}>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs font-semibold text-muted-foreground tracking-widest uppercase">{label}</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <EditableField field={field} value={(horse as Record<string, string | null>)[field] ?? null} multiline placeholder="Click to add analysis..." />
          </CardContent>
        </Card>
      ))}

      {/* Notes */}
      <Card>
        <CardHeader className="px-4 pt-4">
          <CardTitle className="text-sm font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <BookOpen className="h-4 w-4" /> Intelligence Notes
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-4">
          {/* Add note form */}
          <div className="border border-border rounded-md p-4 space-y-3 bg-secondary/20">
            <div className="flex gap-3">
              <Select value={newNoteType} onValueChange={setNewNoteType}>
                <SelectTrigger className="w-32" data-testid="select-note-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NOTE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input
                placeholder="Race reference (optional)"
                value={newNoteRaceRef}
                onChange={e => setNewNoteRaceRef(e.target.value)}
                className="flex-1 text-sm"
                data-testid="input-note-race-ref"
              />
            </div>
            <Textarea
              data-testid="textarea-new-note"
              placeholder="Add intelligence note..."
              className="min-h-[70px]"
              value={newNoteContent}
              onChange={e => setNewNoteContent(e.target.value)}
            />
            <Button size="sm" className="gap-2" onClick={addNote} disabled={createNote.isPending || !newNoteContent.trim()} data-testid="button-add-note">
              {createNote.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Add Note
            </Button>
          </div>

          {/* Notes tabs */}
          <Tabs defaultValue="memory">
            <TabsList className="grid grid-cols-6 w-full">
              {NOTE_TYPES.map(t => (
                <TabsTrigger key={t.value} value={t.value} className="text-xs" data-testid={`tab-${t.value}`}>
                  {t.label}
                  {(notesByType[t.value]?.length ?? 0) > 0 && (
                    <span className="ml-1 text-primary font-mono text-[10px]">{notesByType[t.value]?.length}</span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
            {NOTE_TYPES.map(t => (
              <TabsContent key={t.value} value={t.value} className="mt-3">
                {(notesByType[t.value]?.length ?? 0) === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-6">No {t.label.toLowerCase()} notes yet.</p>
                ) : (
                  <div className="space-y-2">
                    {notesByType[t.value]?.map(note => (
                      <div key={note.id} className={`group border rounded-md p-3 space-y-1 ${NOTE_TYPE_COLORS[note.noteType] ?? ""}`} data-testid={`note-${note.id}`}>
                        <div className="flex items-start justify-between gap-2">
                          {editNoteId === note.id ? (
                            <div className="flex-1 space-y-2">
                              <Textarea value={editNoteContent} onChange={e => setEditNoteContent(e.target.value)} className="min-h-[60px] text-sm" autoFocus data-testid={`textarea-edit-note-${note.id}`} />
                              <div className="flex gap-2">
                                <Button size="sm" onClick={() => saveNoteEdit(note.id)} disabled={updateNote.isPending} data-testid={`button-save-note-${note.id}`}>Save</Button>
                                <Button size="sm" variant="ghost" onClick={() => setEditNoteId(null)}>Cancel</Button>
                              </div>
                            </div>
                          ) : (
                            <p className="text-sm flex-1">{note.content}</p>
                          )}
                          {editNoteId !== note.id && (
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { setEditNoteId(note.id); setEditNoteContent(note.content); }} data-testid={`button-edit-note-${note.id}`}>
                                <Edit2 className="h-3 w-3" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => removeNote(note.id)} data-testid={`button-delete-note-${note.id}`}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </div>
                        <div className="flex gap-3 text-xs text-muted-foreground">
                          {note.raceRef && <span>{note.raceRef}</span>}
                          {note.venue && <span>{note.venue}</span>}
                          {note.date && <span>{note.date}</span>}
                          <span>{new Date(note.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
