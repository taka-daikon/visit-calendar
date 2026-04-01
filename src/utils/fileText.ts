function countReplacementChars(text: string): number {
  return (text.match(/�/g) || []).length;
}

function looksLikeMojibake(text: string): boolean {
  if (!text.trim()) return true;
  return countReplacementChars(text) > 0 || /縺|繧|驛|荳|蜈/.test(text);
}

export async function readCsvFileText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const uint8 = new Uint8Array(buffer);

  const utf8 = new TextDecoder('utf-8').decode(uint8).replace(/^\uFEFF/, '');
  if (!looksLikeMojibake(utf8)) return utf8;

  try {
    const sjis = new TextDecoder('shift-jis').decode(uint8).replace(/^\uFEFF/, '');
    if (!looksLikeMojibake(sjis)) return sjis;
    return sjis;
  } catch {
    return utf8;
  }
}
