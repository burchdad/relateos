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

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
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
          <div>
            <label className="text-xs text-muted uppercase tracking-wide block mb-1">Sheet Names (optional)</label>
            <input
              value={sheetNamesCsv}
              onChange={e => setSheetNamesCsv(e.target.value)}
              placeholder="Value Add Resources, Funding - ACTIVE Deals"
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
          <button onClick={handleAnalyzeWorkbook} disabled={analyzing || !uploadFile}
            className="rounded-lg border border-soft px-4 py-2 text-sm font-medium text-text hover:bg-base transition disabled:opacity-50">
            {analyzing ? "Analyzing…" : "Analyze Workbook"}
          </button>
          <button onClick={handleWorkbookUpload} disabled={uploadingWorkbook || !uploadFile}
            className="rounded-lg bg-accent/20 border border-accent/40 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/30 transition disabled:opacity-50">
            {uploadingWorkbook ? "Importing Workbook…" : "Upload & Import Workbook"}
          </button>
          <p className="text-xs text-muted">Designed for larger files. Analyze first to review mappings and selected tabs before write.</p>
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
                  {uploadResult.imported_sheet_names?.length ? ` · Imported Tabs: ${uploadResult.imported_sheet_names.join(", ")}` : ""}
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

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
          <div>
            <label className="text-xs text-muted uppercase tracking-wide block mb-1">Sheet Names (optional)</label>
            <input
              value={sheetNamesCsv}
              onChange={e => setSheetNamesCsv(e.target.value)}
              placeholder="Comma-separated tab names"
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
          <button onClick={handleAnalyzeGoogleSheet} disabled={analyzing || !sheetUrl.trim()}
            className="rounded-lg border border-soft px-4 py-2 text-sm font-medium text-text hover:bg-base transition disabled:opacity-50">
            {analyzing ? "Analyzing…" : "Analyze Google Sheet"}
          </button>
          <button onClick={handleGoogleSheetImport} disabled={importingUrl || !sheetUrl.trim()}
            className="rounded-lg bg-accent/20 border border-accent/40 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/30 transition disabled:opacity-50">
            {importingUrl ? "Importing Google Sheet…" : "Import From Google Sheets URL"}
          </button>
          <p className="text-xs text-muted">Public sheets only for now. Private/authenticated Google Sheets will need Google API credentials in the next step.</p>
        </div>
      </div>

      {showAnalysisModal && analysis && (
        <div className="fixed inset-0 z-50 bg-black/60 p-4 md:p-8 overflow-y-auto">
          <div className="max-w-6xl mx-auto rounded-2xl border border-soft bg-panel p-6 space-y-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-text">Import Analysis Preview</h3>
                <p className="text-xs text-muted mt-1">Review tabs, mappings, and sample rows before import commit.</p>
              </div>
              <button onClick={() => setShowAnalysisModal(false)} className="rounded-lg border border-soft px-3 py-1.5 text-sm text-text">Close</button>
            </div>

            <div className="rounded-lg border border-soft bg-base p-4 space-y-3">
              <p className="text-xs text-muted uppercase tracking-wide">Detected Tabs</p>
              <div className="grid md:grid-cols-2 gap-3">
                {analysis.sheets.map(sheet => (
                  <label key={sheet.sheet_name} className="rounded-lg border border-soft p-3 text-sm space-y-1">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedAnalyzeSheets.includes(sheet.sheet_name)}
                        onChange={e => {
                          if (e.target.checked) {
                            setSelectedAnalyzeSheets(prev => [...prev, sheet.sheet_name]);
                          } else {
                            setSelectedAnalyzeSheets(prev => prev.filter(name => name !== sheet.sheet_name));
                          }
                        }}
                      />
                      <span className="font-medium text-text">{sheet.sheet_name}</span>
                    </div>
                    <p className="text-xs text-muted">{sheet.row_count.toLocaleString()} rows · header row {sheet.detected_header_row ?? "auto"} · {Math.round(sheet.confidence * 100)}% confidence</p>
                  </label>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-soft bg-base p-4 space-y-3">
              <p className="text-xs text-muted uppercase tracking-wide">Mapping Overrides</p>
              <div className="max-h-72 overflow-y-auto space-y-2">
                {Array.from(new Set(analysis.sheets.flatMap(sheet => sheet.raw_columns))).map(column => (
                  <div key={column} className="grid grid-cols-1 md:grid-cols-2 gap-2 items-center">
                    <span className="text-xs text-muted">{column}</span>
                    <select
                      value={mappingOverrides[column] ?? ""}
                      onChange={e => setMappingOverrides(prev => ({ ...prev, [column]: e.target.value }))}
                      className="rounded-md border border-soft bg-panel px-2 py-1.5 text-xs text-text"
                    >
                      <option value="">(auto/no override)</option>
                      {analysis.allowed_targets.map(target => (
                        <option key={target} value={target}>{target}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-soft bg-base p-4 space-y-2">
              <p className="text-xs text-muted uppercase tracking-wide">Sample Preview</p>
              {analysis.sheets.slice(0, 2).map(sheet => (
                <div key={sheet.sheet_name} className="space-y-1">
                  <p className="text-xs text-text font-medium">{sheet.sheet_name}</p>
                  <pre className="text-[11px] text-muted overflow-auto bg-panel border border-soft rounded-md p-2">{JSON.stringify(sheet.sample_rows.slice(0, 2), null, 2)}</pre>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-3">
              <button onClick={() => setShowAnalysisModal(false)} className="rounded-lg border border-soft px-4 py-2 text-sm text-text">Cancel</button>
              <button
                onClick={sheetUrl.trim() ? handleGoogleSheetImport : handleWorkbookUpload}
                className="rounded-lg bg-accent/20 border border-accent/40 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/30"
              >
                Run Import With Reviewed Settings
              </button>
            </div>
          </div>
        </div>
      )}

      {importError && (
        <div className="rounded-lg border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-300">{importError}</div>
      )}

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
