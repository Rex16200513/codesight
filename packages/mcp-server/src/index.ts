#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { startStdioMcpServer, startStreamableHttpMcpServer } from './server.ts';

export * from './server.ts';
export * from './uiCards.ts';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const isHttp = process.argv.includes('--http');
  if (isHttp) {
    const portIdx = process.argv.indexOf('--port');
    const port = portIdx >= 0 ? Number(process.argv[portIdx + 1]) || 4318 : 4318;
    startStreamableHttpMcpServer(port);
  } else {
    startStdioMcpServer();
  }
}
