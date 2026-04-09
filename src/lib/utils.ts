// src/lib/utils.ts

export function formatDuration(hours: number): string {
  if (hours <= 0) return '0 min';
  
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);

  if (h === 0) return `${m} mins`;
  if (m === 0) return `${h} hr${h > 1 ? 's' : ''}`;
  return `${h} hr${h > 1 ? 's' : ''} ${m} mins`;
}