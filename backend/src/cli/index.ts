#!/usr/bin/env node

import { startApiServer } from '../web/server.js';

const port = parsePort(process.argv[2] ?? process.env.PORT);
startApiServer({ port });

function parsePort(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    console.error(`Invalid port "${value}". Expected an integer between 1 and 65535.`);
    process.exit(1);
  }
  return port;
}
