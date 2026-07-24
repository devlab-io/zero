import { isToday, isThisMonth, differenceInCalendarMonths } from 'date-fns';
import { getBrowserTimezone } from './timezones';
import { formatInTimeZone } from 'date-fns-tz';
import { log } from '@/lib/log';

// w2cd (client weight): date-fns + date-fns-tz live here instead of lib/utils so
// the public shell (which imports lib/utils for `cn` via ui/button) doesn't ship
// the date stack. Only mail-app components use these helpers.

export const parseAndValidateDate = (dateString: string): Date | null => {
  try {
    // Handle empty input
    if (!dateString) {
      return null;
    }

    // Parse the date string to a Date object
    const dateObj = new Date(dateString);

    // Check if the date is valid
    if (isNaN(dateObj.getTime())) {
      log.error('Invalid date', dateString);
      return null;
    }

    return dateObj;
  } catch (error) {
    log.error('Error parsing date', error);
    return null;
  }
};

/**
 * Helper function to determine if a separate time display is needed
 * Returns false for emails from today or within last 12 hours since formatDate already shows time for these
 */
export const shouldShowSeparateTime = (dateString: string | undefined): boolean => {
  if (!dateString) return false;

  const dateObj = parseAndValidateDate(dateString);
  if (!dateObj) return false;

  const now = new Date();

  // Don't show separate time if email is from today
  if (isToday(dateObj)) return false;

  // Don't show separate time if email is within the last 12 hours
  const hoursDifference = (now.getTime() - dateObj.getTime()) / (1000 * 60 * 60);
  if (hoursDifference <= 12) return false;

  // Show separate time for older emails
  return true;
};

/**
 * Formats a date with different formatting logic based on parameters
 * Overloaded to handle both mail date formatting and notes date formatting
 */
export function formatDate(dateInput: string | Date | number): string {
  if (typeof dateInput === 'number') {
    dateInput = new Date(dateInput).toISOString();
  }

  // Notes formatting logic (when the date is a Date object)
  if (dateInput instanceof Date) {
    const date = typeof dateInput === 'string' ? new Date(dateInput) : (dateInput as Date);
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  // Original mail formatting logic
  const dateObj = parseAndValidateDate(dateInput as string);
  if (!dateObj) {
    return '';
  }

  try {
    const timezone = getBrowserTimezone();
    const now = new Date();

    // If it's today, always show the time
    if (isToday(dateObj)) {
      return formatInTimeZone(dateObj, timezone, 'h:mm a');
    }

    // Calculate hours difference between now and the email date
    const hoursDifference = (now.getTime() - dateObj.getTime()) / (1000 * 60 * 60);

    // If it's not today but within the last 12 hours, show the time
    if (hoursDifference <= 12) {
      return formatInTimeZone(dateObj, timezone, 'h:mm a');
    }

    // If it's this month or last month, show the month and day
    if (isThisMonth(dateObj) || differenceInCalendarMonths(now, dateObj) === 1) {
      return formatInTimeZone(dateObj, timezone, 'MMM dd');
    }

    // Otherwise show the date in MM/DD/YY format
    return formatInTimeZone(dateObj, timezone, 'MM/dd/yy');
  } catch (error) {
    log.error('Error formatting date', error);
    return '';
  }
}

export const formatTime = (date: string) => {
  const dateObj = parseAndValidateDate(date);
  if (!dateObj) {
    return '';
  }

  try {
    const timezone = getBrowserTimezone();

    // Always return the time in h:mm a format
    return formatInTimeZone(dateObj, timezone, 'h:mm a');
  } catch (error) {
    log.error('Error formatting time', error);
    return '';
  }
};
