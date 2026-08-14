export const todayISO = () => new Date().toISOString().slice(0, 10);

export const daysUntil = (isoDate) => {
  const today = new Date(todayISO());
  const target = new Date(isoDate);
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
};

export function daysAgoLabel(iso) {
  const d = daysUntil(iso);
  if (d === 0) return "اليوم";
  if (d === -1) return "أمس";
  return `قبل ${Math.abs(d)} يوم`;
}
