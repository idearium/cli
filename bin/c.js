#!/usr/bin/env node

'use strict';

const program = require('commander');
const { missingCommand } = require('./lib/c');

// The basic program, which uses sub-commands.
program
    .command('dc <command>', 'Shortcuts to control Docker Compose.')
    .command('d <command>', 'Shortcuts to control Docker.')
    .parse(process.argv);

missingCommand(program);
