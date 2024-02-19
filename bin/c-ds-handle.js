#!/usr/bin/env -S node --trace-warnings

'use strict';

const program = require('commander');
const { missingCommand } = require('./lib/c');

program
    .command('get', 'Get your handle.')
    .command('set <handle>', 'Set your handle.')
    .parse(process.argv);

missingCommand(program);
