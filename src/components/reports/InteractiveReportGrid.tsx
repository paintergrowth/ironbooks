import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef, RowClassRules } from 'ag-grid-community';

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

  // 🔹 which sections are collapsed? key = sectionId
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  // Detect dark mode based on <html class="dark">
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const root = document.documentElement;
    const updateTheme = () => setIsDark(root.classList.contains('dark'));

    updateTheme();

    const observer = new MutationObserver(updateTheme);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });

    return () => observer.disconnect();
  }, []);

  // Use Quartz theme (new default in AG Grid)
  const themeClass = isDark ? 'ag-theme-quartz-dark' : 'ag-theme-quartz';

  // 🔹 Build base row objects + detect "section header" rows
  const sectionedRows: SectionRow[] = useMemo(() => {
    if (!headers || headers.length === 0) return [];

    const firstKey = headers[0];
    let currentSectionId: string | null = null;

    return rows.map((row, idx) => {
      const obj: SectionRow = { _id: idx };
      headers.forEach((h, i) => {
        obj[h] = row[i];
      });

      const firstVal = obj[firstKey];
      let isHeader = false;

      if (firstVal !== null && firstVal !== undefined && String(firstVal).trim() !== '') {
        const othersEmpty = headers.slice(1).every((key) => {
          const v = obj[key];
          if (v === null || v === undefined) return true;
          if (typeof v === 'string' && v.trim() === '') return true;
          return false;
        });

        if (othersEmpty) {
          isHeader = true;
        }
      }

      if (isHeader) {
        // Unique section id
        currentSectionId = `sec-${idx}-${String(firstVal)}`;
      }

      obj.__isSectionHeader = isHeader;
      obj.__sectionId = currentSectionId;

      return obj;
    });
  }, [headers, rows]);

  // 🔹 Apply collapsedSections → decide which rows are visible
  const visibleRowData: SectionRow[] = useMemo(() => {
    return sectionedRows
      .filter((row) => {
        if (row.__isSectionHeader) return true; // headers always visible
        if (!row.__sectionId) return true;      // rows outside any section
        const collapsed = collapsedSections[row.__sectionId];
        return !collapsed;                      // hide if its section is collapsed
      })
      .map((row) => {
        if (!row.__isSectionHeader || !row.__sectionId) return row;
        // annotate header row with collapsed flag (for icon)
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
        sortable: true,
        filter: true,
        floatingFilter: true,
        resizable: true,
      };

      // First column: show ▾ / ▸ for section headers
      if (idx === 0) {
        col.valueFormatter = (params) => {
          const v = params.value ?? '';
          const data = params.data as SectionRow | undefined;
          if (!data?.__isSectionHeader) return v;
          const collapsed = !!data.__collapsed;
          const icon = collapsed ? '▸ ' : '▾ ';
          return icon + v;
        };
      }

      return col;
    });
  }, [headers]);

  // 🔹 styles for section rows (bold, shaded, pointer cursor)
  const rowClassRules: RowClassRules = useMemo(
    () => ({
      'ib-section-row': (params) => {
        return !!(params.data && (params.data as SectionRow).__isSectionHeader);
      },
    }),
    [],
  );

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

  // 🔹 click on a section header → toggle collapse
  const handleRowClicked = (event: any) => {
    const data = event.data as SectionRow | undefined;
    if (!data?.__isSectionHeader || !data.__sectionId) return;

    setCollapsedSections((prev) => ({
      ...prev,
      [data.__sectionId]: !prev[data.__sectionId],
    }));
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
            Drag columns, filter, sort, collapse sections, and export your report data. Works on desktop and mobile.
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
              animateRows={true}
              suppressMenuHide={false}
              enableCellTextSelection={true}
              defaultColDef={{
                sortable: true,
                filter: true,
                resizable: true,
              }}
              quickFilterText={quickFilter}
              rowClassRules={rowClassRules}
              onRowClicked={handleRowClicked}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
