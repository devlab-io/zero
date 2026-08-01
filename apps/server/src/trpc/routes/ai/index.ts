import { compose, generateEmailSubject } from './compose';
import { generateSearchQuery } from './search';
import { rewriteEmail } from './rewrite';
import { webSearch } from './webSearch';
import { router } from '../../trpc';

export const aiRouter = router({
  generateSearchQuery,
  compose,
  generateEmailSubject,
  rewriteEmail,
  webSearch,
});
