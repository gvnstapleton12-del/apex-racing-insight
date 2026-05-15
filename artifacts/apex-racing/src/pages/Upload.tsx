import { useState, useRef } from "react";
import * as XLSX from "xlsx";
import {
  useUploadRaces,
  useUploadResults,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload as UploadIcon, FileText, CheckCircle, AlertCircle, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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

function parseExcel(buffer: ArrayBuffer): ParsedRow[] {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  return raw.map(r =>
    Object.fromEntries(
      Object.entries(r).map(([k, v]) => [String(k).trim(), String(v ?? "")])
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
              Racecourse · Date · Time · Horse Name · Jockey · Trainer<br />
              Distance · Going · Class · Draw · Age · Weight · Form · Prize_Win
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
