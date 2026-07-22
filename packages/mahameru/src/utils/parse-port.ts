export function parsePort(value: string) {
  const parsed = parseInt(value, 10);

  if (isNaN(parsed)) return undefined;

  return parsed;
}
