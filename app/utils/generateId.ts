/**
 * Generates a unique ID without external dependencies
 * 
 * This function creates a unique ID by combining:
 * 1. Current timestamp
 * 2. Random number
 * 3. Optional prefix
 * 
 * @param prefix Optional prefix for the ID
 * @returns A unique string ID
 */
export function generateId(prefix: string = ''): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 10);
  return `${prefix}${timestamp}${randomPart}`;
}

/**
 * Generates a URL-friendly ID
 * 
 * @param prefix Optional prefix for the ID
 * @returns A URL-friendly unique string ID
 */
export function generateUrlId(prefix: string = ''): string {
  return generateId(prefix).replace(/[^a-z0-9]/gi, '');
}