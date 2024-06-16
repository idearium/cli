#!/usr/bin/env -S node

'use strict';

const program = require('commander');
const { missingCommand } = require('./lib/c');

program
    .command('get', 'Get your dev computer name.')
    .command('set <dev-name>', 'Set your dev computer name.')
    .parse(process.argv);

missingCommand(program);
