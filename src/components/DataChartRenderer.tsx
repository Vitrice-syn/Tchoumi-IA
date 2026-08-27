import React, { useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { 
  TrendingUp, BarChart3, PieChart as PieIcon, 
  Activity, Table as TableIcon, Download, 
  Maximize2, X, Copy, Check, Sparkles, Layers
} from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export interface ChartMetric {
  key: string;
  name: string;
  color?: string;
}

export interface ChartDataPayload {
  type?: 'line' | 'bar' | 'area' | 'pie' | 'radar';
  title?: string;
  description?: string;
  xAxisKey?: string;
  metrics?: ChartMetric[];
  data: Record<string, any>[];
  summary?: {
    total?: string | number;
    moyenne?: string | number;
    mediane?: string | number;
    min?: string | number;
    max?: string | number;
    croissance?: string;
    pointFort?: string;
    [key: string]: any;
  };
}

const DEFAULT_COLORS = [
  '#6366f1', // Indigo
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#8b5cf6', // Purple
  '#ef4444', // Red
  '#14b8a6', // Teal
];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[#09090d]/95 backdrop-blur-md p-3 rounded-xl border border-white/15 shadow-2xl text-xs z-50 min-w-[140px]">
        {label && <p className="font-semibold text-white mb-1.5 pb-1 border-b border-white/10">{label}</p>}
        <div className="space-y-1">
          {payload.map((entry: any, index: number) => {
            const val = typeof entry.value === 'number' 
              ? entry.value.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) 
              : entry.value;
            return (
              <div key={`item-${index}`} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-gray-300">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color || entry.fill }} />
                  {entry.name || entry.dataKey}:
                </span>
                <span className="font-mono font-bold text-white">{val}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  return null;
};

export const DataChartRenderer: React.FC<{ payload: ChartDataPayload }> = ({ payload }) => {
  const [chartType, setChartType] = useState<'line' | 'bar' | 'area' | 'pie' | 'table'>(
    payload.type === 'radar' ? 'line' : (payload.type || 'line')
  );
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);

  const rawData = payload.data || [];
  if (!rawData.length) return null;

  // Auto-detect keys if not provided
  const keys = Object.keys(rawData[0] || {});
  const xAxisKey = payload.xAxisKey || keys[0] || 'name';
  
  const metrics: ChartMetric[] = payload.metrics && payload.metrics.length > 0
    ? payload.metrics
    : keys.filter(k => k !== xAxisKey && typeof rawData[0][k] === 'number').map((k, idx) => ({
        key: k,
        name: k.charAt(0).toUpperCase() + k.slice(1),
        color: DEFAULT_COLORS[idx % DEFAULT_COLORS.length]
      }));

  // If no numeric metric found, fallback to next keys
  const activeMetrics = metrics.length > 0 ? metrics : [{
    key: keys[1] || keys[0],
    name: keys[1] || 'Valeur',
    color: DEFAULT_COLORS[0]
  }];

  // Compute automatic stats if not provided
  const primaryMetric = activeMetrics[0]?.key;
  const numericValues = rawData.map(d => Number(d[primaryMetric])).filter(n => !isNaN(n));
  
  const computedTotal = numericValues.length ? numericValues.reduce((a, b) => a + b, 0) : null;
  const computedAvg = numericValues.length ? computedTotal! / numericValues.length : null;
  const computedMax = numericValues.length ? Math.max(...numericValues) : null;
  const computedMin = numericValues.length ? Math.min(...numericValues) : null;

  const handleExportCSV = () => {
    const headers = [xAxisKey, ...activeMetrics.map(m => m.key)].join(',');
    const rows = rawData.map(row => [
      `"${row[xAxisKey] || ''}"`,
      ...activeMetrics.map(m => `"${row[m.key] ?? ''}"`)
    ].join(','));
    const csvContent = [headers, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `analyse_donnees_${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyJSON = () => {
    navigator.clipboard.writeText(JSON.stringify(rawData, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const renderChartGraphic = (height: number = 280) => {
    if (chartType === 'table') {
      return (
        <div className="overflow-x-auto max-h-[340px] scrollbar-thin">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-white/5 text-indigo-300 font-semibold sticky top-0 backdrop-blur-md">
              <tr>
                <th className="py-2.5 px-3 border-b border-white/10 capitalize">{xAxisKey}</th>
                {activeMetrics.map(m => (
                  <th key={m.key} className="py-2.5 px-3 border-b border-white/10 text-right">{m.name}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rawData.map((row, idx) => (
                <tr key={idx} className="hover:bg-white/[0.03] transition-colors">
                  <td className="py-2 px-3 text-white font-medium">{row[xAxisKey]}</td>
                  {activeMetrics.map(m => (
                    <td key={m.key} className="py-2 px-3 text-right font-mono text-gray-200">
                      {typeof row[m.key] === 'number' 
                        ? row[m.key].toLocaleString('fr-FR', { maximumFractionDigits: 2 }) 
                        : row[m.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    if (chartType === 'pie') {
      const pieDataKey = activeMetrics[0]?.key || keys[1];
      return (
        <div style={{ width: '100%', height }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip content={<CustomTooltip />} />
              <Legend 
                verticalAlign="bottom" 
                height={36} 
                wrapperStyle={{ fontSize: '11px', color: '#9ca3af', paddingTop: '8px' }} 
              />
              <Pie
                data={rawData}
                dataKey={pieDataKey}
                nameKey={xAxisKey}
                cx="50%"
                cy="50%"
                outerRadius={height > 300 ? 110 : 85}
                innerRadius={height > 300 ? 55 : 40}
                paddingAngle={4}
                label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                labelLine={false}
              >
                {rawData.map((_, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={DEFAULT_COLORS[index % DEFAULT_COLORS.length]} 
                    stroke="#09090d" 
                    strokeWidth={2}
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
      );
    }

    if (chartType === 'bar') {
      return (
        <div style={{ width: '100%', height }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rawData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
              <XAxis 
                dataKey={xAxisKey} 
                stroke="#6b7280" 
                fontSize={11} 
                tickLine={false} 
                axisLine={{ stroke: '#ffffff15' }} 
              />
              <YAxis 
                stroke="#6b7280" 
                fontSize={11} 
                tickLine={false} 
                axisLine={{ stroke: '#ffffff15' }} 
                tickFormatter={(v) => typeof v === 'number' ? (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v) : v}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend 
                wrapperStyle={{ fontSize: '11px', color: '#9ca3af', paddingTop: '10px' }} 
              />
              {activeMetrics.map((m, idx) => (
                <Bar 
                  key={m.key} 
                  dataKey={m.key} 
                  name={m.name} 
                  fill={m.color || DEFAULT_COLORS[idx % DEFAULT_COLORS.length]} 
                  radius={[6, 6, 0, 0]}
                  maxBarSize={45}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      );
    }

    if (chartType === 'area') {
      return (
        <div style={{ width: '100%', height }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={rawData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
              <defs>
                {activeMetrics.map((m, idx) => {
                  const color = m.color || DEFAULT_COLORS[idx % DEFAULT_COLORS.length];
                  return (
                    <linearGradient key={`grad-${m.key}`} id={`grad-${m.key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={color} stopOpacity={0.4} />
                      <stop offset="95%" stopColor={color} stopOpacity={0.0} />
                    </linearGradient>
                  );
                })}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
              <XAxis 
                dataKey={xAxisKey} 
                stroke="#6b7280" 
                fontSize={11} 
                tickLine={false} 
                axisLine={{ stroke: '#ffffff15' }} 
              />
              <YAxis 
                stroke="#6b7280" 
                fontSize={11} 
                tickLine={false} 
                axisLine={{ stroke: '#ffffff15' }} 
                tickFormatter={(v) => typeof v === 'number' ? (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v) : v}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend 
                wrapperStyle={{ fontSize: '11px', color: '#9ca3af', paddingTop: '10px' }} 
              />
              {activeMetrics.map((m, idx) => (
                <Area 
                  key={m.key} 
                  type="monotone" 
                  dataKey={m.key} 
                  name={m.name} 
                  stroke={m.color || DEFAULT_COLORS[idx % DEFAULT_COLORS.length]} 
                  strokeWidth={2.5}
                  fillOpacity={1} 
                  fill={`url(#grad-${m.key})`} 
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      );
    }

    // Default: Line Chart (Courbe)
    return (
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rawData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
            <XAxis 
              dataKey={xAxisKey} 
              stroke="#6b7280" 
              fontSize={11} 
              tickLine={false} 
              axisLine={{ stroke: '#ffffff15' }} 
            />
            <YAxis 
              stroke="#6b7280" 
              fontSize={11} 
              tickLine={false} 
              axisLine={{ stroke: '#ffffff15' }} 
              tickFormatter={(v) => typeof v === 'number' ? (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v) : v}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend 
              wrapperStyle={{ fontSize: '11px', color: '#9ca3af', paddingTop: '10px' }} 
            />
            {activeMetrics.map((m, idx) => (
              <Line 
                key={m.key} 
                type="monotone" 
                dataKey={m.key} 
                name={m.name} 
                stroke={m.color || DEFAULT_COLORS[idx % DEFAULT_COLORS.length]} 
                strokeWidth={3}
                dot={{ r: 4, strokeWidth: 2, fill: '#09090d' }}
                activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  };

  return (
    <div className="my-5 rounded-2xl border border-white/10 overflow-hidden bg-[#09090d] shadow-2xl not-prose">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 p-3 sm:px-4 sm:py-3 bg-white/[0.03] border-b border-white/10">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
            <Activity size={16} />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-semibold text-xs sm:text-sm text-white truncate">
              {payload.title || "Analyse Graphique & Métriques"}
            </span>
            {payload.description && (
              <span className="text-[10px] sm:text-[11px] text-gray-400 truncate max-w-xs sm:max-w-sm">
                {payload.description}
              </span>
            )}
          </div>
        </div>

        {/* Action controls & chart type switchers with scroll on mobile */}
        <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/10 overflow-x-auto max-w-full scrollbar-hide">
          <button
            onClick={() => setChartType('line')}
            className={cn(
              "p-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1 shrink-0",
              chartType === 'line' ? "bg-indigo-600 text-white shadow-sm" : "text-gray-400 hover:text-white hover:bg-white/5"
            )}
            title="Courbe d'évolution"
          >
            <TrendingUp size={13} />
            <span className="text-[10px] sm:text-xs">Courbe</span>
          </button>
          <button
            onClick={() => setChartType('bar')}
            className={cn(
              "p-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1 shrink-0",
              chartType === 'bar' ? "bg-indigo-600 text-white shadow-sm" : "text-gray-400 hover:text-white hover:bg-white/5"
            )}
            title="Histogramme"
          >
            <BarChart3 size={13} />
            <span className="text-[10px] sm:text-xs">Barres</span>
          </button>
          <button
            onClick={() => setChartType('area')}
            className={cn(
              "p-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1 shrink-0",
              chartType === 'area' ? "bg-indigo-600 text-white shadow-sm" : "text-gray-400 hover:text-white hover:bg-white/5"
            )}
            title="Aire"
          >
            <Layers size={13} />
            <span className="text-[10px] sm:text-xs">Aire</span>
          </button>
          <button
            onClick={() => setChartType('pie')}
            className={cn(
              "p-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1 shrink-0",
              chartType === 'pie' ? "bg-indigo-600 text-white shadow-sm" : "text-gray-400 hover:text-white hover:bg-white/5"
            )}
            title="Circulaire"
          >
            <PieIcon size={13} />
            <span className="text-[10px] sm:text-xs">Part</span>
          </button>
          <button
            onClick={() => setChartType('table')}
            className={cn(
              "p-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1 shrink-0",
              chartType === 'table' ? "bg-indigo-600 text-white shadow-sm" : "text-gray-400 hover:text-white hover:bg-white/5"
            )}
            title="Données brutes"
          >
            <TableIcon size={13} />
            <span className="text-[10px] sm:text-xs">Tableau</span>
          </button>

          <div className="w-px h-3.5 bg-white/10 mx-0.5 shrink-0" />

          <button
            onClick={handleExportCSV}
            className="p-1.5 text-gray-400 hover:text-indigo-300 hover:bg-white/5 rounded-lg transition-all shrink-0"
            title="Télécharger en CSV"
          >
            <Download size={13} />
          </button>
          <button
            onClick={handleCopyJSON}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-all shrink-0"
            title="Copier les données JSON"
          >
            {copied ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
          </button>
          <button
            onClick={() => setIsFullscreen(true)}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-all shrink-0"
            title="Agrandir en plein écran"
          >
            <Maximize2 size={13} />
          </button>
        </div>
      </div>

      {/* KPI Cards / Statistical Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 bg-white/[0.015] border-b border-white/5 text-xs">
        <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5 flex flex-col">
          <span className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Total / Cumul</span>
          <span className="font-mono font-bold text-indigo-200 text-sm mt-0.5">
            {payload.summary?.total ?? (computedTotal !== null ? computedTotal.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) : '—')}
          </span>
        </div>
        <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5 flex flex-col">
          <span className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Moyenne</span>
          <span className="font-mono font-bold text-emerald-300 text-sm mt-0.5">
            {payload.summary?.moyenne ?? (computedAvg !== null ? computedAvg.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) : '—')}
          </span>
        </div>
        <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5 flex flex-col">
          <span className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Valeur Max</span>
          <span className="font-mono font-bold text-amber-300 text-sm mt-0.5">
            {payload.summary?.max ?? (computedMax !== null ? computedMax.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) : '—')}
          </span>
        </div>
        <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5 flex flex-col">
          <span className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Points mesurés</span>
          <span className="font-mono font-bold text-purple-300 text-sm mt-0.5">
            {rawData.length} entrées
          </span>
        </div>
      </div>

      {/* Main Chart Canvas */}
      <div className="p-4 pt-5 bg-gradient-to-b from-transparent to-black/20">
        {renderChartGraphic(270)}
      </div>

      {/* Key Insight footer if available */}
      {(payload.summary?.pointFort || payload.summary?.croissance) && (
        <div className="px-4 py-2.5 bg-indigo-950/20 border-t border-indigo-500/10 flex items-center gap-2 text-xs text-indigo-300">
          <Sparkles size={13} className="text-indigo-400 shrink-0" />
          <span className="font-medium">
            {payload.summary.pointFort || `Croissance globale observée : ${payload.summary.croissance}`}
          </span>
        </div>
      )}

      {/* Fullscreen Modal */}
      <AnimatePresence>
        {isFullscreen && (
          <div className="fixed inset-0 z-[150] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 sm:p-8">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#09090d] border border-white/20 rounded-3xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden shadow-2xl"
            >
              <div className="p-4 sm:p-6 border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Activity size={20} className="text-indigo-400" />
                  <div>
                    <h2 className="text-lg font-bold text-white">{payload.title || "Analyse Détaillée"}</h2>
                    <p className="text-xs text-gray-400">{payload.description || "Visualisation interactive haute précision"}</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsFullscreen(false)}
                  className="p-2 bg-white/10 hover:bg-white/20 rounded-xl text-white transition-all"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 p-6 overflow-hidden flex flex-col justify-center">
                {renderChartGraphic(480)}
              </div>

              <div className="p-4 bg-white/[0.02] border-t border-white/10 flex justify-between items-center text-xs text-gray-400">
                <span>{rawData.length} données analysées</span>
                <button
                  onClick={handleExportCSV}
                  className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium transition-all"
                >
                  <Download size={14} /> Exporter CSV
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
