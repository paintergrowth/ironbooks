import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText, Download, Play, Calendar, Filter } from 'lucide-react';

interface ReportsProps {
  initialFilter?: string;
  initialTimeframe?: string;
}

const Reports: React.FC<ReportsProps> = ({ initialFilter, initialTimeframe }) => {
  const [activeFilter, setActiveFilter] = useState(initialFilter || 'all');
  const [timeframe, setTimeframe] = useState(initialTimeframe || 'thisMonth');

  useEffect(() => {
    if (initialFilter) {
      setActiveFilter(initialFilter);
    }
    if (initialTimeframe) {
      setTimeframe(initialTimeframe);
    }
  }, [initialFilter, initialTimeframe]);

  const reports = [
    {
      id: '1',
      month: 'July 2024',
      pdfUrl: '#',
      videoUrl: '#',
      date: '2024-07-31',
      status: 'completed',
      revenue: '$162,300',
      expenses: '$108,900',
      profit: '$53,400'
    },
    {
      id: '2',
      month: 'June 2024',
      pdfUrl: '#',
      videoUrl: '#',
      date: '2024-06-30',
      status: 'completed',
      revenue: '$160,000',
      expenses: '$110,000',
      profit: '$50,000'
    },
    {
      id: '3',
      month: 'May 2024',
      pdfUrl: '#',
      videoUrl: '#',
      date: '2024-05-31',
      status: 'completed',
      revenue: '$155,000',
      expenses: '$108,000',
      profit: '$47,000'
    },
    {
      id: '4',
      month: 'April 2024',
      pdfUrl: '#',
      videoUrl: '#',
      date: '2024-04-30',
      status: 'processing',
      revenue: '$150,000',
      expenses: '$105,000',
      profit: '$45,000'
    }
  ];

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

  return (
    <div className="space-y-8 p-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">Reports</h1>
          <p className="text-gray-600 dark:text-gray-400">Access your monthly financial reports and video reviews</p>
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
          <Select value={activeFilter} onValueChange={setActiveFilter}>
            <SelectTrigger className="w-48">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Reports</SelectItem>
              <SelectItem value="revenue">Revenue Reports</SelectItem>
              <SelectItem value="expenses">Expense Reports</SelectItem>
              <SelectItem value="profit-loss">Profit & Loss Reports</SelectItem>
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
        </div>
      </div>

      <div className="grid gap-6">
        {reports.map((report) => (
          <Card key={report.id} className="border-2 shadow-lg hover:shadow-xl transition-shadow duration-200 dark:border-gray-700">
            <CardHeader className="pb-4">
              <div className="flex justify-between items-start">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-full">
                    <FileText className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <CardTitle className="text-xl font-bold text-gray-900 dark:text-white">
                      {report.month} Financial Report
                    </CardTitle>
                    <div className="flex items-center space-x-2 mt-1">
                      <Calendar className="h-4 w-4 text-gray-500" />
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        Generated on {new Date(report.date).toLocaleDateString()}
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
                  <div className="text-lg font-bold text-green-900 dark:text-green-300">{report.revenue}</div>
                </div>
                <div className={`text-center p-3 rounded-lg ${
                  activeFilter === 'expenses' || activeFilter === 'all'
                    ? 'bg-red-50 dark:bg-red-900/10 ring-2 ring-red-200'
                    : 'bg-red-50 dark:bg-red-900/10'
                }`}>
                  <div className="text-sm font-medium text-red-700 dark:text-red-400">Expenses</div>
                  <div className="text-lg font-bold text-red-900 dark:text-red-300">{report.expenses}</div>
                </div>
                <div className={`text-center p-3 rounded-lg ${
                  activeFilter === 'profit-loss' || activeFilter === 'all'
                    ? 'bg-blue-50 dark:bg-blue-900/10 ring-2 ring-blue-200'
                    : 'bg-blue-50 dark:bg-blue-900/10'
                }`}>
                  <div className="text-sm font-medium text-blue-700 dark:text-blue-400">Net Profit</div>
                  <div className="text-lg font-bold text-blue-900 dark:text-blue-300">{report.profit}</div>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button 
                  variant="default" 
                  size="sm" 
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                  disabled={report.status !== 'completed'}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download PDF
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="flex-1 border-2"
                  disabled={report.status !== 'completed'}
                >
                  <Play className="mr-2 h-4 w-4" />
                  Watch Review
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {reports.length === 0 && (
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
    </div>
  );
};

export default Reports;