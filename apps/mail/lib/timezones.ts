import { log } from '@/lib/log';

export const getBrowserTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export const isValidTimezone = (timezone: string) => {
  try {
    return Intl.supportedValuesOf('timeZone').includes(timezone);
  } catch (error) {
    log.error(error);
    return false;
  }
};
