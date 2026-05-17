import { useState, useRef } from "react";
import * as XLSX from "xlsx";
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
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  return raw.map((r: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(r).map(([k, v]) => [String(k).trim(), formatExcelValue(v)])
    )
  );
}

export {};
