#!/usr/bin/env -S node --trace-warnings

'use strict';

const program = require('commander');
const { missingCommand } = require('./lib/c');

program
    .command('get', 'Get your pc name.')
    .command('set <pc-name>', 'Set your pc name.')
    .parse(process.argv);

missingCommand(program);
