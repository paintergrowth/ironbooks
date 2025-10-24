// src/components/reports/AdHocReportsPanel.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Calendar, Filter, Download, Play } from 'lucide-react';
import { supabase } from '@/lib/supabase';               // ⬅️ USE supabase client here
import { REPORT_PARAM_CONFIG, type ParamDef } from '@/config/qboReportParams';
import { ReportPreview } from './ReportPreview';

type PreviewTable = { headers: string[]; rows: any[][] };

type Props = {
  realmId: string | null;
  defaultReport?: keyof typeof REPORT_PARAM_CONFIG;
  onRun: (payload: { realmId: string; reportName: string; params: Record<string, any> }) => void;
  onDownload: (payload: { realmId: string; reportName: string; params: Record<string, any> }, format: 'csv'|'pdf') => void;

  previewData?: PreviewTable | null;

  logoUrl?: string;
  companyCurrencyCode?: string;
  locale?: string;

  lastUsedParams?: Record<string, any>;
  reportDisplayName?: string;
};

/* ------------------ helpers ------------------ */
const toISO = (dt: Date) => dt.toISOString().slice(0, 10);
const todayISO = () => toISO(new Date());

function lastMonthStartEnd() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { start: toISO(start), end: toISO(end) };
}

function ytdStart() {
  const now = new Date();
  return `${now.getFullYear()}-01-01`;
}

/** Pretty labels for report selector (value remains the internal key) */
const REPORT_LABELS: Record<string, string> = {
  ProfitAndLoss: 'Profit & Loss',
  BalanceSheet: 'Balance Sheet',
  TrialBalance: 'Trial Balance',
  CashFlow: 'Cash Flow',
  AgedReceivables: 'Aged Receivables',
  AgedPayables: 'Aged Payables',
  CustomerSales: 'Customer Sales',
  ItemSales: 'Item Sales',
  InventoryValuationSummary: 'Inventory Valuation Summary',
  GeneralLedger: 'General Ledger',
};
const prettyReportName = (k: string) =>
  REPORT_LABELS[k] || k.replace(/([a-z])([A-Z])/g, '$1 $2').trim();

export const AdHocReportsPanel: React.FC<Props> = ({
  realmId,
  defaultReport = 'ProfitAndLoss',
  onRun,
  onDownload,

  previewData = null,
  logoUrl = 'https://storage.googleapis.com/msgsndr/q5zr0f78ypFEU0IUcq40/media/68f6948ec1945b0db8bc9a06.png',
  companyCurrencyCode,
  locale = 'en-US',
  lastUsedParams,
  reportDisplayName,
}) => {
  const [reportName, setReportName] = useState<string>(String(defaultReport));
  const paramDefs: ParamDef[] = useMemo(() => REPORT_PARAM_CONFIG[reportName] ?? [], [reportName]);

  // smart defaults (last month range, as_of today)
  const lm = lastMonthStartEnd();
  const baseDefaults: Record<string, any> = {
    start_date: lm.start,
    end_date: lm.end,
    as_of_date: todayISO(),
    accounting_method: 'Accrual',
    date_mode: 'range',
    summarize_column_by: 'Month',
    columns: 'TotalOnly',
    days: '30',
  };

  const [values, setValues] = useState<Record<string, any>>(baseDefaults);
  useEffect(() => {
    setValues(baseDefaults);
  }, [reportName]);

  /* -------- async options for entity pickers (live from QBO via edge function) -------- */
  type Opt = { label: string; value: string };
  const [entityOptions, setEntityOptions] = useState<Record<string, Opt[]>>({});
  const [entityLoading, setEntityLoading] = useState<Record<string, boolean>>({});
  const [entityError, setEntityError] = useState<Record<string, string | null>>({});

  useEffect(() => {
    let cancelled = false;

    if (!realmId) {
      setEntityOptions({});
      setEntityLoading({});
      setEntityError({});
      return;
    }

    // Which picklists does this report need?
    const sources = Array.from(
      new Set(
        (paramDefs.map(p => p.source).filter(Boolean) as NonNullable<ParamDef['source']>[])
          .filter(s => ['customers','vendors','items','accounts','classes','departments'].includes(s))
      )
    );

    if (sources.length === 0) {
      setEntityOptions({});
      setEntityLoading({});
      setEntityError({});
      return;
    }

    // mark loading
    const flags: Record<string, boolean> = {};
    sources.forEach(s => { flags[s] = true; });
    setEntityLoading(flags);
    setEntityError({});
    setEntityOptions({});

    (async () => {
      try {
        // ✅ Use supabase.functions.invoke so base URL & auth are handled for you
        const { data, error } = await supabase.functions.invoke('qbo-picklists', {
          body: { realmId, sources },
          headers: {
            'x-ib-act-as-realm': String(realmId), // optional: for your logs/observability
          },
        });

        if (cancelled) return;

        if (error) {
          console.warn('[AdHocReportsPanel] picklists error', error);
          const errs: Record<string, string> = {};
          sources.forEach(s => { errs[s] = error.message || 'Invoke error'; });
          setEntityError(errs);
          setEntityLoading({});
          return;
        }

        // Expected payload shape from the edge function: { data: { accounts:[], classes:[], ... } }
        const dataBag = (data && (data as any).data) || {};
        const opts: Record<string, Opt[]> = {};
        sources.forEach((s: string) => {
          const arr = Array.isArray(dataBag[s]) ? dataBag[s] : [];
          opts[s] = arr as Opt[];
        });

        setEntityOptions(opts);
        setEntityLoading({});
        setEntityError({});
      } catch (e: any) {
        if (cancelled) return;
        console.warn('[AdHocReportsPanel] picklists invoke failed', e);
        const errs: Record<string, string> = {};
        sources.forEach(s => { errs[s] = e?.message || 'Network error'; });
        setEntityError(errs);
        setEntityLoading({});
      }
    })();

    return () => { cancelled = true; };
  }, [paramDefs, realmId]);

  const visibleDefs = paramDefs.filter(d => !d.showIf || d.showIf(values));
  const set = (id: string, val: any) => setValues(v => ({ ...v, [id]: val }));

  function renderField(def: ParamDef) {
    const v = values[def.id] ?? '';
    switch (def.type) {
      case 'date':
        return (
          <div key={def.id} className="space-y-1">
            <label className="text-sm text-gray-600 dark:text-gray-300">{def.label}</label>
            <Input type="date" value={v} onChange={e => set(def.id, e.target.value)} />
          </div>
        );
      case 'number':
        return (
          <div key={def.id} className="space-y-1">
            <label className="text-sm text-gray-600 dark:text-gray-300">{def.label}</label>
            <Input type="number" value={v} onChange={e => set(def.id, e.target.value)} />
          </div>
        );
      case 'select': {
        const src = def.source;
        const loading = src ? !!entityLoading[src] : false;
        const err = src ? entityError[src] : null;
        const opts = src ? (entityOptions[src] || []) : (def.options || []);

        return (
          <div key={def.id} className="space-y-1">
            <label className="text-sm text-gray-600 dark:text-gray-300">{def.label}</label>
            <Select value={String(v)} onValueChange={(val) => set(def.id, val)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {src ? (
                  loading ? (
                    <SelectItem disabled value="__loading">Loading…</SelectItem>
                  ) : err ? (
                    <SelectItem disabled value="__error">Couldn’t load ({err})</SelectItem>
                  ) : opts.length === 0 ? (
                    <SelectItem disabled value="__empty">No options found</SelectItem>
                  ) : (
                    opts.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))
                  )
                ) : (
                  (def.options || []).map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        );
      }
      case 'multiselect': {
        const src = def.source!;
        const opts = entityOptions[src] || [];
        const loading = !!entityLoading[src];
        const err = entityError[src];

        return (
          <div key={def.id} className="space-y-1">
            <label className="text-sm text-gray-600 dark:text-gray-300">{def.label}</label>
            <div className="border rounded-md p-2 max-h-48 overflow-auto">
              {loading && <div className="text-xs text-gray-500">Loading…</div>}
              {!loading && err && <div className="text-xs text-red-500">Couldn’t load: {err}</div>}
              {!loading && !err && opts.length === 0 && <div className="text-xs text-gray-500">No options found</div>}
              {opts.map(o => {
                const selected: string[] = values[def.id] || [];
                const isSel = selected.includes(o.value);
                return (
                  <button
                    type="button"
                    key={o.value}
                    className={`text-xs mr-2 mb-2 px-2 py-1 rounded border ${isSel ? 'bg-blue-600 text-white' : 'bg-gray-50 dark:bg-gray-800'}`}
                    onClick={() => {
                      const next = isSel ? selected.filter(x => x !== o.value) : [...selected, o.value];
                      set(def.id, next);
                    }}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>
        );
      }
      default:
        return null;
    }
  }

  const canRun = !!realmId && reportName in REPORT_PARAM_CONFIG;

  // values → query params (comma-join arrays)
  const normalizedParams = useMemo(() => {
    const out: Record<string, any> = {};
    for (const def of paramDefs) {
      if (def.showIf && !def.showIf(values)) continue;
      const val = values[def.id];
      if (val == null || val === '') continue;
      out[def.id] = Array.isArray(val) ? val.join(',') : val;
    }
    return out;
  }, [paramDefs, values]);

  // Pretty report label while keeping internal key
  const reportOptions = useMemo(
    () => Object.keys(REPORT_PARAM_CONFIG).map(k => ({ value: k, label: prettyReportName(k) })),
    []
  );

  // Preview meta: prefer lastUsedParams (exactly what was sent)
  const previewMeta = useMemo(() => ({
    logoUrl,
    reportName: reportDisplayName || prettyReportName(reportName),
    currency: companyCurrencyCode,
    locale,
    paramsUsed: lastUsedParams ?? normalizedParams,
  }), [logoUrl, reportDisplayName, reportName, companyCurrencyCode, locale, lastUsedParams, normalizedParams]);

  /* ------------------ preset handlers (fixed) ------------------ */
  const handlePresetLastMonth = () => {
    const lm = lastMonthStartEnd();
    setValues(v => ({
      ...v,
      date_mode: 'range',
      start_date: lm.start,
      end_date: lm.end,
      as_of_date: lm.end,
      date_macro: undefined,
    }));
  };

  const handlePresetTodayOnly = () => {
    const t = todayISO();
    setValues(v => ({
      ...v,
      date_mode: 'range',
      start_date: t,
      end_date: t,
      as_of_date: t,
      date_macro: undefined,
    }));
  };

  const handlePresetYTD = () => {
    const start = ytdStart();
    const t = todayISO();
    setValues(v => ({
      ...v,
      date_mode: 'range',
      start_date: start,
      end_date: t,
      as_of_date: t,
      date_macro: undefined,
    }));
  };

  return (
    <Card className="border-2 shadow-lg dark:border-gray-700">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-blue-600" />
            <CardTitle>Live Financial Reports</CardTitle>
          </div>
          <Badge variant="outline" className="flex gap-2">
            <Calendar className="w-3 h-3" />
            Defaults: Last Month / Accrual
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Report selector */}
        <div className="grid md:grid-cols-3 gap-4">
          <div className="space-y-1 md:grid-cols-1">
            <label className="text-sm text-gray-600 dark:text-gray-300">Report Type</label>
            <Select value={reportName} onValueChange={setReportName}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {reportOptions.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Presets */}
          <div className="space-y-1 md:col-span-2">
            <label className="text-sm text-gray-600 dark:text-gray-300">Quick Preset</label>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={handlePresetLastMonth}>Last Month</Button>
              <Button variant="outline" size="sm" onClick={handlePresetTodayOnly}>Today Only</Button>
              <Button variant="outline" size="sm" onClick={handlePresetYTD}>YTD</Button>
            </div>
          </div>
        </div>

        {/* Dynamic fields */}
        <div className="grid md:grid-cols-3 gap-4">
          {visibleDefs.map(renderField)}
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 pt-1">
          <Button
            className="flex-1 bg-blue-600 hover:bg-blue-700"
            disabled={!canRun}
            onClick={() => canRun && realmId && onRun({ realmId, reportName, params: normalizedParams })}
          >
            <Play className="mr-2 h-4 w-4" />
            Run (Preview)
          </Button>
          <Button
            className="flex-1"
            variant="outline"
            disabled={!canRun}
            onClick={() => canRun && realmId && onDownload({ realmId, reportName, params: normalizedParams }, 'csv')}
          >
            <Download className="mr-2 h-4 w-4" />
            Download CSV
          </Button>
          {/*
            <Button
              className="flex-1"
              variant="outline"
              disabled={!canRun}
              onClick={() => canRun && realmId && onDownload({ realmId, reportName, params: normalizedParams }, 'pdf')}
            >
              <Download className="mr-2 h-4 w-4" />
              Download PDF
            </Button>
          */}
        </div>

        {!realmId && (
          <div className="text-xs text-amber-600">
            No realm selected. Choose a company (or impersonate) to run a report.
          </div>
        )}

        {/* Branded Preview */}
        {previewData && (
          <ReportPreview
            title="Preview (normalized)"
            data={previewData}
            meta={previewMeta}
          />
        )}
      </CardContent>
    </Card>
  );
};
