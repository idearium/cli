#!/usr/bin/env node

'use strict';

const program = require('commander');
const { missingCommand } = require('./lib/c');

program
    .command('set <env>', 'Configures the active environment.')
    .command('get', 'Gets the current active environment.')
    .parse(process.argv);

missingCommand(program);
