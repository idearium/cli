#!/usr/bin/env node

'use strict';

const program = require('commander');
const { missingCommand } = require('./lib/c');

// The basic program, which uses sub-commands.
program
    .command('connect [env]', 'Connect to a remote database.')
    .parse(process.argv);

missingCommand(program);
