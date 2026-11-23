import { pathToFileURL } from 'node:url';
import { startSidecarServer } from './server.ts';

export * from './server.ts';
export * from './mcpBridge.ts';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startSidecarServer();
}
