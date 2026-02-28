#!/usr/bin/env node

const { runCli } = require('../src/cli');

runCli(process.argv.slice(2)).catch((error) => {
  console.error('[ACE] Fatal:', error.message);
  process.exit(1);
});
