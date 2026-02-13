import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LineChart, Line } from 'recharts';

const CRITICALITY_COLORS = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#f59e0b',
  low: '#10b981',
};

const fmtHours = (v) => new Intl.NumberFormat('en-US').format(v) + ' hrs';

export function ComponentLifeBar({ data = [] }) {
  if (!data.length) return <div className="text-center text-gray-400 py-12">No component data</div>;

  const sorted = [...data].sort((a, b) => a.expected_life_hours - b.expected_life_hours);

  return (
    <ResponsiveContainer width="100%" height={Math.max(300, sorted.length * 35)}>
      <BarChart data={sorted} layout="vertical" margin={{ top: 5, right: 30, left: 150, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
        <XAxis type="number" tickFormatter={(v) => `${(v / 1000).toFixed(0)}K hrs`} tick={{ fontSize: 11 }} />
        <YAxis type="category" dataKey="component_name" tick={{ fontSize: 12 }} width={140} />
        <Tooltip formatter={(val) => fmtHours(val)} />
        <Bar dataKey="expected_life_hours" name="Expected Life" radius={[0, 4, 4, 0]} barSize={20}>
          {sorted.map((entry, i) => (
            <Cell key={i} fill={CRITICALITY_COLORS[entry.criticality] || '#667eea'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function FailureCurveChart({ curve = [] }) {
  if (!curve.length) return <div className="text-center text-gray-400 py-12">Select a component</div>;

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={curve} margin={{ top: 10, right: 20, left: 20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="hours" tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} tick={{ fontSize: 11 }}
          label={{ value: 'Operating Hours', position: 'insideBottom', offset: -5 }} />
        <YAxis tick={{ fontSize: 11 }} domain={[0, 1]}
          tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
        <Tooltip
          formatter={(val, name) => [`${(val * 100).toFixed(1)}%`, name]}
          labelFormatter={(v) => `${new Intl.NumberFormat('en-US').format(v)} hours`}
        />
        <Line type="monotone" dataKey="failure_probability" name="Failure Probability" stroke="#ef4444" strokeWidth={2.5} dot={false} />
        <Line type="monotone" dataKey="reliability" name="Reliability" stroke="#10b981" strokeWidth={2.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function ReplacementTimelineChart({ data = [], periodYears = 20 }) {
  if (!data.length) return <div className="text-center text-gray-400 py-12">No replacement data</div>;

  // Transform into yearly cost bars
  const yearlyData = [];
  for (let y = 1; y <= periodYears; y++) {
    const yearCost = data.reduce((sum, comp) => {
      const compYearCost = comp.schedule
        ? comp.schedule.filter(s => s.year === y).reduce((s, e) => s + e.cost, 0) * (comp.units || 1)
        : 0;
      return sum + compYearCost;
    }, 0);
    yearlyData.push({ year: y, cost: Math.round(yearCost) });
  }

  const fmtCost = (v) => {
    if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
    if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
    return `$${v}`;
  };

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={yearlyData} margin={{ top: 10, right: 20, left: 20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="year" tick={{ fontSize: 11 }} label={{ value: 'Year', position: 'insideBottom', offset: -5 }} />
        <YAxis tickFormatter={fmtCost} tick={{ fontSize: 11 }} />
        <Tooltip formatter={(val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val)} />
        <Bar dataKey="cost" name="Replacement Cost" fill="#ef4444" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
