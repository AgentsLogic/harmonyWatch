/**
 * Generate a unique 7-character short ID
 * Uses base36 encoding (0-9, a-z) for URL-safe characters
 */
export function generateShortId(): string {
  // Generate a random 7-character string using base36
  // This gives us 36^7 = ~78 billion possible combinations
  const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < 7; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

/**
 * Validate that a string is a valid short ID format (7 characters, alphanumeric lowercase)
 */
export function isValidShortId(id: string): boolean {
  return /^[0-9a-z]{7}$/.test(id);
}







