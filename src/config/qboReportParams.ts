// src/config/qboReportParams.ts
export type ParamType = 'date' | 'daterange' | 'select' | 'multiselect' | 'toggle' | 'number';

export type ParamDef = {
  id: string;                      // e.g. "start_date"
  label: string;                   // "Start date"
  type: ParamType;
  placeholder?: string;
  default?: any;
  options?: { label: string; value: string }[]; // for select
  source?: 'customers' | 'vendors' | 'items' | 'accounts' | 'classes' | 'departments'; // for async picks
  showIf?: (values: Record<string, any>) => boolean; // optional conditional visibility
};
const PROFIT_AND_LOSS_PARAMS: ParamDef[] = [
  // ✅ move your existing ProfitAndLoss array contents here
    ProfitAndLoss: [
    {
      id: 'date_mode', label: 'Date Mode', type: 'select',
      options: [
        { label: 'Range', value: 'range' },
        { label: 'Single Month', value: 'single' },
      ],
      default: 'range'
    },

    // RANGE inputs (shown only when date_mode = range)
    { id: 'start_date', label: 'Start date', type: 'date', showIf: v => v.date_mode === 'range' },
    { id: 'end_date',   label: 'End date',   type: 'date', showIf: v => v.date_mode === 'range' },

    // SINGLE-MONTH inputs
    { id: 'as_of_date', label: 'As of', type: 'date', showIf: v => v.date_mode === 'single' },

    // (New) Optional QuickBooks macro when in single mode (lets edge use canonical macros)
    {
      id: 'date_macro', label: 'Date Macro', type: 'select',
      options: [
        { label: 'Today', value: 'Today' },
        { label: 'This Month', value: 'This Month' },
        { label: 'Last Month', value: 'Last Month' },
        { label: 'This Quarter', value: 'This Quarter' },
        { label: 'This Year-to-date', value: 'This Year-to-date' },
      ],
      showIf: v => v.date_mode === 'single'
    },

    {
      id: 'accounting_method', label: 'Accounting Method', type: 'select',
      options: [{ label:'Accrual', value:'Accrual' }, { label:'Cash', value:'Cash' }],
      default: 'Accrual'
    },
    {
      id: 'summarize_column_by', label: 'Summarize By', type: 'select',
      options: [
        { label:'Month', value:'Month' },
        { label:'Quarter', value:'Quarter' },
        { label:'Year', value:'Year' }
      ],
      default: 'Month'
    },
    {
      id: 'columns', label: 'Columns', type: 'select',
      options: [
        { label:'Total Only',   value:'TotalOnly' },
        { label:'Customers',    value:'Customers' },
        { label:'Classes',      value:'Classes' },
        { label:'Departments',  value:'Departments' }
      ],
      default: 'TotalOnly'
    },

    // entity filters (optional)
    { id: 'customer',   label: 'Customers',   type: 'multiselect', source: 'customers',   showIf: v => v.columns === 'Customers' },
    { id: 'class',      label: 'Classes',     type: 'multiselect', source: 'classes',     showIf: v => v.columns === 'Classes' },
    { id: 'department', label: 'Departments', type: 'multiselect', source: 'departments', showIf: v => v.columns === 'Departments' },
  ]
];
export const REPORT_PARAM_CONFIG: Record<string, ParamDef[]> = {
  ProfitAndLoss: [
    {
      id: 'date_mode', label: 'Date Mode', type: 'select',
      options: [
        { label: 'Range', value: 'range' },
        { label: 'Single Month', value: 'single' },
      ],
      default: 'range'
    },

    // RANGE inputs (shown only when date_mode = range)
    { id: 'start_date', label: 'Start date', type: 'date', showIf: v => v.date_mode === 'range' },
    { id: 'end_date',   label: 'End date',   type: 'date', showIf: v => v.date_mode === 'range' },

    // SINGLE-MONTH inputs
    { id: 'as_of_date', label: 'As of', type: 'date', showIf: v => v.date_mode === 'single' },

    // (New) Optional QuickBooks macro when in single mode (lets edge use canonical macros)
    {
      id: 'date_macro', label: 'Date Macro', type: 'select',
      options: [
        { label: 'Today', value: 'Today' },
        { label: 'This Month', value: 'This Month' },
        { label: 'Last Month', value: 'Last Month' },
        { label: 'This Quarter', value: 'This Quarter' },
        { label: 'This Year-to-date', value: 'This Year-to-date' },
      ],
      showIf: v => v.date_mode === 'single'
    },

    {
      id: 'accounting_method', label: 'Accounting Method', type: 'select',
      options: [{ label:'Accrual', value:'Accrual' }, { label:'Cash', value:'Cash' }],
      default: 'Accrual'
    },
    {
      id: 'summarize_column_by', label: 'Summarize By', type: 'select',
      options: [
        { label:'Month', value:'Month' },
        { label:'Quarter', value:'Quarter' },
        { label:'Year', value:'Year' }
      ],
      default: 'Month'
    },
    {
      id: 'columns', label: 'Columns', type: 'select',
      options: [
        { label:'Total Only',   value:'TotalOnly' },
        { label:'Customers',    value:'Customers' },
        { label:'Classes',      value:'Classes' },
        { label:'Departments',  value:'Departments' }
      ],
      default: 'TotalOnly'
    },

    // entity filters (optional)
    { id: 'customer',   label: 'Customers',   type: 'multiselect', source: 'customers',   showIf: v => v.columns === 'Customers' },
    { id: 'class',      label: 'Classes',     type: 'multiselect', source: 'classes',     showIf: v => v.columns === 'Classes' },
    { id: 'department', label: 'Departments', type: 'multiselect', source: 'departments', showIf: v => v.columns === 'Departments' },
  ],
  ProfitAndLossPct: [
    {
      id: 'date_mode', label: 'Date Mode', type: 'select',
      options: [
        { label: 'Range', value: 'range' },
        { label: 'Single Month', value: 'single' },
      ],
      default: 'range'
    },

    // RANGE inputs (shown only when date_mode = range)
    { id: 'start_date', label: 'Start date', type: 'date', showIf: v => v.date_mode === 'range' },
    { id: 'end_date',   label: 'End date',   type: 'date', showIf: v => v.date_mode === 'range' },

    // SINGLE-MONTH inputs
    { id: 'as_of_date', label: 'As of', type: 'date', showIf: v => v.date_mode === 'single' },

    // (New) Optional QuickBooks macro when in single mode (lets edge use canonical macros)
    {
      id: 'date_macro', label: 'Date Macro', type: 'select',
      options: [
        { label: 'Today', value: 'Today' },
        { label: 'This Month', value: 'This Month' },
        { label: 'Last Month', value: 'Last Month' },
        { label: 'This Quarter', value: 'This Quarter' },
        { label: 'This Year-to-date', value: 'This Year-to-date' },
      ],
      showIf: v => v.date_mode === 'single'
    },

    {
      id: 'accounting_method', label: 'Accounting Method', type: 'select',
      options: [{ label:'Accrual', value:'Accrual' }, { label:'Cash', value:'Cash' }],
      default: 'Accrual'
    },
    {
      id: 'summarize_column_by', label: 'Summarize By', type: 'select',
      options: [
        { label:'Month', value:'Month' },
        { label:'Quarter', value:'Quarter' },
        { label:'Year', value:'Year' }
      ],
      default: 'Month'
    },
    {
      id: 'columns', label: 'Columns', type: 'select',
      options: [
        { label:'Total Only',   value:'TotalOnly' },
        { label:'Customers',    value:'Customers' },
        { label:'Classes',      value:'Classes' },
        { label:'Departments',  value:'Departments' }
      ],
      default: 'TotalOnly'
    },

    // entity filters (optional)
    { id: 'customer',   label: 'Customers',   type: 'multiselect', source: 'customers',   showIf: v => v.columns === 'Customers' },
    { id: 'class',      label: 'Classes',     type: 'multiselect', source: 'classes',     showIf: v => v.columns === 'Classes' },
    { id: 'department', label: 'Departments', type: 'multiselect', source: 'departments', showIf: v => v.columns === 'Departments' },
  ],
  

  BalanceSheet: [
    { id: 'as_of_date', label: 'As of', type: 'date' },
    {
      id: 'accounting_method', label: 'Accounting Method', type: 'select',
      options: [{ label:'Accrual', value:'Accrual' }, { label:'Cash', value:'Cash' }],
      default: 'Accrual'
    },
  ],

  TrialBalance: [
    { id: 'start_date', label: 'Start date', type: 'date' },
    { id: 'end_date',   label: 'End date',   type: 'date' },
  ],

  CashFlow: [
    { id: 'start_date', label: 'Start date', type: 'date' },
    { id: 'end_date',   label: 'End date',   type: 'date' },
  ],

  AgedReceivables: [
    { id: 'report_date', label: 'As of', type: 'date' },
    {
      id: 'days', label: 'Aging Days (30/60/90)', type: 'select',
      options: [{ label:'30', value:'30' }, { label:'60', value:'60' }, { label:'90', value:'90' }],
      default: '30'
    },
    { id: 'customer', label: 'Customers', type: 'multiselect', source: 'customers' },
  ],

  AgedPayables: [
    { id: 'report_date', label: 'As of', type: 'date' },
    {
      id: 'days', label: 'Aging Days (30/60/90)', type: 'select',
      options: [{ label:'30', value:'30' }, { label:'60', value:'60' }, { label:'90', value:'90' }],
      default: '30'
    },
    { id: 'vendor', label: 'Vendors', type: 'multiselect', source: 'vendors' },
  ],

  CustomerSales: [
    { id: 'start_date', label: 'Start date', type: 'date' },
    { id: 'end_date',   label: 'End date',   type: 'date' },
    {
      id: 'summarize_column_by', label: 'Summarize By', type: 'select',
      options: [
        { label:'Month', value:'Month' },
        { label:'Quarter', value:'Quarter' },
        { label:'Year', value:'Year' }
      ],
      default: 'Month'
    },
    { id: 'customer',   label: 'Customers',   type: 'multiselect', source: 'customers' },
    { id: 'class',      label: 'Classes',     type: 'multiselect', source: 'classes' },
    { id: 'department', label: 'Departments', type: 'multiselect', source: 'departments' },
  ],

  ItemSales: [
    { id: 'start_date', label: 'Start date', type: 'date' },
    { id: 'end_date',   label: 'End date',   type: 'date' },
    { id: 'item',       label: 'Items',      type: 'multiselect', source: 'items' },
    { id: 'class',      label: 'Classes',    type: 'multiselect', source: 'classes' },
    { id: 'department', label: 'Departments', type: 'multiselect', source: 'departments' },
  ],

  InventoryValuationSummary: [
    { id: 'as_of_date', label: 'As of', type: 'date' },
    { id: 'item',       label: 'Items', type: 'multiselect', source: 'items' },
  ],

  GeneralLedger: [
    { id: 'start_date', label: 'Start date', type: 'date' },
    { id: 'end_date',   label: 'End date',   type: 'date' },
    { id: 'account',    label: 'Accounts',   type: 'multiselect', source: 'accounts' },
    { id: 'class',      label: 'Classes',    type: 'multiselect', source: 'classes' },
    { id: 'department', label: 'Departments', type: 'multiselect', source: 'departments' },
  ],
};
