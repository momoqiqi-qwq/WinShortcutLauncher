export function basename(path: string): string {
  const clean = path.replace(/\\+$/, '');
  const parts = clean.split(/[\\/]/);
  return parts[parts.length - 1] || clean;
}

export function withoutExtension(name: string): string {
  return name.replace(/\.[^/.]+$/, '');
}
