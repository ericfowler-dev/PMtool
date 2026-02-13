import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const fmt = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
const fmtShort = (v) => {
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v}`;
};

export default function ProjectionChart({ data = [], stacked = true }) {
  if (!data.length) return <div className="text-center text-gray-400 py-12">No data</div>;

  const areas = [
    { key: 'maintenance', name: 'Maintenance', color: '#667eea' },
    { key: 'fuel', name: 'Fuel', color: '#f59e0b' },
    { key: 'replacements', name: 'Replacements', color: '#ef4444' },
    { key: 'downtime', name: 'Downtime', color: '#8b5cf6' },
  ];

  // Filter to only areas that have data
  const activeAreas = areas.filter(a => data.some(d => (d[a.key] || 0) > 0));

  return (
    <ResponsiveContainer width="100%" height={350}>
      <AreaChart data={data} margin={{ top: 10, right: 20, left: 20, bottom: 0 }}>
        <defs>
          {activeAreas.map(a => (
            <linearGradient key={a.key} id={`grad-${a.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={a.color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={a.color} stopOpacity={0.05} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="year" tick={{ fontSize: 12 }} label={{ value: 'Year', position: 'insideBottom', offset: -5 }} />
        <YAxis tickFormatter={fmtShort} tick={{ fontSize: 12 }} />
        <Tooltip formatter={(val) => fmt(val)} />
        <Legend />
        {activeAreas.map(a => (
          <Area
            key={a.key}
            type="monotone"
            dataKey={a.key}
            name={a.name}
            stackId={stacked ? '1' : undefined}
            stroke={a.color}
            fill={`url(#grad-${a.key})`}
            strokeWidth={2}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
