"use client";

import { useMemo, useState } from "react";
import { resolveApiUrl } from "@/components/api";

const SOURCE_TYPES = [
  "contacts", "linkedin", "webinar_attendees", "story_viewers",
  "podcast_leads", "deal_list", "vendor_list", "buyer_leads", "seller_leads",
];

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

export default function ImportsPage() {
  const API_URL = useMemo(resolveApiUrl, []);
  const [sourceType, setSourceType] = useState("contacts");
  const [rawColumns, setRawColumns] = useState("");
  const [sampleData, setSampleData] = useState("");
  const [mapping, setMapping] = useState<MapResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [sheetName, setSheetName] = useState("");
  const [headerRow, setHeaderRow] = useState("");
  const [includeAllSheets, setIncludeAllSheets] = useState(true);
  const [uploadingWorkbook, setUploadingWorkbook] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [sheetUrl, setSheetUrl] = useState("");
  const [importingUrl, setImportingUrl] = useState(false);

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

  const handleWorkbookUpload = async () => {
    if (!uploadFile) return;
    setUploadingWorkbook(true);
    setUploadResult(null);
    try {
      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("source_type", sourceType);
      if (sheetName.trim()) formData.append("sheet_name", sheetName.trim());
      if (headerRow.trim()) formData.append("header_row", headerRow.trim());
      formData.append("include_all_sheets", String(includeAllSheets));

      const res = await fetch(`${API_URL}/imports/upload`, {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        setUploadResult(await res.json());
      }
    } finally {
      setUploadingWorkbook(false);
    }
  };

  const handleGoogleSheetImport = async () => {
    if (!sheetUrl.trim()) return;
    setImportingUrl(true);
    setUploadResult(null);
    try {
      const res = await fetch(`${API_URL}/imports/url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_type: sourceType,
          sheet_url: sheetUrl.trim(),
          sheet_name: sheetName.trim() || null,
          header_row: headerRow.trim() ? Number(headerRow.trim()) : null,
          include_all_sheets: includeAllSheets,
        }),
      });
      if (res.ok) {
        setUploadResult(await res.json());
      }
    } finally {
      setImportingUrl(false);
    }
  };

  return (
    <div className="p-6 space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-text">Import Intelligence</h2>
        <p className="text-sm text-muted mt-1">AI-assisted column mapping plus large Excel import for contacts, organizations, and relationship links.</p>
      </div>

      <div className="rounded-xl border border-accent/30 bg-panel p-6 space-y-4">
        <div>
          <h3 className="font-semibold text-text">Workbook Import</h3>
          <p className="text-sm text-muted mt-1">Upload a .xlsx, .xlsm, or .csv file. The importer maps contact fields, creates organizations, links relationship rows, and preserves unmapped columns in metadata so no spreadsheet data is lost.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="text-xs text-muted uppercase tracking-wide block mb-1">Source Type</label>
            <select value={sourceType} onChange={e => setSourceType(e.target.value)}
              className="w-full rounded-lg border border-soft bg-base px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/60">
              {SOURCE_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted uppercase tracking-wide block mb-1">Excel / CSV File</label>
            <input
              type="file"
              accept=".xlsx,.xlsm,.csv"
              onChange={e => setUploadFile(e.target.files?.[0] ?? null)}
              className="w-full rounded-lg border border-soft bg-base px-3 py-2 text-sm text-text file:mr-3 file:border-0 file:bg-accent/15 file:px-3 file:py-1.5 file:text-accent"
            />
          </div>
          <div>
            <label className="text-xs text-muted uppercase tracking-wide block mb-1">Sheet Name (optional)</label>
            <input
              value={sheetName}
              onChange={e => setSheetName(e.target.value)}
              placeholder="Leave blank for first sheet"
              className="w-full rounded-lg border border-soft bg-base px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/60"
            />
          </div>
          <div>
            <label className="text-xs text-muted uppercase tracking-wide block mb-1">Header Row (optional)</label>
            <input
              type="number"
              min={1}
              value={headerRow}
              onChange={e => setHeaderRow(e.target.value)}
              placeholder="e.g. 4"
              className="w-full rounded-lg border border-soft bg-base px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/60"
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={includeAllSheets}
            onChange={e => setIncludeAllSheets(e.target.checked)}
            className="rounded border border-soft bg-base"
          />
          Import all sheets when Sheet Name is blank
        </label>

        <div className="flex items-center gap-3">
          <button onClick={handleWorkbookUpload} disabled={uploadingWorkbook || !uploadFile}
            className="rounded-lg bg-accent/20 border border-accent/40 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/30 transition disabled:opacity-50">
            {uploadingWorkbook ? "Importing Workbook…" : "Upload & Import Workbook"}
          </button>
          <p className="text-xs text-muted">Designed for larger files. Imports run in batches and dedupe by email/phone before creating contacts.</p>
        </div>

        {uploadResult && (
          <div className="rounded-lg border border-green-400/30 bg-green-400/5 p-4 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-sm text-green-400 font-medium">Workbook Import Complete</p>
                <p className="text-xs text-muted mt-1">
                  {uploadResult.file_name}
                  {uploadResult.sheet_name ? ` · Sheet: ${uploadResult.sheet_name}` : ""}
                  {uploadResult.header_row_used ? ` · Header Row: ${uploadResult.header_row_used}` : ""}
                </p>
              </div>
              <div className="text-xs text-muted">{uploadResult.rows_processed.toLocaleString()} processed · {uploadResult.rows_skipped.toLocaleString()} skipped</div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
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

            <div>
              <p className="text-xs text-muted uppercase tracking-wide mb-2">Detected Mapping</p>
              <div className="grid md:grid-cols-2 gap-2">
                {Object.entries(uploadResult.suggested_column_mapping).map(([column, target]) => (
                  <div key={column} className="flex items-center gap-2 text-xs rounded-lg border border-soft bg-base px-3 py-2">
                    <span className="text-muted">{column}</span>
                    <span className="text-muted">→</span>
                    <span className="text-accent font-mono">{target}</span>
                  </div>
                ))}
              </div>
            </div>

            {uploadResult.stored_extra_fields.length > 0 && (
              <div>
                <p className="text-xs text-muted uppercase tracking-wide mb-1">Extra Fields Preserved In Metadata</p>
                <p className="text-xs text-muted">{uploadResult.stored_extra_fields.join(", ")}</p>
              </div>
            )}

            {uploadResult.warnings.length > 0 && (
              <div className="space-y-1">
                {uploadResult.warnings.map((warning, index) => (
                  <p key={index} className="text-xs text-yellow-300">{warning}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-soft bg-panel p-6 space-y-4">
        <div>
          <h3 className="font-semibold text-text">Google Sheets Import</h3>
          <p className="text-sm text-muted mt-1">Paste a public Google Sheets URL and import it directly. If the URL includes a specific `gid`, that tab will be imported automatically. If not, you can optionally name the sheet tab below.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-xs text-muted uppercase tracking-wide block mb-1">Google Sheets URL</label>
            <input
              value={sheetUrl}
              onChange={e => setSheetUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/.../edit#gid=0"
              className="w-full rounded-lg border border-soft bg-base px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/60"
            />
          </div>
          <div>
            <label className="text-xs text-muted uppercase tracking-wide block mb-1">Sheet Name (optional)</label>
            <input
              value={sheetName}
              onChange={e => setSheetName(e.target.value)}
              placeholder="Optional override when importing whole workbook"
              className="w-full rounded-lg border border-soft bg-base px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/60"
            />
          </div>
          <div>
            <label className="text-xs text-muted uppercase tracking-wide block mb-1">Header Row (optional)</label>
            <input
              type="number"
              min={1}
              value={headerRow}
              onChange={e => setHeaderRow(e.target.value)}
              placeholder="e.g. 4"
              className="w-full rounded-lg border border-soft bg-base px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/60"
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={includeAllSheets}
            onChange={e => setIncludeAllSheets(e.target.checked)}
            className="rounded border border-soft bg-base"
          />
          Import all sheets when Sheet Name is blank
        </label>

        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={handleGoogleSheetImport} disabled={importingUrl || !sheetUrl.trim()}
            className="rounded-lg bg-accent/20 border border-accent/40 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/30 transition disabled:opacity-50">
            {importingUrl ? "Importing Google Sheet…" : "Import From Google Sheets URL"}
          </button>
          <p className="text-xs text-muted">Public sheets only for now. Private/authenticated Google Sheets will need Google API credentials in the next step.</p>
        </div>
      </div>

      {/* AI Import Mapper */}
      <div className="rounded-xl border border-soft bg-panel p-6 space-y-4">
        <h3 className="font-semibold text-text">AI Import Mapper</h3>
        <p className="text-sm text-muted">Paste your column headers and sample data. The AI will suggest which table and columns to map them to.</p>

        <div className="grid grid-cols-2 gap-4">
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
          <label className="text-xs text-muted uppercase tracking-wide block mb-1">Sample Rows (optional, comma-separated values)</label>
          <textarea value={sampleData} onChange={e => setSampleData(e.target.value)}
            placeholder={"John Smith, john@email.com, 555-1234, TR3 Capital, Yes"}
            className="w-full rounded-lg border border-soft bg-base px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/60 h-20 resize-none"
          />
        </div>

        <button onClick={handleMapImport} disabled={loading || !rawColumns.trim()}
          className="rounded-lg bg-accent/20 border border-accent/40 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/30 transition disabled:opacity-50">
          {loading ? "Analyzing…" : "Analyze & Map"}
        </button>

        {mapping && (
          <div className="rounded-lg border border-soft bg-base p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-text">Suggested Table: <span className="text-accent font-mono">{mapping.suggested_table}</span></p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full border ${mapping.confidence >= 0.8 ? "text-green-400 bg-green-400/10 border-green-400/30" : "text-yellow-400 bg-yellow-400/10 border-yellow-400/30"}`}>
                {Math.round(mapping.confidence * 100)}% confidence
              </span>
            </div>
            <div>
              <p className="text-xs text-muted uppercase tracking-wide mb-2">Column Mapping</p>
              <div className="grid grid-cols-2 gap-1">
                {Object.entries(mapping.suggested_column_mapping).map(([col, mapped]) => (
                  <div key={col} className="flex items-center gap-2 text-sm">
                    <span className="text-muted">{col}</span>
                    <span className="text-muted">→</span>
                    <span className="text-accent font-mono text-xs">{mapped}</span>
                  </div>
                ))}
              </div>
            </div>
            {mapping.unmapped_fields.length > 0 && (
              <div>
                <p className="text-xs text-yellow-400 font-medium mb-1">Unmapped Fields</p>
                <p className="text-xs text-muted">{mapping.unmapped_fields.join(", ")}</p>
              </div>
            )}
            {mapping.warnings.map((w, i) => (
              <p key={i} className="text-xs text-yellow-400">{w}</p>
            ))}
          </div>
        )}
      </div>

      {/* Engagement Import */}
      <div className="rounded-xl border border-soft bg-panel p-6 space-y-4">
        <h3 className="font-semibold text-text">Engagement Event Import</h3>
        <p className="text-sm text-muted">Paste story viewers, webinar attendees, or social interactions. Known contacts will be matched; new ones auto-created.</p>

        <div className="grid grid-cols-2 gap-4">
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
          <label className="text-xs text-muted uppercase tracking-wide block mb-1">Paste Rows: Name, Email (one per line)</label>
          <textarea value={engageRows} onChange={e => setEngageRows(e.target.value)}
            placeholder={"John Smith, john@email.com\nJane Doe, jane@email.com\n@username (no email known)"}
            className="w-full rounded-lg border border-soft bg-base px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/60 h-28 resize-none"
          />
        </div>

        <button onClick={handleEngageImport} disabled={importing || !engageRows.trim()}
          className="rounded-lg bg-accent/20 border border-accent/40 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/30 transition disabled:opacity-50">
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
    </div>
  );
}
