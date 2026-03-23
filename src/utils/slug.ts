export interface SlugResult {
  branch: string;
  folder: string;
}

const COLLISION_SUFFIX_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

export function branchToFolderSlug(branch: string): string {
  const replacedSeparators = branch.replace(/[\\/]+/g, "-");
  const safeChars = replacedSeparators.replace(/[^a-zA-Z0-9._-]/g, "-");
  const collapsed = safeChars.replace(/-+/g, "-");
  const trimmed = collapsed.replace(/^-+|-+$/g, "");
  return trimmed || "workspace";
}

export function resolveSlugCollision(
  desiredSlug: string,
  existingSlugs: Set<string>
): string {
  if (!existingSlugs.has(desiredSlug)) return desiredSlug;

  for (let i = 0; i < COLLISION_SUFFIX_CHARS.length; i += 1) {
    const candidate = `${desiredSlug}-${COLLISION_SUFFIX_CHARS[i]}`;
    if (!existingSlugs.has(candidate)) {
      return candidate;
    }
  }

  throw new Error("slug collision could not be resolved");
}
