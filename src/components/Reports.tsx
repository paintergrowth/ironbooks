// src/components/Reports.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText, Download, Play, Calendar, Filter, X } from 'lucide-react';
import { useEffectiveIdentity } from '@/lib/impersonation';
import { AdHocReportsPanel } from '@/components/reports/AdHocReportsPanel';
import { runAdHocReport, downloadBlob } from '@/lib/qboReports';
import { ReportPreview } from '@/components/reports/ReportPreview';
import { InteractiveReportGrid } from '@/components/reports/InteractiveReportGrid';

interface ReportsProps {
  initialFilter?: string;
  initialTimeframe?: string;
}

type ReportRow = {
  id: string;              // "YYYY-MM"
  year: number;
  month: number;
  monthLabel: string;      // "July 2024"
  pdfSignedUrl: string;
  videoUrl: string | null;
  generatedAtISO: string;
  status: 'completed' | 'processing';
  revenue: string | null;  // formatted currency or null
  expenses: string | null; // formatted currency or null
  profit: string | null;   // formatted currency or null
};

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

const Reports: React.FC<ReportsProps> = ({ initialFilter, initialTimeframe }) => {
  const [activeFilter, setActiveFilter] = useState(initialFilter || 'all');
  const [timeframe, setTimeframe] = useState(initialTimeframe || 'thisMonth');

  // 🔑 effective identity (works for both: normal & impersonating)
  const { realmId: effRealmId } = useEffectiveIdentity();

  // data
  const [loading, setLoading] = useState<boolean>(true);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // video modal
  const [showPlayer, setShowPlayer] = useState(false);
  const [playerUrl, setPlayerUrl] = useState<string | null>(null);

  useEffect(() => {
    if (initialFilter) setActiveFilter(initialFilter);
    if (initialTimeframe) setTimeframe(initialTimeframe);
  }, [initialFilter, initialTimeframe]);

  // helper
  const ymKey = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`;
  const monthLabel = (y: number, m: number) =>
    new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });

  // ⬇️ MAIN LOAD (refires when impersonated realm changes)
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setErrorMsg(null);

      try {
        // 0) resolve realm (effective)
        let realmId = effRealmId;

        // Fallback for older flows: if no effRealmId yet, try profile of auth user.
        if (!realmId) {
          const { data: auth } = await supabase.auth.getUser();
          const uid = auth.user?.id;
          if (!uid) {
            if (!cancelled) {
              setReports([]);
              setErrorMsg('Not signed in.');
            }
            return;
          }
          const { data: prof } = await supabase
            .from('profiles')
            .select('qbo_realm_id')
            .eq('id', uid)
            .maybeSingle();
          realmId = prof?.qbo_realm_id ?? null;
        }

        if (!realmId) {
          if (!cancelled) {
            setReports([]);
            setLoading(false);
          }
          return;
        }

        // 1) artifacts with pdf uploaded (only these months appear)
        const { data: arts, error: artErr } = await supabase
          .from('qbo_financial_artifacts')
          .select('year,month,pdf_path,video_url,uploaded_at')
          .eq('realm_id', realmId)
          .not('pdf_path', 'is', null)
          .order('year', { ascending: false })
          .order('month', { ascending: false });

        if (artErr) throw artErr;

        const artifacts = (arts || []);
        if (artifacts.length === 0) {
          if (!cancelled) {
            setReports([]);
            setLoading(false);
          }
          return;
        }

        // 2) signed URLs for each pdf
        const signPromises = artifacts.map(async (r) => {
          const path = r.pdf_path as string;
          const { data: s } = await supabase
            .storage
            .from('financial-reports')
            .createSignedUrl(path, 3600);
          return { key: ymKey(r.year, r.month), signedUrl: s?.signedUrl || '' };
        });
        const signed = await Promise.all(signPromises);
        const signedMap = signed.reduce<Record<string, string>>((acc, x) => {
          acc[x.key] = x.signedUrl;
          return acc;
        }, {});

        // 3) P&L numbers from view (fetch per-year and map by Y-M)
        const years = Array.from(new Set(artifacts.map((a) => a.year)));
        const { data: pnlRows, error: pnlErr } = await supabase
          .from('qbo_pnl_monthly_from_postings')
          .select('year,month,revenues,expenses,net_income')
          .eq('realm_id', realmId)
          .in('year', years);

        if (pnlErr) throw pnlErr;

        const pnlMap = (pnlRows || []).reduce<Record<string, { rev: number; exp: number; net: number }>>(
          (acc, r: any) => {
            const k = ymKey(r.year, r.month);
            acc[k] = {
              rev: Number(r.revenues) || 0,
              exp: Number(r.expenses) || 0,
              net: Number(r.net_income) || 0,
            };
            return acc;
          },
          {}
        );

        // 4) compose reports list (only months with pdf_path)
        const merged: ReportRow[] = artifacts.map((a: any) => {
          const k = ymKey(a.year, a.month);
          const pnl = pnlMap[k];
          const dISO =
            (a.uploaded_at as string) ||
            new Date(a.year, a.month - 1, 1).toISOString();

          return {
            id: k,
            year: a.year,
            month: a.month,
            monthLabel: monthLabel(a.year, a.month),
            pdfSignedUrl: signedMap[k] || '',
            videoUrl: a.video_url || null,
            generatedAtISO: dISO,
            status: 'completed',
            revenue: pnl ? currency.format(pnl.rev) : null,
            expenses: pnl ? currency.format(pnl.exp) : null,
            profit: pnl ? currency.format(pnl.net) : null,
          };
        });

        if (!cancelled) setReports(merged);
      } catch (e: any) {
        if (!cancelled) setErrorMsg(e?.message || 'Failed to load reports.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [effRealmId]);

  const getFilterLabel = (filter: string) => {
    switch (filter) {
      case 'revenue': return 'Revenue Reports';
      case 'expenses': return 'Expense Reports';
      case 'profit-loss': return 'Profit & Loss Reports';
      default: return 'All Reports';
    }
  };

  const getTimeframeLabel = (tf: string) => {
    switch (tf) {
      case 'thisMonth': return 'This Month';
      case 'lastMonth': return 'Last Month';
      case 'ytd': return 'Year to Date';
      default: return 'This Month';
    }
  };

  // ---------- Ad-hoc preview state ----------
  const [adhocPreview, setAdhocPreview] = useState<{ headers: string[]; rows: any[][] } | null>(null);
  const [lastUsedParams, setLastUsedParams] = useState<Record<string, any> | null>(null);
  const [lastReportName, setLastReportName] = useState<string>('ProfitAndLoss');
  const [adhocLoading, setAdhocLoading] = useState(false);
  const [adhocError, setAdhocError] = useState<string | null>(null);

  // NEW: meta from the edge function (company name, currency, params actually used, run timestamp, etc.)
  const [adhocMeta, setAdhocMeta] = useState<{
    companyName?: string;
    currency?: string;
    realmId?: string;
    reportName?: string;
    paramsUsed?: Record<string, any>;
    runAt?: string;
    locale?: string;
  } | null>(null);

  // OPTIONAL: prettier label (turns "ProfitAndLoss" → "Profit And Loss")
  const prettyReport = (k: string) => k.replace(/([A-Z])/g, ' $1').trim();

  return (
    <div className="space-y-8 p-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">Reports</h1>
          <p className="text-gray-600 dark:text-gray-400">Access your financial reports and video reviews</p>
          {initialFilter && (
            <div className="mt-3">
              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                <Filter className="w-3 h-3 mr-1" />
                Filtered by: {getFilterLabel(initialFilter)} ({getTimeframeLabel(initialTimeframe || 'thisMonth')})
              </Badge>
            </div>
          )}
        </div>
        <div className="flex items-center space-x-4">
          {/*
          <Select value={activeFilter} onValueChange={setActiveFilter}>
            <SelectTrigger className="w-48">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Reports</SelectItem>
              <SelectItem value="revenue">Revenue Reports</SelectItem>
              <SelectItem value="expenses">Expense Reports</SelectItem>
              <SelectItem value="profit-loss">Profit &amp; Loss Reports</SelectItem>
            </SelectContent>
          </Select>
          <Select value={timeframe} onValueChange={setTimeframe}>
            <SelectTrigger className="w-40">
              <Calendar className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="thisMonth">This Month</SelectItem>
              <SelectItem value="lastMonth">Last Month</SelectItem>
              <SelectItem value="ytd">YTD</SelectItem>
            </SelectContent>
          </Select>
         */}
        </div>
      </div>

      {/* ⬇️ Ad-hoc QBO Reports panel (unchanged API) */}
      <AdHocReportsPanel
        realmId={effRealmId}
        defaultReport="ProfitAndLoss"
        onRun={async ({ realmId, reportName, params }) => {
          try {
            setAdhocError(null);
            setAdhocLoading(true);

            const res = await runAdHocReport({ realmId, reportName, params, format: 'json' });

            // Keep UI aligned with what the edge function actually used/returned
            setLastReportName(res?.meta?.reportName ?? reportName);
            setLastUsedParams(res?.meta?.paramsUsed ?? params);

            setAdhocPreview(res?.normalized ?? null);
            setAdhocMeta(res?.meta ?? null); // capture companyName, currency, runAt, etc.
          } catch (e: any) {
            setAdhocError(e?.message || 'Failed to run report');
            setAdhocPreview(null);
            setAdhocMeta(null);
          } finally {
            setAdhocLoading(false);
          }
        }}
        onDownload={async ({ realmId, reportName, params }, fmt) => {
          try {
            // keep last-used context aligned with downloads (optional)
            setLastReportName(reportName);
            setLastUsedParams(params);

            const blob = await runAdHocReport({ realmId, reportName, params, format: fmt });
            downloadBlob(blob, `${reportName}.${fmt === 'csv' ? 'csv' : 'pdf'}`);
          } catch (e: any) {
            alert(e?.message || 'Download failed');
          }
        }}
      />

      {/* Live preview + errors */}
      {adhocLoading && <div className="text-sm text-gray-600">Running finance report…</div>}
      {adhocError && <div className="text-sm text-red-600">{adhocError}</div>}
        {/* 
      {adhocPreview && (
        <ReportPreview
          title={prettyReport(adhocMeta?.reportName || lastReportName)}
          data={adhocPreview}
          meta={{
            logoUrl: 'https://storage.googleapis.com/msgsndr/q5zr0f78ypFEU0IUcq40/media/68f6948ec1945b0db8bc9a06.png',
            reportName: prettyReport(adhocMeta?.reportName || lastReportName),
            companyName: adhocMeta?.companyName,
            currency: adhocMeta?.currency,   // e.g., "USD" from QBO
            locale: adhocMeta?.locale ?? 'en-US',
            paramsUsed: adhocMeta?.paramsUsed ?? lastUsedParams ?? undefined,
            runAt: adhocMeta?.runAt,
          }}
        />
      )}
*/}
      
            {/* NEW: Interactive grid for ANY QBO report (from adhocPreview) */}
      {adhocPreview && adhocPreview.headers?.length > 0 && adhocPreview.rows?.length > 0 && (
        <div className="mt-6">
          <InteractiveReportGrid
            title={prettyReport(adhocMeta?.reportName || lastReportName)}
            headers={adhocPreview.headers}
            rows={adhocPreview.rows}
          />
        </div>
      )}

      {/* Errors / Loading for monthly artifacts */}
      {errorMsg && <div className="text-sm text-red-600">{errorMsg}</div>}
      {loading && <div className="text-sm text-gray-600">Loading…</div>}

      <div className="grid gap-6">
        {!loading && reports.map((report) => (
          <Card key={report.id} className="border-2 shadow-lg hover:shadow-xl transition-shadow duration-200 dark:border-gray-700">
            <CardHeader className="pb-4">
              <div className="flex justify-between items-start">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-full">
                    <FileText className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <CardTitle className="text-xl font-bold text-gray-900 dark:text-white">
                      {report.monthLabel} Financial Report
                    </CardTitle>
                    <div className="flex items-center space-x-2 mt-1">
                      <Calendar className="h-4 w-4 text-gray-500" />
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        Generated on {new Date(report.generatedAtISO).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
                <Badge
                  variant={report.status === 'completed' ? 'default' : 'secondary'}
                  className={report.status === 'completed' ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400' : ''}
                >
                  {report.status === 'completed' ? 'Completed' : 'Processing'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className={`text-center p-3 rounded-lg ${
                  activeFilter === 'revenue' || activeFilter === 'all'
                    ? 'bg-green-50 dark:bg-green-900/10 ring-2 ring-green-200'
                    : 'bg-green-50 dark:bg-green-900/10'
                }`}>
                  <div className="text-sm font-medium text-green-700 dark:text-green-400">Revenue</div>
                  <div className="text-lg font-bold text-green-900 dark:text-green-300">
                    {report.revenue ?? '—'}
                  </div>
                </div>
                <div className={`text-center p-3 rounded-lg ${
                  activeFilter === 'expenses' || activeFilter === 'all'
                    ? 'bg-red-50 dark:bg-red-900/10 ring-2 ring-red-200'
                    : 'bg-red-50 dark:bg-red-900/10'
                }`}>
                  <div className="text-sm font-medium text-red-700 dark:text-red-400">Expenses</div>
                  <div className="text-lg font-bold text-red-900 dark:text-red-300">
                    {report.expenses ?? '—'}
                  </div>
                </div>
                <div className={`text-center p-3 rounded-lg ${
                  activeFilter === 'profit-loss' || activeFilter === 'all'
                    ? 'bg-blue-50 dark:bg-blue-900/10 ring-2 ring-blue-200'
                    : 'bg-blue-50 dark:bg-blue-900/10'
                }`}>
                  <div className="text-sm font-medium text-blue-700 dark:text-blue-400">Net Profit</div>
                  <div className="text-lg font-bold text-blue-900 dark:text-blue-300">
                    {report.profit ?? '—'}
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  variant="default"
                  size="sm"
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                  disabled={!report.pdfSignedUrl}
                  onClick={() => {
                    if (report.pdfSignedUrl) window.open(report.pdfSignedUrl, '_blank', 'noopener,noreferrer');
                  }}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download PDF
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 border-2"
                  disabled={!report.videoUrl}
                  onClick={() => {
                    if (report.videoUrl) {
                      setPlayerUrl(report.videoUrl);
                      setShowPlayer(true);
                    }
                  }}
                >
                  <Play className="mr-2 h-4 w-4" />
                  Watch Review
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {!loading && reports.length === 0 && (
        <Card className="border-2 shadow-lg dark:border-gray-700">
          <CardContent className="text-center py-12">
            <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-full w-20 h-20 mx-auto mb-4 flex items-center justify-center">
              <FileText className="h-10 w-10 text-gray-400" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">No reports available</h3>
            <p className="text-gray-600 dark:text-gray-400">Your monthly reports will appear here once generated.</p>
          </CardContent>
        </Card>
      )}
      {/* NEW: Interactive grid for ANY QBO report (from adhocPreview) */}
      {/*
      {adhocPreview && adhocPreview.headers?.length > 0 && adhocPreview.rows?.length > 0 && (
        <InteractiveReportGrid
          title={prettyReport(adhocMeta?.reportName || lastReportName)}
          headers={adhocPreview.headers}
          rows={adhocPreview.rows}
        />
      )}
      
      */}
      
      {/* Simple modal for video playback (no external deps) */}
      {showPlayer && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/70"
            onClick={() => { setShowPlayer(false); setPlayerUrl(null); }}
          />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="relative w-full max-w-3xl bg-white dark:bg-gray-900 rounded-xl shadow-2xl overflow-hidden">
              <button
                className="absolute right-3 top-3 rounded-md p-1 hover:bg-gray-100 dark:hover:bg-gray-800"
                onClick={() => { setShowPlayer(false); setPlayerUrl(null); }}
                aria-label="Close"
              >
                <X className="h-5 w-5 text-gray-600 dark:text-gray-300" />
              </button>
              <div className="w-full aspect-video bg-black">
                {playerUrl ? (
                  <iframe
                    src={playerUrl}
                    title="Report Review"
                    className="w-full h-full"
                    allow="autoplay; encrypted-media; picture-in-picture"
                    allowFullScreen
                  />
                ) : null}
              </div>
              {playerUrl && (
                <div className="p-3 text-right">
                  <a
                    href={playerUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-blue-600 hover:text-blue-700 underline"
                  >
                    Open in new tab
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Reports;
