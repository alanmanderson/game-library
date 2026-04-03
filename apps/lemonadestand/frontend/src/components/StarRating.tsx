import { Star } from 'lucide-react';

interface StarRatingProps {
  rating: number; // 1.0 - 5.0
  size?: number;
}

export default function StarRating({ rating, size = 18 }: StarRatingProps) {
  const stars = [];
  for (let i = 1; i <= 5; i++) {
    const fill = Math.min(1, Math.max(0, rating - (i - 1)));
    stars.push(
      <span key={i} className="relative inline-block" style={{ width: size, height: size }}>
        <Star size={size} className="text-gray-300" strokeWidth={1.5} />
        <span
          className="absolute inset-0 overflow-hidden"
          style={{ width: `${fill * 100}%` }}
        >
          <Star size={size} className="text-amber-400 fill-amber-400" strokeWidth={1.5} />
        </span>
      </span>,
    );
  }

  return (
    <span className="inline-flex items-center gap-0.5" title={`${rating.toFixed(1)} / 5.0`}>
      {stars}
      <span className="ml-1 text-sm font-semibold text-amber-700">{rating.toFixed(1)}</span>
    </span>
  );
}
