export function sourceLabel(source) {
  if (typeof source?.name === 'string' && source.name.trim().length > 0) return source.name;
  if (typeof source?.location === 'string' && source.location.trim().length > 0) return source.location;
  return source?.id ?? 'unknown';
}

export function formatDateTime(value) {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}


export function downloadTextFile(name, content, mimeType) {
  const blob = new Blob([content], { type: mimeType ?? 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
