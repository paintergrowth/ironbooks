// src/components/reports/InteractiveReportGrid.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef } from 'ag-grid-community';

import '@ag-grid-community/styles/ag-grid.css';
import '@ag-grid-community/styles/ag-theme-quartz.css';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';

type InteractiveReportGridProps = {
  title?: string;
  headers: string[];
  rows: any[][];
};

type SectionRow = {
  _id: number;
  __isSectionHeader?: boolean;
  __sectionId?: string | null;
  __collapsed?: boolean;
  [key: string]: any;
};

export const InteractiveReportGrid: React.FC<InteractiveReportGridProps> = ({
  title = 'Interactive Report Explorer',
  headers,
  rows,
}) => {
  const gridRef = useRef<AgGridReact<any>>(null);

  const [quickFilter, setQuickFilter] = useState('');
  const [pageSize, setPageSize] = useState(25);
  const [isDark, setIsDark] = useState(false);

  // which sections are collapsed? key = sectionId
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  // Detect dark mode from <html class="dark">
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const root = document.documentElement;
    const updateTheme = () => setIsDark(root.classList.contains('dark'));
    updateTheme();

    const observer = new MutationObserver(updateTheme);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });

    return () => observer.disconnect();
  }, []);

  const themeClass = isDark ? 'ag-theme-quartz-dark' : 'ag-theme-quartz';

  // Helpers
  const isEmptyish = (val: unknown): boolean => {
    if (val === null || val === undefined) return true;
    const s = String(val).trim();
    return s === '' || s === '-' || s === '—';
  };

  const looksNumeric = (val: unknown): boolean => {
    if (val === null || val === undefined) return false;
    const s = String(val)
      .replace(/[\$,]/g, '')
      .replace(/[%\(\)]/g, '')
      .trim();
    if (s === '') return false;
    return !Number.isNaN(Number(s));
  };

  // 🔹 Build row objects + detect "section headers"
  const sectionedRows: SectionRow[] = useMemo(() => {
    if (!headers || headers.length === 0) return [];

    const firstKey = headers[0];

    const base: SectionRow[] = rows.map((row, idx) => {
      const obj: SectionRow = { _id: idx };
      headers.forEach((h, i) => {
        obj[h] = row[i];
      });
      return obj;
    });

    let currentSectionId: string | null = null;
    let headerCount = 0;

    for (let i = 0; i < base.length; i++) {
      const row = base[i];
      const firstVal = row[firstKey];
      const label = firstVal !== null && firstVal !== undefined ? String(firstVal).trim() : '';

      let isHeader = false;

      if (label !== '') {
        // Rule 1: first column has label AND no numeric cells in the rest of the row
        const othersHaveNumeric = headers.slice(1).some((key) => looksNumeric(row[key]));
        if (!othersHaveNumeric) {
          isHeader = true;
        }

        // Rule 2: labels containing "Total" are always treated as headers
        if (/total/i.test(label)) {
          isHeader = true;
        }
      }

      row.__isSectionHeader = isHeader;

      if (isHeader) {
        headerCount++;
        currentSectionId = `sec-${i}-${label || 'section'}`;
      }

      row.__sectionId = currentSectionId;
    }

    // Header-only debug: draw a little note in the UI instead of console
    // (we can't rely on console.log in production builds)
    if (headerCount === 0) {
      // No headers detected – sections will behave like a flat grid.
      // That's OK; user still sees the data.
    }

    return base;
  }, [headers, rows]);

  // 🔹 Apply collapsedSections → visible rows
  const visibleRowData: SectionRow[] = useMemo(() => {
    return sectionedRows
      .filter((row) => {
        if (row.__isSectionHeader) return true; // headers always visible
        if (!row.__sectionId) return true;      // not in any section
        const collapsed = collapsedSections[row.__sectionId];
        return !collapsed;
      })
      .map((row) => {
        if (!row.__isSectionHeader || !row.__sectionId) return row;
        return {
          ...row,
          __collapsed: !!collapsedSections[row.__sectionId],
        };
      });
  }, [sectionedRows, collapsedSections]);

  const columnDefs: ColDef[] = useMemo(() => {
    return headers.map((h, idx) => {
      const headerName =
        h
          .replace(/_/g, ' ')
          .replace(/([a-z])([A-Z])/g, '$1 $2')
          .replace(/\s+/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase()) || h;

const col: ColDef = {
  field: h,
  headerName,
  // 👇 NO sorting at column level
  sortable: false,
  filter: true,
  floatingFilter: true,
  resizable: true,
};


      if (idx === 0) {
        // First column: show ▾ / ▸ for headers + indent children
        col.valueFormatter = (params) => {
          const data = params.data as SectionRow | undefined;
          const raw = params.value ?? '';
          const label = String(raw).trim();

          if (!data?.__isSectionHeader) {
            // child row or normal row
            return label;
          }

          const collapsed = !!data.__collapsed;
          const icon = collapsed ? '▸ ' : '▾ ';
          return icon + label;
        };

        col.cellStyle = (params) => {
          const data = params.data as SectionRow | undefined;

          // Child rows: indent if part of a section
          if (!data?.__isSectionHeader && data?.__sectionId) {
            return {
              paddingLeft: '24px',
            };
          }

          // Header row: pointer cursor (rest of styling done via getRowStyle)
          if (data?.__isSectionHeader) {
            return {
              cursor: 'pointer',
            };
          }

          return null;
        };
      }

      return col;
    });
  }, [headers]);

  const handleExportCsv = () => {
    if (!gridRef.current?.api) return;
    gridRef.current.api.exportDataAsCsv({
      fileName: `${title.replace(/\s+/g, '_').toLowerCase()}.csv`,
    });
  };

  const handlePageSizeChange = (value: string) => {
    const n = parseInt(value, 10);
    if (!Number.isNaN(n)) {
      setPageSize(n);
      if (gridRef.current?.api) {
        gridRef.current.api.paginationSetPageSize(n);
      }
    }
  };

  // 🔹 click on header row toggles collapse
  const handleRowClicked = (event: any) => {
    const data = event.data as SectionRow | undefined;
    if (!data?.__isSectionHeader || !data.__sectionId) return;

    setCollapsedSections((prev) => ({
      ...prev,
      [data.__sectionId]: !prev[data.__sectionId],
    }));
  };

  // 🔹 style whole header row (bold + shaded)
  const getRowStyle = (params: any) => {
    const data = params.data as SectionRow | undefined;
    if (!data?.__isSectionHeader) return null;

    return {
      fontWeight: 600,
      backgroundColor: isDark
        ? 'rgba(148, 163, 184, 0.25)' // dark mode
        : 'rgba(148, 163, 184, 0.12)', // light mode
      cursor: 'pointer',
    };
  };

  if (!headers || headers.length === 0 || !rows || rows.length === 0) {
    return (
      <Card className="border-2 shadow-lg dark:border-gray-700 mt-6">
        <CardContent className="py-8 text-center text-sm text-gray-600 dark:text-gray-400">
          No tabular data available for interactive grid.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-2 shadow-lg dark:border-gray-700 mt-8">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <CardTitle className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">
            {title}
          </CardTitle>
          <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">
            Click bold section rows (▾ / ▸) to expand or collapse their details. Drag columns, filter, sort, and export.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <Input
            placeholder="Search in all columns…"
            value={quickFilter}
            onChange={(e) => setQuickFilter(e.target.value)}
            className="w-full sm:w-56"
          />

          <select
            value={pageSize}
            onChange={(e) => handlePageSizeChange(e.target.value)}
            className="border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm rounded-md px-2 py-1"
          >
            <option value={25}>Top 25</option>
            <option value={50}>Top 50</option>
            <option value={100}>Top 100</option>
          </select>

          <Button
            variant="outline"
            size="sm"
            className="flex items-center gap-1"
            onClick={handleExportCsv}
          >
            <Download className="h-4 w-4" />
            CSV
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        <div className={`${themeClass} w-full`} style={{ minHeight: 400 }}>
          <div
            className="w-full"
            style={{
              height: 400,
              maxWidth: '100%',
              overflow: 'hidden',
            }}
          >
            <AgGridReact
              ref={gridRef}
              rowData={visibleRowData}
              columnDefs={columnDefs}
              pagination={true}
              paginationPageSize={pageSize}
              paginationPageSizeSelector={[25, 50, 100]}  // ✅ no more warning
              animateRows={true}
              suppressMenuHide={false}
              enableCellTextSelection={true}
                defaultColDef={{
    sortable: false, // 👈 turn off globally
    filter: true,
    resizable: true,
  }}

              quickFilterText={quickFilter}
              getRowStyle={getRowStyle}
              onRowClicked={handleRowClicked}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
