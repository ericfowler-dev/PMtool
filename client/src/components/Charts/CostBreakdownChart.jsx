import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

const COLORS = ['#667eea', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316'];

const fmt = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);

export default function CostBreakdownChart({ data = [] }) {
  if (!data.length) return <div className="text-center text-gray-400 py-12">No data</div>;

  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <ResponsiveContainer width="100%" height={320}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={70}
          outerRadius={110}
          paddingAngle={3}
          dataKey="value"
          nameKey="name"
          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
          labelLine={false}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(val) => fmt(val)} />
        <Legend />
        <text x="50%" y="47%" textAnchor="middle" dominantBaseline="middle" className="fill-gray-900 text-lg font-bold">
          {fmt(total)}
        </text>
        <text x="50%" y="55%" textAnchor="middle" dominantBaseline="middle" className="fill-gray-500 text-xs">
          Total / Year
        </text>
      </PieChart>
    </ResponsiveContainer>
  );
}
