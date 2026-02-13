const colorMap = {
  blue: 'from-brand-500 to-indigo-600',
  green: 'from-emerald-500 to-teal-600',
  purple: 'from-purple-500 to-pink-600',
  orange: 'from-orange-500 to-amber-600',
  red: 'from-red-500 to-rose-600',
  cyan: 'from-cyan-500 to-blue-600',
};

export default function MetricCard({ label, value, subtitle, color = 'blue', icon: Icon }) {
  return (
    <div className={`relative overflow-hidden rounded-xl bg-gradient-to-br ${colorMap[color] || colorMap.blue} p-5 text-white shadow-lg`}>
      <div className="relative z-10">
        {Icon && <Icon size={22} className="mb-2 opacity-80" />}
        <div className="text-3xl font-extrabold tracking-tight">{value}</div>
        <div className="text-sm font-medium opacity-90 mt-1">{label}</div>
        {subtitle && <div className="text-xs opacity-70 mt-0.5">{subtitle}</div>}
      </div>
      <div className="absolute -right-4 -bottom-4 opacity-10">
        {Icon && <Icon size={100} />}
      </div>
    </div>
  );
}
