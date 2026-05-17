import { useState, useRef } from "react";
import {
  useUploadRaces,
  useUploadResults,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Upload as UploadIcon, FileText, CheckCircle, AlertCircle, X, RefreshCw, Eye, EyeOff, ClipboardPaste } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const LS_USERNAME = "apex_racing_api_username";
const LS_PASSWORD = "apex_racing_api_password";

interface ParsedRow {
  [key: string]: string;
}

function parseCSV(text: string): ParsedRow[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map(line => {
    const values = line.split(",").map(v => v.trim().replace(/^"|"$/g, ""));
    const row: ParsedRow = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ""; });
    return row;
  });
}

function formatExcelValue(v: unknown): string {
  if (v instanceof Date) {
    const year = v.getFullYear();
    // Time-only values land on Excel epoch (1899/1900); real dates are > 1900
    if (year <= 1900) {
      const h = String(v.getHours()).padStart(2, "0");
      const m = String(v.getMinutes()).padStart(2, "0");
      return `${h}:${m}`;
    }
    const y  = v.getFullYear();
    const mo = String(v.getMonth() + 1).padStart(2, "0");
    const d  = String(v.getDate()).padStart(2, "0");
    return `${y}-${mo}-${d}`;
  }
  return String(v ?? "").trim();
}

function parseExcel(buffer: ArrayBuffer): ParsedRow[] {
  // cellDates:true converts Excel serial numbers → JS Date objects
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  return raw.map(r =>
    Object.fromEntries(
      Object.entries(r).map(([k, v]) => [String(k).trim(), formatExcelValue(v)])
    )
  );
}

interface UploadZoneProps {
  title: string;
  description: string;
  onUpload: (rows: ParsedRow[], filename: string) => void;
  isPending: boolean;
  result: { success: boolean; rowsProcessed: number; rowsInserted: number; errors: string[] } | null;
  onClear: () => void;
  testId: string;
}

function UploadZone({ title, description, onUpload, isPending, result, onClear, testId }: UploadZoneProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ParsedRow[] | null>(null);
  const [filename, setFilename] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  const handleFile = (file: File) => {
    setFilename(file.name);
    setParseError(null);
    const isExcel = /\.(xlsx|xls)$/i.test(file.name);
    const reader = new FileReader();
    reader.onload = e => {
      try {
        if (isExcel) {
          const rows = parseExcel(e.target?.result as ArrayBuffer);
          setPreview(rows);
        } else {
          const rows = parseCSV(e.target?.result as string);
          setPreview(rows);
        }
      } catch (err) {
        setParseError(`Could not read file: ${String(err)}`);
      }
    };
    if (isExcel) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const submit = () => {
    if (preview && filename) onUpload(preview, filename);
  };

  const clear = () => {
    setPreview(null);
    setFilename("");
    setParseError(null);
    onClear();
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <Card className={`transition-colors ${dragOver ? "border-primary" : ""}`}>
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">{title}</CardTitle>
          {(preview || result) && (
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={clear} data-testid={`button-clear-${testId}`}>
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-4">
        {!preview && !result && (
          <>
            <div
              className="border-2 border-dashed border-border rounded-md p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              data-testid={`dropzone-${testId}`}
            >
              <UploadIcon className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">Drop a spreadsheet or CSV file here, or click to browse</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Accepted: .csv, .xlsx, .xls, .tsv</p>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.tsv,.txt,.xlsx,.xls"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                data-testid={`input-file-${testId}`}
              />
            </div>
            {parseError && (
              <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2">
                <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
                <p className="text-xs text-red-400">{parseError}</p>
              </div>
            )}
          </>
        )}

        {preview && !result && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">{filename}</span>
              <Badge variant="outline" className="text-xs">{preview.length} rows</Badge>
            </div>

            {/* Preview table */}
            {preview.length > 0 && (
              <div className="overflow-x-auto rounded-md border border-border max-h-48 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-card">
                    <tr className="border-b border-border">
                      {Object.keys(preview[0]).slice(0, 8).map(h => (
                        <th key={h} className="px-3 py-2 text-left text-muted-foreground font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(0, 10).map((row, i) => (
                      <tr key={i} className="border-b border-border/50 hover:bg-secondary/30">
                        {Object.values(row).slice(0, 8).map((val, j) => (
                          <td key={j} className="px-3 py-1.5 text-muted-foreground">{val}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.length > 10 && (
                  <p className="text-xs text-muted-foreground text-center py-2">... and {preview.length - 10} more rows</p>
                )}
              </div>
            )}

            <Button className="w-full gap-2" onClick={submit} disabled={isPending} data-testid={`button-submit-${testId}`}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadIcon className="h-4 w-4" />}
              Upload {preview.length} rows
            </Button>
          </div>
        )}

        {result && (
          <div className={`rounded-md p-4 space-y-2 border ${result.success ? "border-green-500/30 bg-green-500/5" : "border-amber-500/30 bg-amber-500/5"}`} data-testid={`result-${testId}`}>
            <div className="flex items-center gap-2">
              {result.success ? (
                <CheckCircle className="h-5 w-5 text-green-400" />
              ) : (
                <AlertCircle className="h-5 w-5 text-amber-400" />
              )}
              <span className="font-semibold text-sm">{result.success ? "Upload complete" : "Upload completed with errors"}</span>
            </div>
            <div className="text-sm text-muted-foreground flex gap-4">
              <span>{result.rowsProcessed} processed</span>
              <span className="text-green-400">{result.rowsInserted} inserted</span>
              {result.errors.length > 0 && <span className="text-red-400">{result.errors.length} errors</span>}
            </div>
            {result.errors.slice(0, 3).map((err, i) => (
              <p key={i} className="text-xs text-red-400">{err}</p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface FetchResult {
  success: boolean;
  date: string;
  racesInserted: number;
  racesSkipped: number;
  runnersInserted: number;
  nonRunnersMarked: number;
  nrNote: string | null;
  errors: string[];
  message: string;
}

function FetchCard() {
  const { toast } = useToast();
  const [username, setUsername] = useState(() => localStorage.getItem(LS_USERNAME) ?? "");
  const [password, setPassword] = useState(() => localStorage.getItem(LS_PASSWORD) ?? "");
  const [showPassword, setShowPassword] = useState(false);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<FetchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const saveCredentials = () => {
    localStorage.setItem(LS_USERNAME, username);
    localStorage.setItem(LS_PASSWORD, password);
  };

  const handleFetch = async () => {
    if (!username || !password) {
      toast({ title: "Enter your Racing API credentials first", variant: "destructive" });
      return;
    }
    saveCredentials();
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const res = await fetch("/api/fetch/today", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, date }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Fetch failed");
      } else {
        setResult(data as FetchResult);
        toast({ title: data.message });
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-primary" />
          Fetch Today's Card — The Racing API
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Auto-import racecards, runners &amp; non-runners. Free account at{" "}
          <a href="https://theracingapi.com" target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-2 hover:underline">
            theracingapi.com
          </a>{" "}
          (50 calls/day free).
        </p>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Username</Label>
            <Input
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Racing API username"
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Password</Label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Racing API password"
                className="h-8 text-sm pr-8"
              />
              <button
                type="button"
                onClick={() => setShowPassword(s => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Date</Label>
            <Input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
        </div>

        <Button
          className="w-full gap-2"
          onClick={handleFetch}
          disabled={loading}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {loading ? "Fetching…" : `Fetch ${date}`}
        </Button>

        {error && (
          <div className="rounded-md p-3 border border-red-500/30 bg-red-500/5 text-sm text-red-400">
            {error}
          </div>
        )}

        {result && (
          <div className={`rounded-md p-4 space-y-2 border ${result.success ? "border-green-500/30 bg-green-500/5" : "border-amber-500/30 bg-amber-500/5"}`}>
            <div className="flex items-center gap-2">
              {result.success
                ? <CheckCircle className="h-5 w-5 text-green-400" />
                : <AlertCircle className="h-5 w-5 text-amber-400" />}
              <span className="font-semibold text-sm">{result.message}</span>
            </div>
            <div className="text-xs text-muted-foreground flex flex-wrap gap-3">
              <span className="text-green-400">{result.racesInserted} new races</span>
              <span>{result.racesSkipped} already existed</span>
              <span className="text-green-400">{result.runnersInserted} runners</span>
              {result.nonRunnersMarked > 0 && <span className="text-green-400">{result.nonRunnersMarked} non-runners marked</span>}
            </div>
            {result.nrNote && (
              <p className="text-xs text-amber-400 flex items-start gap-1">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                {result.nrNote}
              </p>
            )}
            {result.errors.slice(0, 3).map((err, i) => (
              <p key={i} className="text-xs text-red-400">{err}</p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Parse ATR-style paste — handles two formats:
 *  A) Desktop tab-separated: "Newmarket\t17:25\t1.Angely Shani - Non Runner"
 *  B) Mobile grouped (venue on own line, then "14:5511 Divine Knight14 Empire Of Light")
 */
function parseNrPaste(raw: string): ParsedRow[] {
  const rows: ParsedRow[] = [];
  const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  let currentVenue = "";

  for (const line of lines) {
    // ── Format A: tab-separated ───────────────────────────────────────────
    if (line.includes("\t")) {
      const parts = line.split("\t").map(p => p.trim());
      if (parts.length >= 3) {
        const course = parts[0];
        const time   = parts[1];
        let horse    = parts.slice(2).join(" ").trim();
        horse = horse.replace(/^\d+\.\s*/, "").replace(/\s*[-–]\s*Non[\s-]?Runner\s*$/i, "").trim();
        if (course && time && horse) rows.push({ Course: course, "Race Time": time, Horse: horse });
      }
      continue;
    }

    // ── Format B: ATR mobile grouped ─────────────────────────────────────
    // Line starts with HH:MM — it's a time+horses line
    const timeMatch = line.match(/^(\d{1,2}:\d{2})(.*)/);
    if (timeMatch) {
      const time = timeMatch[1];
      const rest = timeMatch[2]; // e.g. "11 Divine Knight14 Empire Of Light"

      // Each horse entry is: cloth-number space horse-name
      // The next cloth number runs straight into the end of the previous name,
      // e.g. "11 Divine Knight14 Empire Of Light" → ["Divine Knight", "Empire Of Light"]
      // Lookahead stops each match where the next cloth number + capital-letter begins.
      const horseRe = /(\d+)\s+(.+?)(?=\d+\s+[A-Z'ÀÉ]|$)/g;
      let m: RegExpExecArray | null;
      let found = false;
      while ((m = horseRe.exec(rest)) !== null) {
        const horse = m[2].trim().replace(/\s*[-–]\s*Non[\s-]?Runner\s*$/i, "");
        if (horse && currentVenue) {
          rows.push({ Course: currentVenue, "Race Time": time, Horse: horse });
          found = true;
        }
      }
      // Fallback: single horse on line — strip leading cloth number
      if (!found && currentVenue) {
        const horse = rest.replace(/^\d+\s+/, "").trim().replace(/\s*[-–]\s*Non[\s-]?Runner\s*$/i, "");
        if (horse) rows.push({ Course: currentVenue, "Race Time": time, Horse: horse });
      }
      continue;
    }

    // ── Venue line: no time pattern, no tabs ──────────────────────────────
    // Accept venue names including hyphens, accents, spaces
    if (!timeMatch && line.length >= 2) {
      currentVenue = line;
    }
  }

  return rows;
}

function PasteNonRunnersCard() {
  const { toast } = useToast();
  const uploadRaces = useUploadRaces();
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<ParsedRow[] | null>(null);
  const [result, setResult] = useState<{ success: boolean; rowsProcessed: number; rowsInserted: number; errors: string[] } | null>(null);

  const handleParse = () => {
    const rows = parseNrPaste(text);
    if (rows.length === 0) {
      toast({ title: "No rows parsed — check the format", variant: "destructive" });
      return;
    }
    setPreview(rows);
    setResult(null);
  };

  const handleSubmit = () => {
    if (!preview) return;
    uploadRaces.mutate({ data: { filename: "paste-non-runners", data: preview } }, {
      onSuccess: data => {
        setResult(data);
        setPreview(null);
        setText("");
        toast({ title: `Non-runners: ${data.rowsInserted} marked` });
      },
      onError: () => toast({ title: "Upload failed", variant: "destructive" }),
    });
  };

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <ClipboardPaste className="h-4 w-4 text-primary" />
          Paste Non-Runners
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          On <a href="https://www.attheraces.com/nonrunners" target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-2 hover:underline">attheraces.com/nonrunners</a>, select all rows in the table and paste below.
          Format: <span className="font-mono">Course &nbsp; Time &nbsp; Horse</span> (tab or multi-space separated).
        </p>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        <Textarea
          value={text}
          onChange={e => { setText(e.target.value); setPreview(null); setResult(null); }}
          placeholder={"Newmarket\t17:25\t1.Angely Shani - Non Runner\nYork\t16:40\t19.Believeinromance N - Non Runner"}
          className="font-mono text-xs min-h-[120px] resize-y"
        />

        {!preview && (
          <Button variant="outline" className="w-full gap-2" onClick={handleParse} disabled={!text.trim()}>
            <ClipboardPaste className="h-4 w-4" />
            Parse {text.trim() ? `(${text.trim().split(/\r?\n/).filter(l => l.trim()).length} lines)` : ""}
          </Button>
        )}

        {preview && (
          <div className="space-y-2">
            <div className="rounded border border-border/50 divide-y divide-border/30 max-h-48 overflow-y-auto text-xs">
              {preview.map((r, i) => (
                <div key={i} className="flex gap-3 px-3 py-1.5 font-mono">
                  <span className="text-muted-foreground w-24 shrink-0">{r["Course"]}</span>
                  <span className="text-muted-foreground w-12 shrink-0">{r["Race Time"]}</span>
                  <span className="text-foreground">{r["Horse"]}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-1" onClick={() => setPreview(null)}>
                <X className="h-3.5 w-3.5" /> Edit
              </Button>
              <Button className="flex-1 gap-2" onClick={handleSubmit} disabled={uploadRaces.isPending}>
                {uploadRaces.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                Mark {preview.length} horses as non-runners
              </Button>
            </div>
          </div>
        )}

        {result && (
          <div className={`rounded-md p-3 border text-sm ${result.success ? "border-green-500/30 bg-green-500/5" : "border-amber-500/30 bg-amber-500/5"}`}>
            <div className="flex items-center gap-2">
              {result.success ? <CheckCircle className="h-4 w-4 text-green-400" /> : <AlertCircle className="h-4 w-4 text-amber-400" />}
              <span>{result.rowsInserted} non-runners marked ({result.rowsProcessed} processed)</span>
            </div>
            {result.errors.slice(0, 3).map((e, i) => <p key={i} className="text-xs text-red-400 mt-1">{e}</p>)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Upload() {
  const { toast } = useToast();
  const uploadRaces = useUploadRaces();
  const uploadResults = useUploadResults();
  const [racesResult, setRacesResult] = useState<{ success: boolean; rowsProcessed: number; rowsInserted: number; errors: string[] } | null>(null);
  const [resultsResult, setResultsResult] = useState<typeof racesResult>(null);

  const handleRacesUpload = (rows: ParsedRow[], filename: string) => {
    uploadRaces.mutate({ data: { filename, data: rows } }, {
      onSuccess: data => {
        setRacesResult(data);
        toast({ title: `Races uploaded: ${data.rowsInserted} inserted` });
      },
      onError: () => toast({ title: "Upload failed", variant: "destructive" }),
    });
  };

  const handleResultsUpload = (rows: ParsedRow[], filename: string) => {
    uploadResults.mutate({ data: { filename, data: rows } }, {
      onSuccess: data => {
        setResultsResult(data);
        toast({ title: `Results uploaded: ${data.rowsInserted} inserted` });
      },
      onError: () => toast({ title: "Upload failed", variant: "destructive" }),
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-2xl font-bold tracking-tight mb-1">Upload Centre</h1>
        <p className="text-muted-foreground text-sm">Ingest racecards and results via spreadsheet or CSV.</p>
      </div>

      <FetchCard />

      <PasteNonRunnersCard />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <UploadZone
          title="Races / Racecards"
          description="Upload a spreadsheet or CSV. Supports combined format (one runner per row) — racecards and runners are created automatically."
          onUpload={handleRacesUpload}
          isPending={uploadRaces.isPending}
          result={racesResult}
          onClear={() => setRacesResult(null)}
          testId="races"
        />
        <UploadZone
          title="Results / Runners"
          description="Upload a spreadsheet or CSV with columns: racecard_id, horse_name, jockey, trainer, draw, weight, age, form, odds"
          onUpload={handleResultsUpload}
          isPending={uploadResults.isPending}
          result={resultsResult}
          onClear={() => setResultsResult(null)}
          testId="results"
        />
      </div>

      <Card className="border-border/50">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-xs text-muted-foreground uppercase tracking-widest">Accepted Column Names</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-4">
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1">Combined format (one runner per row — races + runners created automatically):</p>
            <code className="text-xs text-primary bg-secondary/50 rounded px-2 py-1 block font-mono leading-relaxed">
              Racecourse (or Course) · Date · Time (or Race Time) · Horse Name (or Horse)<br />
              Jockey · Trainer · Distance · Going · Class · Draw · Age · Weight · Form · Prize_Win
            </code>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1">Non-runners format (no Date column — matched to existing racecards by Course + Time):</p>
            <code className="text-xs text-primary bg-secondary/50 rounded px-2 py-1 block font-mono leading-relaxed">
              Course · Race Time · Horse — horses are marked scratched automatically
            </code>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1">Simple races-only format:</p>
            <code className="text-xs text-primary bg-secondary/50 rounded px-2 py-1 block font-mono leading-relaxed">
              venue (or Racecourse) · race_date (or Date) · race_time (or Time)<br />
              race_name (or Race Type) · distance · going · class
            </code>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1">Results / runners format (requires racecard_id):</p>
            <code className="text-xs text-primary bg-secondary/50 rounded px-2 py-1 block font-mono leading-relaxed">
              racecard_id · horse_name (or Horse Name) · jockey · trainer · draw · weight
            </code>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
