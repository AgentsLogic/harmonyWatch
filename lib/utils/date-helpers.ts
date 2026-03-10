/**
 * Parse a date string (YYYY-MM-DD) as a local date, avoiding UTC timezone issues
 * This ensures dates are interpreted in the user's timezone
 */
export function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  // Use local date constructor to avoid UTC interpretation
  return new Date(year, month - 1, day);
}

/**
 * Format a date string (YYYY-MM-DD) for display in the user's locale and timezone
 * Dates are cyclical (same month/day every year), so always show current year
 * For Old Calendar: Display date as (episode date + 13 days) with current year
 * For New Calendar: Display the episode's month/day with current year
 */
export function formatDateForDisplay(dateStr: string | null | undefined, locale: string = 'default', calendarType: 'new' | 'old' = 'new', todayDateStr?: string): string {
  if (!dateStr) return '';
  
  // Parse as local date to respect user's timezone
  const episodeDate = parseLocalDate(dateStr);
  const today = new Date();
  const currentYear = today.getFullYear();
  
  if (calendarType === 'old') {
    // For Old Calendar: Add 13 days to episode date, but use current year
    // This ensures that if content is assigned to November 20th, it displays as December 3rd
    const displayDate = new Date(episodeDate);
    // Add 13 days to the episode date
    displayDate.setDate(displayDate.getDate() + 13);
    // Use current year (dates are cyclical - same month/day every year)
    displayDate.setFullYear(currentYear);
    
    return displayDate.toLocaleDateString(locale, { 
      month: 'long', 
      day: 'numeric', 
      year: 'numeric',
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
    });
  }
  
  // For New Calendar: Show episode's month/day but use current year (dates are cyclical)
  const displayDate = new Date(episodeDate);
  displayDate.setFullYear(currentYear);
  
  return displayDate.toLocaleDateString(locale, { 
    month: 'long', 
    day: 'numeric', 
    year: 'numeric',
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
  });
}

/**
 * Adjust a date string for Old Calendar (subtract 13 days)
 * Returns a date string in YYYY-MM-DD format
 */
export function adjustDateForOldCalendar(dateStr: string): string {
  const date = parseLocalDate(dateStr);
  date.setDate(date.getDate() - 13);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get today's date string in YYYY-MM-DD format, adjusted for Old Calendar if needed
 */
export function getTodayDateString(calendarType: 'new' | 'old' = 'new'): string {
  const today = new Date();
  
  if (calendarType === 'old') {
    const adjustedDate = new Date(today.getTime() - 13 * 24 * 60 * 60 * 1000);
    const year = adjustedDate.getFullYear();
    const month = String(adjustedDate.getMonth() + 1).padStart(2, '0');
    const day = String(adjustedDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } else {
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

