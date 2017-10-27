#!/usr/bin/env node

'use strict';

const program = require('commander');
const { missingCommand } = require('./lib/c');

// The basic program, which uses sub-commands.
program
    .command('clean <type>', 'Removes unused containers and images')
    .command('images', 'List images')
    .command('ps', 'List containers')
    .parse(process.argv);

missingCommand(program);
