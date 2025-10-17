// src/components/reports/AdHocReportsPanel.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Calendar, Filter, Download, Play } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { REPORT_PARAM_CONFIG, type ParamDef } from '@/config/qboReportParams';

type Props = {
  realmId: string | null;
  defaultReport?: keyof typeof REPORT_PARAM_CONFIG;
  onRun: (payload: { realmId: string; reportName: string; params: Record<string, any> }) => void;
  onDownload: (payload: { realmId: string; reportName: string; params: Record<string, any> }, format: 'csv'|'pdf') => void;
};

// Simple helpers
const todayISO = () => new Date().toISOString().slice(0, 10);
const lastMonthRange = () => {
  const d = new Date();
  d.setDate(1); // first of this month
  d.setMonth(d.getMonth() - 1);
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const toISO = (dt: Date) => dt.toISOString().slice(0, 10);
  return { start: toISO(start), end: toISO(end) };
};

export const AdHocReportsPanel: React.FC<Props> = ({
  realmId,
  defaultReport = 'ProfitAndLoss',
  onRun,
  onDownload,
}) => {
  const [reportName, setReportName] = useState<string>(String(defaultReport));
  const paramDefs: ParamDef[] = useMemo(() => REPORT_PARAM_CONFIG[reportName] ?? [], [reportName]);

  // Form values (seed smart defaults)
  const lm = lastMonthRange();
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
    // Reset relevant defaults when report changes
    setValues(baseDefaults);
  }, [reportName]);

  // Async options for entity pickers
  type Opt = { label: string; value: string };
  const [entityOptions, setEntityOptions] = useState<Record<string, Opt[]>>({});

  useEffect(() => {
    let cancelled = false;
    async function load(source: ParamDef['source']) {
      if (!source || !realmId) return;

      // Map source -> query to your synced QBO tables (adjust table names/fields to yours)
      const cfg: Record<string, { table: string; label: string; value: string; realmCol?: string }> = {
        customers:   { table: 'qbo_customers',   label: 'display_name', value: 'id', realmCol: 'realm_id' },
        vendors:     { table: 'qbo_vendors',     label: 'display_name', value: 'id', realmCol: 'realm_id' },
        items:       { table: 'qbo_items',       label: 'name',         value: 'id', realmCol: 'realm_id' },
        accounts:    { table: 'qbo_accounts',    label: 'name',         value: 'id', realmCol: 'realm_id' },
        classes:     { table: 'qbo_classes',     label: 'name',         value: 'id', realmCol: 'realm_id' },
        departments: { table: 'qbo_departments', label: 'name',         value: 'id', realmCol: 'realm_id' },
      };

      const meta = cfg[source];
      if (!meta) return;

      const q = supabase.from(meta.table).select(`${meta.value}, ${meta.label}`).eq(meta.realmCol || 'realm_id', realmId).limit(500);
      const { data, error } = await q;
      if (error || !data) return;

      const opts: Opt[] = (data as any[]).map(r => ({ value: String(r[meta.value]), label: String(r[meta.label]) }));
      if (!cancelled) {
        setEntityOptions(prev => ({ ...prev, [source]: opts }));
      }
    }

    // gather unique sources used by current report
    const sources = Array.from(new Set(paramDefs.map(p => p.source).filter(Boolean))) as NonNullable<ParamDef['source']>[];
    sources.forEach(load);

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
            <Input
              type="date"
              value={v}
              onChange={e => set(def.id, e.target.value)}
            />
          </div>
        );
      case 'number':
        return (
          <div key={def.id} className="space-y-1">
            <label className="text-sm text-gray-600 dark:text-gray-300">{def.label}</label>
            <Input
              type="number"
              value={v}
              onChange={e => set(def.id, e.target.value)}
            />
          </div>
        );
      case 'select':
        return (
          <div key={def.id} className="space-y-1">
            <label className="text-sm text-gray-600 dark:text-gray-300">{def.label}</label>
            <Select value={String(v)} onValueChange={(val) => set(def.id, val)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(def.options || []).map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      case 'multiselect': {
        const src = def.source!;
        const opts = entityOptions[src] || [];
        return (
          <div key={def.id} className="space-y-1">
            <label className="text-sm text-gray-600 dark:text-gray-300">{def.label}</label>
            {/* simple tag-style multiselect using a list; swap for your preferred component */}
            <div className="border rounded-md p-2 max-h-48 overflow-auto">
              {opts.length === 0 && <div className="text-xs text-gray-500">Loading…</div>}
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

  // Transform values → query params (comma-join arrays)
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
      <CardContent className="space-y-4">
        {/* Report selector */}
        <div className="grid md:grid-cols-3 gap-4">
          <div className="space-y-1 md:col-span-1">
            <label className="text-sm text-gray-600 dark:text-gray-300">Report Type</label>
            <Select value={reportName} onValueChange={setReportName}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.keys(REPORT_PARAM_CONFIG).map(k => (
                  <SelectItem key={k} value={k}>{k}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Quick presets (optional) */}
          <div className="space-y-1">
            <label className="text-sm text-gray-600 dark:text-gray-300">Quick Preset</label>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setValues(v => ({ ...v, ...baseDefaults }))}>Last Month</Button>
              <Button variant="outline" size="sm" onClick={() => setValues(v => ({ ...v, start_date: todayISO(), end_date: todayISO() }))}>Today Only</Button>
              <Button variant="outline" size="sm" onClick={() => {
                const year = new Date().getFullYear();
                setValues(v => ({ ...v, start_date: `${year}-01-01`, end_date: todayISO() }));
              }}>YTD</Button>
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
            Run (Preview JSON/Table)
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
          <Button
            className="flex-1"
            variant="outline"
            disabled={!canRun}
            onClick={() => canRun && realmId && onDownload({ realmId, reportName, params: normalizedParams }, 'pdf')}
          >
            <Download className="mr-2 h-4 w-4" />
            Download PDF
          </Button>
        </div>

        {!realmId && (
          <div className="text-xs text-amber-600">
            No realm selected. Choose a company (or impersonate) to run a report.
          </div>
        )}
      </CardContent>
    </Card>
  );
};
