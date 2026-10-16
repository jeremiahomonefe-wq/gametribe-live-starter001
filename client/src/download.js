// Starts a download of a CSV file (works in the real app; a published preview page blocks downloads).
export function downloadText(name, text) {
  const blob = new Blob(['\uFEFF' + text], { type: 'text/csv;charset=utf-8' }); // BOM so Excel reads accents correctly
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = name;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
