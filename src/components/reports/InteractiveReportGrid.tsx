// src/components/reports/InteractiveReportGrid.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef } from 'ag-grid-community';

// ✅ NEW: import CSS from the styles package
import '@ag-grid-community/styles/ag-grid.css';
import '@ag-grid-community/styles/ag-theme-quartz.css';
import '@ag-grid-community/styles/ag-theme-quartz-dark.css';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';

type InteractiveReportGridProps = {
  title?: string;
  headers: string[];
  rows: any[][];
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

  const columnDefs: ColDef[] = useMemo(() => {
    return headers.map((h) => {
      const headerName =
        h
          .replace(/_/g, ' ')
          .replace(/([a-z])([A-Z])/g, '$1 $2')
          .replace(/\s+/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase()) || h;

      return {
        field: h,
        headerName,
        sortable: true,
        filter: true, // column-level filter
        floatingFilter: true, // shows small filter input under header
        resizable: true,
      } as ColDef;
    });
  }, [headers]);

  const rowData = useMemo(() => {
    return rows.map((row, idx) => {
      const obj: Record<string, any> = { _id: idx };
      headers.forEach((h, i) => {
        obj[h] = row[i];
      });
      return obj;
    });
  }, [headers, rows]);

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
            Drag columns, filter, sort, and export your report data. Works on desktop and mobile.
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
              rowData={rowData}
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
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
