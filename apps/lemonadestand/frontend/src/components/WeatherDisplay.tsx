import { WeatherNames, WeatherIcons } from '@/types/game';

interface WeatherDisplayProps {
  weather: string;
  temperature: number;
  compact?: boolean;
}

export default function WeatherDisplay({ weather, temperature, compact = false }: WeatherDisplayProps) {
  const icon = WeatherIcons[weather] ?? '\u2600\uFE0F';
  const name = WeatherNames[weather] ?? 'Unknown';

  if (compact) {
    return (
      <span className="inline-flex items-center gap-1 text-sm">
        <span className="text-xl">{icon}</span>
        <span className="font-medium">{temperature}&deg;F</span>
      </span>
    );
  }

  return (
    <div className="flex items-center gap-3 bg-gradient-to-r from-sky-50 to-blue-50 rounded-xl px-4 py-3 border border-sky-100">
      <span className="text-4xl">{icon}</span>
      <div>
        <div className="font-bold text-sky-800">{name}</div>
        <div className="text-sm text-sky-600">{temperature}&deg;F</div>
      </div>
    </div>
  );
}
