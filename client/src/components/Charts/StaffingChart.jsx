import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';

export default function StaffingChart({ data = [] }) {
  if (!data.length) return <div className="text-center text-gray-400 py-12">No data</div>;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
        <defs>
          <linearGradient id="staffGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#667eea" stopOpacity={0.2} />
            <stop offset="95%" stopColor="#667eea" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={2} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
        <Tooltip />
        <Area
          type="stepAfter"
          dataKey="technicians"
          name="Technicians Required"
          stroke="#667eea"
          fill="url(#staffGrad)"
          strokeWidth={2.5}
        />
        <Line
          type="stepAfter"
          dataKey="units_active"
          name="Units Active"
          stroke="#10b981"
          strokeWidth={1.5}
          strokeDasharray="5 5"
          dot={false}
          yAxisId={0}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
