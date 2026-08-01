import { Navigate } from 'react-router';

export default function QueuePage() {
  // Legacy deep links remain valid, but Queue is now one surface inside Drafts.
  return <Navigate to="/mail/draft?view=agent" replace />;
}
