import React from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface ChartData {
  type: 'bar-chart' | 'line-chart';
  title?: string;
  data: Record<string, unknown>[];
  xKey: string;
  yKey: string;
}

export function ChartBlock({ data }: { data: ChartData }) {
  const isLine = data.type === 'line-chart';

  return (
    <div className="my-2">
      {data.title && <p className="text-xs font-medium text-default-600 mb-1">{data.title}</p>}
      <ResponsiveContainer width="100%" height={200}>
        {isLine ? (
          <LineChart data={data.data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={data.xKey} tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Line type="monotone" dataKey={data.yKey} stroke="#006FEE" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        ) : (
          <BarChart data={data.data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={data.xKey} tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey={data.yKey} fill="#006FEE" radius={[4, 4, 0, 0]} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

export function isChartBlock(data: unknown): data is ChartData {
  const d = data as Record<string, unknown>;
  const t = d?.type;
  return (t === 'bar-chart' || t === 'line-chart') && Array.isArray(d?.data);
}
