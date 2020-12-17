#!/usr/bin/env -S node --trace-warnings

'use strict';

const program = require('commander');
const { missingCommand } = require('./lib/c');

program
    .command('set <env>', 'Configures the active environment.')
    .command('get', 'Gets the current active environment.')
    .command('ls', 'Lists the defined project environments.')
    .parse(process.argv);

missingCommand(program);
