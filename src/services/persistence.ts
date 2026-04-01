export function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function saveToStorage<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

export function downloadTextFile(fileName: string, content: string, contentType = 'text/plain;charset=utf-8'): void {
  const payload = contentType.includes('text/csv') ? `\uFEFF${content}` : content;
  const blob = new Blob([payload], { type: contentType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function printHtml(title: string, bodyHtml: string): void {
  const popup = window.open('', '_blank', 'width=1024,height=768');
  if (!popup) return;
  popup.document.write(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:sans-serif;padding:24px;}table{border-collapse:collapse;width:100%;margin-top:16px;}th,td{border:1px solid #d0d7de;padding:8px;text-align:left;}h1,h2{margin:0 0 12px;} .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;} .card{border:1px solid #d0d7de;border-radius:12px;padding:16px;}</style></head><body>${bodyHtml}</body></html>`);
  popup.document.close();
  popup.focus();
  popup.print();
}
