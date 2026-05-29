import { buildPath } from "@/lib/editor/path-editor-geometry";
import type { BuiltPath, EditorPath } from "@/lib/editor/path-editor-types";

export type BuiltPathCache = Map<string, { signature: string; built: BuiltPath }>;

export function buildCachedPaths(paths: EditorPath[], cache: BuiltPathCache): BuiltPath[] {
  const livePathIds = new Set(paths.map((path) => path.id));
  for (const pathId of cache.keys()) {
    if (!livePathIds.has(pathId)) cache.delete(pathId);
  }

  return paths.map((path) => {
    const signature = geometrySignature(path);
    const cached = cache.get(path.id);
    if (cached?.signature === signature) return { ...cached.built, path };

    const built = buildPath(path);
    cache.set(path.id, { signature, built });
    return built;
  });
}

function geometrySignature(path: EditorPath): string {
  return path.poses
    .map((pose) => `${pose.id}:${pose.x}:${pose.y}:${pose.headingDeg ?? ""}:${pose.kind}:${pose.radius}`)
    .join("|");
}
