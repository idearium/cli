#!/usr/bin/env node

'use strict';

const program = require('commander');
const { exec } = require('shelljs');
const { npmAuthToken } = require('./lib/c');

// The basic program, which uses sub-commands.
program
    .option('-n', 'Do not print the trailing newline character.')
    .parse(process.argv);

// Should we use a newline?
const newline = (exclude) => exclude ? '' : '\n';

npmAuthToken()
    .then((token) => process.stdout.write(`${token}${newline(program.N)}`));
