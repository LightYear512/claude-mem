/**
 * Module inference from file paths.
 * Extracts directory-level module prefixes for coarse-grained work area detection.
 */

/**
 * Infer module prefixes from file paths.
 * For each path, extracts the first 2 and 3 directory segments.
 *
 * Example: "src/renderer/physics/engine.ts" → ["src/renderer/", "src/renderer/physics/"]
 */
export function inferModules(filePaths: string[]): string[] {
  const modules = new Set<string>();
  for (const fp of filePaths) {
    if (!fp || typeof fp !== 'string') continue;

    // Normalize: strip leading ./ or /
    const normalized = fp.replace(/^\.?\//, '');
    const parts = normalized.split('/');

    // Need at least 2 parts (dir + file) to infer a module
    if (parts.length >= 2) {
      modules.add(parts.slice(0, 2).join('/') + '/');
    }
    if (parts.length >= 3) {
      modules.add(parts.slice(0, 3).join('/') + '/');
    }
  }
  return [...modules];
}
