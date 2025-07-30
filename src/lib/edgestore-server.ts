import { initEdgeStore } from '@edgestore/server';
import { createEdgeStoreNextHandler } from '@edgestore/server/adapters/next/app';

const es = initEdgeStore.create();

/**
 * This is the main router for the EdgeStore buckets.
 */
const edgeStoreRouter = es.router({
  publicFiles: es.fileBucket({
    maxSize: 1024 * 1024 * 10, // 10MB
    accept: ['application/pdf'],
  }),
});

const handler = createEdgeStoreNextHandler({
  router: edgeStoreRouter,
});

export { handler };
export type EdgeStoreRouter = typeof edgeStoreRouter;
