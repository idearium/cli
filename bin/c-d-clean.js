#!/usr/bin/env -S node --trace-warnings

'use strict';

const program = require('commander');
const { missingCommand } = require('./lib/c');

// The basic program, which uses sub-commands.
program
    .command('images', 'Removes unused images.')
    .command('containers', 'Removes unused containers.')
    .parse(process.argv);

missingCommand(program);
