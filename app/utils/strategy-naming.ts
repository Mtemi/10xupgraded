/**
 * Utility functions for generating and validating strategy names
 * according to Freqtrade conventions.
 */

/**
 * Generates a valid strategy name that follows Freqtrade conventions:
 * - Must be a valid Python class name
 * - Must start with a capital letter
 * - Should be descriptive of the strategy
 * 
 * @param baseName Optional base name to include in the strategy name
 * @returns A valid strategy name
 */
export function generateStrategyName(baseName?: string): string {
  console.log('[generateStrategyName] Starting with baseName:', baseName);
  
  // Start with a capital letter prefix if baseName doesn't provide one
  let name = "";
  
  // Process base name if provided
  if (baseName && baseName.trim()) {
    console.log('[generateStrategyName] Processing provided baseName:', baseName.trim());
    // Convert to PascalCase
    const words = baseName.trim().split(/[\s_-]+/);
    console.log('[generateStrategyName] Split words:', words);
    
    name = words.map(word => 
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join('');
    console.log('[generateStrategyName] After PascalCase conversion:', name);
  } else {
    // Default to "Strategy" prefix
    name = "Strategy";
    console.log('[generateStrategyName] Using default name:', name);
  }
  
  // Ensure name follows Python class naming conventions
  const beforeClean = name;
  name = name.replace(/[^a-zA-Z0-9]/g, '');
  console.log('[generateStrategyName] After removing non-alphanumeric:', name, beforeClean !== name ? '(changed)' : '(unchanged)');
  
  // Ensure it starts with a capital letter
  const startsWithCapital = /^[A-Z]/.test(name);
  console.log('[generateStrategyName] Starts with capital letter:', startsWithCapital);
  
  if (!startsWithCapital) {
    name = 'Strategy' + name;
    console.log('[generateStrategyName] Added Strategy prefix:', name);
  }
  
  // Ensure it's not too long (reasonable limit for class names)
  if (name.length > 50) {
    const oldName = name;
    name = name.substring(0, 50);
    console.log('[generateStrategyName] Trimmed long name:', oldName, '->', name);
  }
  
  console.log('[generateStrategyName] Final name:', name);
  return name;
}

/**
 * Converts a PascalCase class name to a snake_case file name
 * 
 * @param className The PascalCase class name
 * @returns A snake_case file name
 */
export function classNameToFileName(className: string): string {
  console.log('[classNameToFileName] Starting with className:', className);
  
  // Convert PascalCase to snake_case
  const fileName = className
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '') + '.py';
  
  console.log('[classNameToFileName] Converted to fileName:', fileName);
  return fileName;
}

/**
 * Extracts the strategy class name from Python code
 * 
 * @param code The Python code content
 * @returns The strategy class name or null if not found
 */
export function extractStrategyClassName(code: string): string | null {
  console.log('[extractStrategyClassName] Analyzing code of length:', code?.length || 0);
  
  if (!code) {
    console.log('[extractStrategyClassName] No code provided, returning null');
    return null;
  }
  
  // Look for class definition that inherits from IStrategy
  const classMatch = code.match(/class\s+(\w+)\s*\(\s*IStrategy\s*\)/);
  if (classMatch && classMatch[1]) {
    console.log('[extractStrategyClassName] Found IStrategy class:', classMatch[1]);
    return classMatch[1];
  }
  
  console.log('[extractStrategyClassName] No IStrategy class found, looking for any class');
  
  // Fallback to any class definition if IStrategy not found
  const anyClassMatch = code.match(/class\s+(\w+)\s*\(/);
  if (anyClassMatch && anyClassMatch[1]) {
    console.log('[extractStrategyClassName] Found generic class:', anyClassMatch[1]);
    return anyClassMatch[1];
  }
  
  console.log('[extractStrategyClassName] No class definition found, returning null');
  return null;
}

/**
 * Validates if a string is a valid Python class name
 * 
 * @param name The name to validate
 * @returns True if valid, false otherwise
 */
export function isValidStrategyName(name: string): boolean {
  console.log('[isValidStrategyName] Validating name:', name);
  
  // Must be a valid Python identifier
  const pythonIdentifierRegex = /^[A-Za-z_][A-Za-z0-9_]*$/;
  const isValidIdentifier = pythonIdentifierRegex.test(name);
  console.log('[isValidStrategyName] Is valid Python identifier:', isValidIdentifier);
  
  // Additional check: must start with a capital letter (for class naming)
  const startsWithCapital = /^[A-Z]/.test(name);
  console.log('[isValidStrategyName] Starts with capital letter:', startsWithCapital);
  
  const isValid = isValidIdentifier && startsWithCapital;
  console.log('[isValidStrategyName] Final result:', isValid);
  return isValid;
}

/**
 * Updates the class name in a Freqtrade strategy code
 * 
 * @param code The original Python code
 * @param newClassName The new class name to use
 * @returns The updated code with the new class name
 */
export function updateStrategyClassName(code: string, newClassName: string): string {
  console.log('[updateStrategyClassName] Updating class name to:', newClassName);
  
  if (!code) {
    console.log('[updateStrategyClassName] No code provided, returning original');
    return code;
  }
  
  // First extract the current class name
  const currentClassName = extractStrategyClassName(code);
  console.log('[updateStrategyClassName] Current class name:', currentClassName);
  
  if (!currentClassName) {
    console.log('[updateStrategyClassName] No current class name found');
    
    // If no class name found, try to insert one
    const classDefinitionMatch = code.match(/class\s+(\w+)\s*\(/);
    if (classDefinitionMatch) {
      console.log('[updateStrategyClassName] Found generic class definition:', classDefinitionMatch[1]);
      
      const updatedCode = code.replace(
        new RegExp(`class\\s+${classDefinitionMatch[1]}\\s*\\(`),
        `class ${newClassName}(`
      );
      
      console.log('[updateStrategyClassName] Updated generic class definition');
      return updatedCode;
    }
    
    // If still no class definition found, can't update
    console.log('[updateStrategyClassName] No class definition found, returning original code');
    return code;
  }
  
  // Replace the class definition
  console.log('[updateStrategyClassName] Replacing class definition from', currentClassName, 'to', newClassName);
  
  try {
    const updatedCode = code.replace(
      new RegExp(`class\\s+${currentClassName}\\s*\\(\\s*IStrategy\\s*\\)`, 'g'),
      `class ${newClassName}(IStrategy)`
    );
    
    console.log('[updateStrategyClassName] Class name updated successfully');
    return updatedCode;
  } catch (error) {
    console.error('[updateStrategyClassName] Error updating class name:', error);
    return code;
  }
}

/**
 * Normalizes a strategy name by removing timestamps and random characters
 * 
 * @param name The strategy name to normalize
 * @returns The normalized strategy name
 */
export function normalizeStrategyName(name: string): string {
  console.log('[normalizeStrategyName] Starting with name:', name);
  
  // Remove .py extension if present
  let normalizedName = name.replace(/\.py$/, '');
  console.log('[normalizeStrategyName] After removing .py extension:', normalizedName);
  
  // Remove any timestamp or random characters
  const beforeNormalize = normalizedName;
  normalizedName = normalizedName.replace(/_\d{10,}.*$/, '');
  console.log('[normalizeStrategyName] After removing timestamp:', normalizedName, 
    beforeNormalize !== normalizedName ? '(changed)' : '(unchanged)');
  
  console.log('[normalizeStrategyName] Final normalized name:', normalizedName);
  return normalizedName;
}