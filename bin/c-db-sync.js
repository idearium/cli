#!/usr/bin/env node

'use strict';

const program = require('commander');
const { spawn } = require('child_process');
const { reportError } = require('./lib/c');

// The basic program, which uses sub-commands.
program
    .arguments('[env]')
    .parse(process.argv);

if (!program.args.length) {
    return reportError(new Error('Please provide an environment'), program);
}

const [env] = program.args;

if (env.toLowerCase() === 'local') {
    return reportError(new Error('You cannot sync the local database'), program);
}

spawn(`c db download ${env} && c db import ${env}`, {
    shell: true,
    stdio: 'inherit',
});
