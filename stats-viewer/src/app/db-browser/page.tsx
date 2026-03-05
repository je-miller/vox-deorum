// Server component wrapper for the DB Browser page.
// DbBrowser uses useSearchParams, so it must be wrapped in Suspense to avoid a
// Next.js static-render error (https://nextjs.org/docs/messages/missing-suspense-with-csr-bailout).

import { Suspense } from 'react';
import DbBrowser from '@/components/DbBrowser';

export default function DbBrowserPage() {
  return (
    <Suspense fallback={<div className="text-center py-12 text-muted-foreground">Loading...</div>}>
      <DbBrowser />
    </Suspense>
  );
}
