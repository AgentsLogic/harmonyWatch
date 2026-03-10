/**
 * Converts a title string to a URL-friendly slug
 * Examples:
 *   "Dust to Dust" -> "dust-to-dust"
 *   "The Lord's Prayer" -> "the-lords-prayer"
 *   "Episode 1: Introduction" -> "episode-1-introduction"
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    // Replace apostrophes and quotes with nothing
    .replace(/['"]/g, '')
    // Replace spaces and underscores with hyphens
    .replace(/[\s_]+/g, '-')
    // Remove all non-alphanumeric characters except hyphens
    .replace(/[^a-z0-9-]/g, '')
    // Replace multiple consecutive hyphens with a single hyphen
    .replace(/-+/g, '-')
    // Remove leading and trailing hyphens
    .replace(/^-+|-+$/g, '');
}
