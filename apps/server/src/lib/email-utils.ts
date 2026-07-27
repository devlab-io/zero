// Moved to packages/types/src/email-utils.ts (pitbull quality/pitbull, GAP 1) —
// this file was ~150 lines near-identical to apps/mail/lib/email-utils.ts.
// Re-exported here so every existing `from '../lib/email-utils'` /
// `from './email-utils'` import keeps working unchanged. getListUnsubscribeAction
// is wrapped to preserve the server-only debug log on parse failure (the shared
// version takes that as an optional callback so the package itself stays
// logger-free).
import { getListUnsubscribeAction as _getListUnsubscribeAction } from '@zero/types';
import { logger } from './logger';

export {
  parseFrom,
  parseAddressList,
  cleanEmailAddresses,
  formatRecipients,
  formatMimeRecipients,
  wasSentWithTLS,
} from '@zero/types';

export const getListUnsubscribeAction: typeof _getListUnsubscribeAction = (args) =>
  _getListUnsubscribeAction(args, () => logger.debug('List-Unsubscribe URL parse failed'));
