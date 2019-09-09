#!/usr/bin/env node

'use strict';

const program = require('commander');
const { newline, npmAuthToken } = require('./lib/c');

// The basic program, which uses sub-commands.
program
    .option('-n', 'Do not print the trailing newline character.')
    .parse(process.argv);

npmAuthToken().then((token) =>
    process.stdout.write(`${token}${newline(program.N)}`)
);
