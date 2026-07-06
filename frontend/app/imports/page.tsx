"use client";

import { useMemo, useState } from "react";
import { resolveApiUrl } from "@/components/api";

const SOURCE_TYPES = [
  "contacts", "google_contacts", "outlook_contacts", "mobile_contacts", "linkedin", "webinar_attendees", "story_viewers",
  "podcast_leads", "deal_list", "vendor_list", "buyer_leads", "seller_leads",
];

const CONTACT_EXPORT_MAPPING = {
  "Full Name": "person.full_name",
  "First Name": "person.first_name",
  "Last Name": "person.last_name",
  "Name": "person.full_name",
  "Email": "person.email",
  "Email Address": "person.email",
  "E-mail Address": "person.email",
  "E-mail 1 - Value": "person.email",
  "Phone": "person.phone",
  "Mobile Phone": "person.phone",
  "Phone 1 - Value": "person.phone",
  "Company": "organization.name",
  "Company Name": "organization.name",
  "Organization 1 - Name": "organization.name",
  "Title": "person.primary_role",
  "Job Title": "person.primary_role",
  "Organization 1 - Title": "person.primary_role",
  "Notes": "person.notes_summary",
  "Source": "person.source",
};

type ParsedVCardContact = {
  fullName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
  title: string;
  notes: string;
};

const csvEscape = (value: string) => `"${String(value || "").replace(/"/g, '""')}"`;

const unfoldVCardLines = (text: string) => {
  return text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "").split(/\r?\n/);
};

const cleanVCardValue = (value: string) => {
  return value
    .replace(/\\n/g, " ")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\s+/g, " ")
    .trim();
};

const vCardValue = (line: string) => {
  const index = line.indexOf(":");
  return index >= 0 ? cleanVCardValue(line.slice(index + 1)) : "";
};

const parseVCards = (text: string): ParsedVCardContact[] => {
  const lines = unfoldVCardLines(text);
  const cards: string[][] = [];
  let current: string[] = [];

  lines.forEach(line => {
    if (line.toUpperCase().startsWith("BEGIN:VCARD")) current = [];
    else if (line.toUpperCase().startsWith("END:VCARD")) {
      if (current.length) cards.push(current);
      current = [];
    } else if (current) current.push(line);
  });

  return cards.map(card => {
    const contact: ParsedVCardContact = {
      fullName: "",
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      company: "",
      title: "",
      notes: "",
    };

    card.forEach(line => {
      const key = line.split(/[;:]/)[0]?.toUpperCase();
      const value = vCardValue(line);
      if (!value) return;
      if (key === "FN") contact.fullName = contact.fullName || value;
      if (key === "N") {
        const [lastName = "", firstName = ""] = value.split(";");
        contact.firstName = contact.firstName || firstName;
        contact.lastName = contact.lastName || lastName;
      }
      if (key === "EMAIL") contact.email = contact.email || value;
      if (key === "TEL") contact.phone = contact.phone || value;
      if (key === "ORG") contact.company = contact.company || value.split(";")[0];
      if (key === "TITLE") contact.title = contact.title || value;
      if (key === "NOTE") contact.notes = contact.notes || value;
    });

    if (!contact.fullName) {
      contact.fullName = [contact.firstName, contact.lastName].filter(Boolean).join(" ");
    }
    return contact;
  }).filter(contact => contact.fullName || contact.email || contact.phone);
};

const contactsToCsvBlob = (contacts: ParsedVCardContact[], source: string) => {
  const headers = ["Full Name", "First Name", "Last Name", "Email", "Phone", "Company", "Title", "Notes", "Source"];
  const rows = contacts.map(contact => [
    contact.fullName,
    contact.firstName,
    contact.lastName,
    contact.email,
    contact.phone,
    contact.company,
    contact.title,
    contact.notes,
    source,
  ].map(csvEscape).join(","));
  return new Blob([[headers.join(","), ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
};

type MapResult = {
  suggested_table: string;
  suggested_column_mapping: Record<string, string>;
  confidence: number;
  warnings: string[];
  unmapped_fields: string[];
};

type UploadResult = {
  file_name: string;
  source_type: string;
  sheet_name: string | null;
  imported_sheet_names: string[];
  header_row_used: number | null;
  rows_processed: number;
  rows_skipped: number;
  contacts_created: number;
  contacts_updated: number;
  organizations_created: number;
  relationships_created: number;
  relationship_edges_created: number;
  suggested_column_mapping: Record<string, string>;
  unmapped_columns: string[];
  stored_extra_fields: string[];
  warnings: string[];
};

type AnalyzeSheet = {
  sheet_name: string;
  detected_header_row: number | null;
  row_count: number;
  raw_columns: string[];
  sample_rows: Record<string, unknown>[];
  suggested_column_mapping: Record<string, string>;
  confidence: number;
  unmapped_columns: string[];
  warnings: string[];
};

type AnalyzeResult = {
  file_name: string;
  source_type: string;
  sheets: AnalyzeSheet[];
  allowed_targets: string[];
  warnings: string[];
};

export default function ImportsPage() {
  const API_URL = useMemo(resolveApiUrl, []);
  const [sourceType, setSourceType] = useState("contacts");
  const [rawColumns, setRawColumns] = useState("");
  const [sampleData, setSampleData] = useState("");
  const [mapping, setMapping] = useState<MapResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [sheetName, setSheetName] = useState("");
  const [sheetNamesCsv, setSheetNamesCsv] = useState("");
  const [headerRow, setHeaderRow] = useState("");
  const [includeAllSheets, setIncludeAllSheets] = useState(true);
  const [uploadingWorkbook, setUploadingWorkbook] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [sheetUrl, setSheetUrl] = useState("");
  const [importingUrl, setImportingUrl] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalyzeResult | null>(null);
  const [showAnalysisModal, setShowAnalysisModal] = useState(false);
  const [selectedAnalyzeSheets, setSelectedAnalyzeSheets] = useState<string[]>([]);
  const [mappingOverrides, setMappingOverrides] = useState<Record<string, string>>({});
  const [importError, setImportError] = useState<string>("");
  const [contactExportFile, setContactExportFile] = useState<File | null>(null);
  const [importingContactExport, setImportingContactExport] = useState(false);
  const [vcardPreviewCount, setVcardPreviewCount] = useState<number | null>(null);

  // Engagement import
  const [engageRows, setEngageRows] = useState("");
  const [engageType, setEngageType] = useState("story_view");
  const [engagePlatform, setEngagePlatform] = useState("instagram");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<Record<string, unknown> | null>(null);

  const handleMapImport = async () => {
    const cols = rawColumns.split(",").map(s => s.trim()).filter(Boolean);
    if (!cols.length) return;
    setLoading(true);
    setMapping(null);
    try {
      let sample: Record<string, string>[] = [];
      if (sampleData.trim()) {
        const rows = sampleData.trim().split("\n");
        sample = rows.map(row => {
          const vals = row.split(",").map(s => s.trim());
          return Object.fromEntries(cols.map((c, i) => [c, vals[i] || ""]));
        });
      }
      const res = await fetch(`${API_URL}/imports/map`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_type: sourceType, raw_columns: cols, sample_rows: sample }),
      });
      if (res.ok) setMapping(await res.json());
    } finally {
      setLoading(false);
    }
  };

  const handleEngageImport = async () => {
    const rows = engageRows.split("\n").filter(Boolean).map(line => {
      const [name, email] = line.split(",").map(s => s.trim());
      return { name: name || null, email: email || null, event_type: engageType, source_platform: engagePlatform };
    });
    if (!rows.length) return;
    setImporting(true);
    setImportResult(null);
    try {
      const res = await fetch(`${API_URL}/engagement-events/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, auto_create_contacts: true }),
      });
      if (res.ok) setImportResult(await res.json());
    } finally {
      setImporting(false);
    }
  };

  const buildMappingOverrides = () => {
    return Object.fromEntries(Object.entries(mappingOverrides).filter(([, target]) => Boolean(target)));
  };

  const loadAnalysisIntoEditor = (result: AnalyzeResult) => {
    const defaultSheets = result.sheets.map(s => s.sheet_name);
    setSelectedAnalyzeSheets(defaultSheets);
    const merged: Record<string, string> = {};
    result.sheets.forEach(sheet => {
      Object.entries(sheet.suggested_column_mapping).forEach(([column, target]) => {
        if (!merged[column]) merged[column] = target;
      });
    });
    setMappingOverrides(merged);
    if (!headerRow && result.sheets[0]?.detected_header_row) {
      setHeaderRow(String(result.sheets[0].detected_header_row));
    }
  };

  const handleAnalyzeWorkbook = async () => {
    if (!uploadFile) return;
    setAnalyzing(true);
    setImportError("");
    try {
      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("source_type", sourceType);
      if (sheetName.trim()) formData.append("sheet_name", sheetName.trim());
      if (sheetNamesCsv.trim()) formData.append("sheet_names", sheetNamesCsv.trim());
      if (headerRow.trim()) formData.append("header_row", headerRow.trim());
      formData.append("include_all_sheets", String(includeAllSheets));

      const res = await fetch(`${API_URL}/imports/analyze/upload`, { method: "POST", body: formData });
      const body = await res.json();
      if (!res.ok) {
        setImportError(String(body?.detail || "Analyze failed"));
        return;
      }
      const result = body as AnalyzeResult;
      setAnalysis(result);
      loadAnalysisIntoEditor(result);
      setShowAnalysisModal(true);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleAnalyzeGoogleSheet = async () => {
    if (!sheetUrl.trim()) return;
    setAnalyzing(true);
    setImportError("");
    try {
      const res = await fetch(`${API_URL}/imports/analyze/url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_type: sourceType,
          sheet_url: sheetUrl.trim(),
          sheet_name: sheetName.trim() || null,
          sheet_names: sheetNamesCsv.split(",").map(s => s.trim()).filter(Boolean),
          header_row: headerRow.trim() ? Number(headerRow.trim()) : null,
          include_all_sheets: includeAllSheets,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setImportError(String(body?.detail || "Analyze failed"));
        return;
      }
      const result = body as AnalyzeResult;
      setAnalysis(result);
      loadAnalysisIntoEditor(result);
      setShowAnalysisModal(true);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleWorkbookUpload = async () => {
    if (!uploadFile) return;
    setUploadingWorkbook(true);
    setUploadResult(null);
    setImportError("");
    try {
      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("source_type", sourceType);
      if (sheetName.trim()) formData.append("sheet_name", sheetName.trim());
      const selectedCsv = selectedAnalyzeSheets.join(",");
      const selectedOrInputSheets = selectedCsv || sheetNamesCsv.trim();
      if (selectedOrInputSheets) formData.append("sheet_names", selectedOrInputSheets);
      if (headerRow.trim()) formData.append("header_row", headerRow.trim());
      formData.append("include_all_sheets", String(includeAllSheets));
      formData.append("mapping_override_json", JSON.stringify(buildMappingOverrides()));

      const res = await fetch(`${API_URL}/imports/upload`, {
        method: "POST",
        body: formData,
      });
      const body = await res.json();
      if (!res.ok) {
        setImportError(String(body?.detail || "Import failed"));
        return;
      }
      setUploadResult(body as UploadResult);
      setShowAnalysisModal(false);
    } finally {
      setUploadingWorkbook(false);
    }
  };

  const handleGoogleSheetImport = async () => {
    if (!sheetUrl.trim()) return;
    setImportingUrl(true);
    setUploadResult(null);
    setImportError("");
    try {
      const selectedOrInputSheets = selectedAnalyzeSheets.length
        ? selectedAnalyzeSheets
        : sheetNamesCsv.split(",").map(s => s.trim()).filter(Boolean);

      const res = await fetch(`${API_URL}/imports/url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_type: sourceType,
          sheet_url: sheetUrl.trim(),
          sheet_name: sheetName.trim() || null,
          sheet_names: selectedOrInputSheets,
          header_row: headerRow.trim() ? Number(headerRow.trim()) : null,
          include_all_sheets: includeAllSheets,
          mapping_override: buildMappingOverrides(),
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setImportError(String(body?.detail || "Import failed"));
        return;
      }
      setUploadResult(body as UploadResult);
      setShowAnalysisModal(false);
    } finally {
      setImportingUrl(false);
    }
  };

  const importContactExportFile = async (file: File, sourceLabel: string) => {
    setImportingContactExport(true);
    setUploadResult(null);
    setImportError("");
    try {
      const lowerName = file.name.toLowerCase();
      const formData = new FormData();

      if (lowerName.endsWith(".vcf") || lowerName.endsWith(".vcard")) {
        const contacts = parseVCards(await file.text());
        if (!contacts.length) {
          setImportError("No contacts were found in that vCard file.");
          return;
        }
        setVcardPreviewCount(contacts.length);
        formData.append("file", contactsToCsvBlob(contacts, sourceLabel), `${sourceLabel.toLowerCase().replace(/\s+/g, "-")}-contacts.csv`);
      } else {
        formData.append("file", file);
        setVcardPreviewCount(null);
      }

      formData.append("source_type", "contacts");
      formData.append("include_all_sheets", "false");
      formData.append("mapping_override_json", JSON.stringify(CONTACT_EXPORT_MAPPING));

      const res = await fetch(`${API_URL}/imports/upload`, { method: "POST", body: formData });
      const body = await res.json();
      if (!res.ok) {
        setImportError(String(body?.detail || "Contact import failed"));
        return;
      }
      setUploadResult(body as UploadResult);
    } finally {
      setImportingContactExport(false);
    }
  };

  // Active import mode
  const [importMode, setImportMode] = useState<"file" | "google_contacts" | "outlook_contacts" | "mobile_contacts" | "url" | "engagement" | "columns">("file");

  const isFileBusy = uploadingWorkbook || analyzing;
  const isUrlBusy = importingUrl || analyzing;

  const IMPORT_MODES = [
    { id: "file", label: "File Upload", desc: "Excel (.xlsx) or CSV" },
    { id: "google_contacts", label: "Google Contacts", desc: "Gmail contact export" },
    { id: "outlook_contacts", label: "Outlook Contacts", desc: "Microsoft 365 export" },
    { id: "mobile_contacts", label: "Mobile Contacts", desc: "iPhone / Android vCard" },
    { id: "url", label: "Google Sheets", desc: "Paste a public spreadsheet URL" },
    { id: "engagement", label: "Engagement Events", desc: "Story views, webinars, social" },
    { id: "columns", label: "Column Mapper", desc: "Paste headers, let AI map them" },
  ] as const;

  const canAnalyze = (importMode === "file" && !!uploadFile) || (importMode === "url" && !!sheetUrl.trim());
  const canImport = canAnalyze;

  const handleAnalyze = () => {
    if (importMode === "file") handleAnalyzeWorkbook();
    else if (importMode === "url") handleAnalyzeGoogleSheet();
  };

  const handleRunImport = () => {
    if (importMode === "file") handleWorkbookUpload();
    else if (importMode === "url") handleGoogleSheetImport();
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-text">Import Data</h2>
        <p className="text-sm text-muted mt-1">Choose a source, configure settings, then analyze or import directly.</p>
      </div>

      {/* Step 1 — Source Selector */}
      <div className="rounded-xl border border-soft bg-panel p-1 grid gap-1 sm:grid-cols-2 lg:grid-cols-4">
        {IMPORT_MODES.map(m => (
          <button
            key={m.id}
            onClick={() => {
              setImportMode(m.id);
              setUploadResult(null);
              setImportError("");
              setAnalysis(null);
              setShowAnalysisModal(false);
              setContactExportFile(null);
              setVcardPreviewCount(null);
            }}
            className={`flex-1 rounded-lg px-4 py-3 text-left transition ${importMode === m.id ? "bg-accent/20 border border-accent/40" : "hover:bg-base border border-transparent"}`}
          >
            <p className={`text-sm font-medium ${importMode === m.id ? "text-accent" : "text-text"}`}>{m.label}</p>
            <p className="text-xs text-muted mt-0.5 hidden sm:block">{m.desc}</p>
          </button>
        ))}
      </div>

      {/* Step 2 — Source Input + Settings */}
      <div className="rounded-xl border border-soft bg-panel p-6 space-y-5">

        {/* FILE */}
        {importMode === "file" && (
          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted uppercase tracking-wide block mb-1">Excel / CSV File</label>
              <input
                type="file"
                accept=".xlsx,.xlsm,.csv"
                onChange={e => { setUploadFile(e.target.files?.[0] ?? null); setUploadResult(null); setAnalysis(null); setShowAnalysisModal(false); }}
                className="w-full rounded-lg border border-soft bg-base px-3 py-2 text-sm text-text file:mr-3 file:border-0 file:bg-accent/15 file:px-3 file:py-1.5 file:text-accent"
              />
            </div>
          </div>
        )}

        {/* EMAIL + MOBILE CONTACT EXPORTS */}
        {(importMode === "google_contacts" || importMode === "outlook_contacts" || importMode === "mobile_contacts") && (
          <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-3">
              {[
                ["Google Contacts", "Export contacts.google.com as Google CSV or vCard.", importMode === "google_contacts"],
                ["Outlook Contacts", "Export People / Contacts as CSV from Microsoft 365.", importMode === "outlook_contacts"],
                ["Mobile Contacts", "Export iPhone or Android contacts as .vcf / vCard.", importMode === "mobile_contacts"],
              ].map(([title, copy, active]) => (
                <div key={String(title)} className={`rounded-lg border p-4 ${active ? "border-accent/40 bg-accent/5" : "border-soft bg-base"}`}>
                  <p className="font-semibold text-text">{String(title)}</p>
                  <p className="mt-1 text-xs text-muted">{String(copy)}</p>
                </div>
              ))}
            </div>

            <div>
              <label className="text-xs text-muted uppercase tracking-wide block mb-1">
                {importMode === "mobile_contacts" ? "vCard contact file" : "Exported contacts file"}
              </label>
              <input
                type="file"
                accept={importMode === "mobile_contacts" ? ".vcf,.vcard" : ".csv,.vcf,.vcard"}
                onChange={e => {
                  const file = e.target.files?.[0] ?? null;
                  setContactExportFile(file);
                  setUploadResult(null);
                  setImportError("");
                  setVcardPreviewCount(null);
                }}
                className="w-full rounded-lg border border-soft bg-base px-3 py-2 text-sm text-text file:mr-3 file:border-0 file:bg-accent/15 file:px-3 file:py-1.5 file:text-accent"
              />
              <p className="text-xs text-muted mt-2">
                {importMode === "google_contacts"
                  ? "Direct Google Contacts sync will live in Connections. For now, export Google CSV or vCard and upload it here."
                  : importMode === "outlook_contacts"
                    ? "Direct Microsoft Graph sync will live in Connections. For now, upload an Outlook People CSV export."
                    : "iPhone and Android contact exports usually download as .vcf files. RelateOS converts them to contacts before import."}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => contactExportFile && importContactExportFile(
                  contactExportFile,
                  importMode === "google_contacts" ? "Google Contacts" : importMode === "outlook_contacts" ? "Outlook Contacts" : "Mobile Contacts"
                )}
                disabled={!contactExportFile || importingContactExport}
                className="rounded-lg bg-accent/20 border border-accent/40 px-5 py-2 text-sm font-medium text-accent hover:bg-accent/30 transition disabled:opacity-50"
              >
                {importingContactExport ? "Importing..." : "Import Contacts"}
              </button>
              <a
                href="/connections"
                className="rounded-lg border border-soft px-5 py-2 text-sm font-medium text-text hover:bg-base transition"
              >
                Open Connections
              </a>
              {vcardPreviewCount !== null ? (
                <p className="text-xs text-muted">Parsed {vcardPreviewCount.toLocaleString()} vCard contact(s).</p>
              ) : null}
            </div>
          </div>
        )}

        {/* URL */}
        {importMode === "url" && (
          <div>
            <label className="text-xs text-muted uppercase tracking-wide block mb-1">Google Sheets URL</label>
            <input
              value={sheetUrl}
              onChange={e => { setSheetUrl(e.target.value); setUploadResult(null); setAnalysis(null); setShowAnalysisModal(false); }}
              placeholder="https://docs.google.com/spreadsheets/d/.../edit#gid=0"
              className="w-full rounded-lg border border-soft bg-base px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/60"
            />
            <p className="text-xs text-muted mt-1">Public sheets only. If the URL contains a <code className="font-mono">#gid=</code> that tab is auto-selected.</p>
          </div>
        )}

        {/* ENGAGEMENT */}
        {importMode === "engagement" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted uppercase tracking-wide block mb-1">Event Type</label>
                <select value={engageType} onChange={e => setEngageType(e.target.value)}
                  className="w-full rounded-lg border border-soft bg-base px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/60">
                  {["story_view", "post_like", "comment", "dm", "email_open", "email_reply", "webinar_attended", "podcast_clip_view", "form_submit", "call"].map(t => (
                    <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted uppercase tracking-wide block mb-1">Platform</label>
                <select value={engagePlatform} onChange={e => setEngagePlatform(e.target.value)}
                  className="w-full rounded-lg border border-soft bg-base px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/60">
                  {["instagram", "facebook", "linkedin", "youtube", "tiktok", "zoom", "email", "crm", "manual"].map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted uppercase tracking-wide block mb-1">Paste Rows — Name, Email (one per line)</label>
              <textarea value={engageRows} onChange={e => setEngageRows(e.target.value)}
                placeholder={"John Smith, john@email.com\nJane Doe, jane@email.com\n@username (no email known)"}
                className="w-full rounded-lg border border-soft bg-base px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/60 h-32 resize-none"
              />
            </div>
            <button onClick={handleEngageImport} disabled={importing || !engageRows.trim()}
              className="rounded-lg bg-accent/20 border border-accent/40 px-5 py-2 text-sm font-medium text-accent hover:bg-accent/30 transition disabled:opacity-50">
              {importing ? "Importing…" : "Import Engagement Events"}
            </button>
            {importResult && (
              <div className="rounded-lg border border-green-400/30 bg-green-400/5 p-4">
                <p className="text-sm text-green-400 font-medium">Import Complete</p>
                <p className="text-xs text-muted mt-1">
                  {String((importResult as Record<string, unknown>).events_created)} events created ·{" "}
                  {String((importResult as Record<string, unknown>).contacts_created)} new contacts created
                </p>
              </div>
            )}
          </div>
        )}

        {/* COLUMN MAPPER */}
        {importMode === "columns" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted uppercase tracking-wide block mb-1">Source Type</label>
                <select value={sourceType} onChange={e => setSourceType(e.target.value)}
                  className="w-full rounded-lg border border-soft bg-base px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/60">
                  {SOURCE_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted uppercase tracking-wide block mb-1">Column Headers (comma-separated)</label>
                <input value={rawColumns} onChange={e => setRawColumns(e.target.value)}
                  placeholder="Name, Email, Phone, Company, Watched Story"
                  className="w-full rounded-lg border border-soft bg-base px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/60"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted uppercase tracking-wide block mb-1">Sample Rows (optional, comma-separated values per line)</label>
              <textarea value={sampleData} onChange={e => setSampleData(e.target.value)}
                placeholder={"John Smith, john@email.com, 555-1234, TR3 Capital, Yes"}
                className="w-full rounded-lg border border-soft bg-base px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/60 h-20 resize-none"
              />
            </div>
            <button onClick={handleMapImport} disabled={loading || !rawColumns.trim()}
              className="rounded-lg bg-accent/20 border border-accent/40 px-5 py-2 text-sm font-medium text-accent hover:bg-accent/30 transition disabled:opacity-50">
              {loading ? "Analyzing…" : "Analyze & Map Columns"}
            </button>
            {mapping && (
              <div className="rounded-lg border border-soft bg-base p-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="text-sm font-semibold text-text">Suggested Table: <span className="text-accent font-mono">{mapping.suggested_table}</span></p>
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${mapping.confidence >= 0.8 ? "text-green-400 bg-green-400/10 border-green-400/30" : "text-yellow-400 bg-yellow-400/10 border-yellow-400/30"}`}>
                    {Math.round(mapping.confidence * 100)}% confidence
                  </span>
                </div>
                <div>
                  <p className="text-xs text-muted uppercase tracking-wide mb-2">Column Mapping</p>
                  <div className="grid sm:grid-cols-2 gap-1">
                    {Object.entries(mapping.suggested_column_mapping).map(([col, mapped]) => (
                      <div key={col} className="flex items-center gap-2 text-xs rounded-md border border-soft bg-panel px-3 py-2">
                        <span className="text-muted">{col}</span>
                        <span className="text-muted">→</span>
                        <span className="text-accent font-mono">{mapped}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {mapping.unmapped_fields.length > 0 && (
                  <p className="text-xs text-yellow-400">Unmapped: {mapping.unmapped_fields.join(", ")}</p>
                )}
                {mapping.warnings.map((w, i) => <p key={i} className="text-xs text-yellow-400">{w}</p>)}
              </div>
            )}
          </div>
        )}

        {/* Shared settings for file + url modes */}
        {(importMode === "file" || importMode === "url") && (
          <div className="border-t border-soft pt-5 space-y-4">
            <p className="text-xs text-muted uppercase tracking-wide">Import Settings</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="text-xs text-muted uppercase tracking-wide block mb-1">Data Type</label>
                <select value={sourceType} onChange={e => setSourceType(e.target.value)}
                  className="w-full rounded-lg border border-soft bg-base px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/60">
                  {SOURCE_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted uppercase tracking-wide block mb-1">Specific Sheet Tab</label>
                <input
                  value={sheetName}
                  onChange={e => setSheetName(e.target.value)}
                  placeholder="e.g. Sheet1 (blank = auto)"
                  className="w-full rounded-lg border border-soft bg-base px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/60"
                />
              </div>
              <div>
                <label className="text-xs text-muted uppercase tracking-wide block mb-1">Header Row Override</label>
                <input
                  type="number"
                  min={1}
                  value={headerRow}
                  onChange={e => setHeaderRow(e.target.value)}
                  placeholder="e.g. 4 (blank = auto)"
                  className="w-full rounded-lg border border-soft bg-base px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/60"
                />
              </div>
              <div>
                <label className="text-xs text-muted uppercase tracking-wide block mb-1">Multiple Tabs (csv)</label>
                <input
                  value={sheetNamesCsv}
                  onChange={e => setSheetNamesCsv(e.target.value)}
                  placeholder="Tab1, Tab2, Tab3"
                  className="w-full rounded-lg border border-soft bg-base px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/60"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeAllSheets}
                onChange={e => setIncludeAllSheets(e.target.checked)}
                className="rounded border border-soft bg-base"
              />
              Import all tabs when no specific tab is named
            </label>
          </div>
        )}

        {/* Action row */}
        {(importMode === "file" || importMode === "url") && (
          <div className="flex items-center gap-3 flex-wrap pt-1">
            <button
              onClick={handleAnalyze}
              disabled={!canAnalyze || isFileBusy || isUrlBusy}
              className="rounded-lg border border-soft px-5 py-2 text-sm font-medium text-text hover:bg-base transition disabled:opacity-50"
            >
              {analyzing ? "Analyzing…" : "Analyze First"}
            </button>
            <button
              onClick={handleRunImport}
              disabled={!canImport || isFileBusy || isUrlBusy}
              className="rounded-lg bg-accent/20 border border-accent/40 px-5 py-2 text-sm font-medium text-accent hover:bg-accent/30 transition disabled:opacity-50"
            >
              {(uploadingWorkbook || importingUrl) ? "Importing…" : "Run Import"}
            </button>
            <p className="text-xs text-muted">Analyze first to preview tabs, detected headers, and fix column mappings before committing.</p>
          </div>
        )}
      </div>

      {/* Error */}
      {importError && (
        <div className="rounded-lg border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-300">{importError}</div>
      )}

      {/* Step 3 — Analysis Panel (inline, shown after Analyze) */}
      {showAnalysisModal && analysis && (
        <div className="rounded-xl border border-accent/30 bg-panel p-6 space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-text">Analysis Preview</h3>
              <p className="text-xs text-muted mt-1">Review detected tabs, column mappings, and sample rows. Then run the import below.</p>
            </div>
            <button onClick={() => setShowAnalysisModal(false)} className="rounded-lg border border-soft px-3 py-1.5 text-xs text-muted hover:text-text transition">Dismiss</button>
          </div>

          {/* Tabs */}
          <div>
            <p className="text-xs text-muted uppercase tracking-wide mb-2">Detected Tabs</p>
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2">
              {analysis.sheets.map(sheet => (
                <label key={sheet.sheet_name} className={`rounded-lg border p-3 cursor-pointer transition ${selectedAnalyzeSheets.includes(sheet.sheet_name) ? "border-accent/40 bg-accent/5" : "border-soft bg-base"}`}>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedAnalyzeSheets.includes(sheet.sheet_name)}
                      onChange={e => {
                        if (e.target.checked) setSelectedAnalyzeSheets(prev => [...prev, sheet.sheet_name]);
                        else setSelectedAnalyzeSheets(prev => prev.filter(n => n !== sheet.sheet_name));
                      }}
                      className="rounded border-soft"
                    />
                    <span className="text-sm font-medium text-text truncate">{sheet.sheet_name}</span>
                  </div>
                  <p className="text-xs text-muted mt-1 ml-5">
                    {sheet.row_count.toLocaleString()} rows · header row {sheet.detected_header_row ?? "auto"} ·{" "}
                    <span className={sheet.confidence >= 0.8 ? "text-green-400" : "text-yellow-400"}>{Math.round(sheet.confidence * 100)}%</span>
                  </p>
                </label>
              ))}
            </div>
          </div>

          {/* Column Mappings */}
          <div>
            <p className="text-xs text-muted uppercase tracking-wide mb-2">Column Mappings <span className="normal-case">(override as needed)</span></p>
            <div className="rounded-lg border border-soft bg-base divide-y divide-soft max-h-64 overflow-y-auto">
              {Array.from(new Set(analysis.sheets.flatMap(s => s.raw_columns))).map(column => {
                const auto = analysis.sheets.flatMap(s => Object.entries(s.suggested_column_mapping)).find(([c]) => c === column)?.[1];
                return (
                  <div key={column} className="flex items-center gap-3 px-3 py-2">
                    <span className="text-xs text-muted w-40 shrink-0 truncate">{column}</span>
                    <span className="text-xs text-muted">→</span>
                    <select
                      value={mappingOverrides[column] ?? auto ?? ""}
                      onChange={e => setMappingOverrides(prev => ({ ...prev, [column]: e.target.value }))}
                      className="flex-1 rounded-md border border-soft bg-panel px-2 py-1 text-xs text-text focus:outline-none"
                    >
                      <option value="">(auto)</option>
                      {analysis.allowed_targets.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    {auto && !mappingOverrides[column] && (
                      <span className="text-xs text-accent/60 font-mono shrink-0">{auto}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Sample rows */}
          <div>
            <p className="text-xs text-muted uppercase tracking-wide mb-2">Sample Data</p>
            {analysis.sheets.slice(0, 2).map(sheet => (
              <div key={sheet.sheet_name} className="mb-3">
                <p className="text-xs font-medium text-text mb-1">{sheet.sheet_name}</p>
                <div className="overflow-auto rounded-lg border border-soft">
                  <table className="text-[11px] text-muted w-full">
                    <thead className="bg-base border-b border-soft">
                      <tr>
                        {sheet.raw_columns.slice(0, 8).map(col => <th key={col} className="px-3 py-1.5 text-left font-medium text-text truncate max-w-[120px]">{col}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {sheet.sample_rows.slice(0, 3).map((row, i) => (
                        <tr key={i} className="border-t border-soft">
                          {sheet.raw_columns.slice(0, 8).map(col => (
                            <td key={col} className="px-3 py-1.5 truncate max-w-[120px]">{String(row[col] ?? "")}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>

          {/* Commit */}
          <div className="flex items-center gap-3 pt-1 border-t border-soft">
            <button
              onClick={sheetUrl.trim() ? handleGoogleSheetImport : handleWorkbookUpload}
              disabled={uploadingWorkbook || importingUrl}
              className="rounded-lg bg-accent/20 border border-accent/40 px-5 py-2 text-sm font-medium text-accent hover:bg-accent/30 transition disabled:opacity-50"
            >
              {(uploadingWorkbook || importingUrl) ? "Importing…" : "Confirm & Run Import"}
            </button>
            <button onClick={() => setShowAnalysisModal(false)} className="text-xs text-muted hover:text-text transition">Cancel</button>
          </div>
        </div>
      )}

      {/* Step 4 — Results */}
      {uploadResult && (
        <div className="rounded-xl border border-green-400/30 bg-green-400/5 p-6 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm text-green-400 font-semibold">Import Complete</p>
              <p className="text-xs text-muted mt-1">
                {uploadResult.file_name}
                {uploadResult.sheet_name ? ` · Sheet: ${uploadResult.sheet_name}` : ""}
                {uploadResult.header_row_used ? ` · Header Row: ${uploadResult.header_row_used}` : ""}
                {uploadResult.imported_sheet_names?.length ? ` · Tabs: ${uploadResult.imported_sheet_names.join(", ")}` : ""}
              </p>
            </div>
            <p className="text-xs text-muted">{uploadResult.rows_processed.toLocaleString()} processed · {uploadResult.rows_skipped.toLocaleString()} skipped</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              ["Contacts Created", uploadResult.contacts_created],
              ["Contacts Updated", uploadResult.contacts_updated],
              ["Organizations", uploadResult.organizations_created],
              ["Relationships", uploadResult.relationships_created],
              ["Edges", uploadResult.relationship_edges_created],
            ].map(([label, value]) => (
              <div key={label as string} className="rounded-lg border border-green-400/20 bg-base p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted">{label as string}</p>
                <p className="text-lg font-semibold text-text mt-1">{Number(value).toLocaleString()}</p>
              </div>
            ))}
          </div>

          {uploadResult.stored_extra_fields.length > 0 && (
            <p className="text-xs text-muted"><span className="text-text">Extra fields preserved in metadata:</span> {uploadResult.stored_extra_fields.join(", ")}</p>
          )}
          {uploadResult.warnings.length > 0 && (
            <div className="space-y-1">{uploadResult.warnings.map((w, i) => <p key={i} className="text-xs text-yellow-300">{w}</p>)}</div>
          )}
        </div>
      )}
    </div>
  );
}
