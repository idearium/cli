#!/usr/bin/env node

'use strict';

const program = require('commander');
const { newline, reportError } = require('./lib/c');

program
    .arguments('<secret>')
    .option('-n', 'Do not print the trailing newline character.')
    .description('Base64 encode a string ready for a Kubernetes secret.')
    .parse(process.argv);

const [secret] = program.args;

if (!secret) {
    return reportError(new Error('You need to provide a secret'), program, true);
}

const encoded = Buffer.from(secret).toString('base64');

process.stdout.write(`${encoded}${newline(program.N)}`);
