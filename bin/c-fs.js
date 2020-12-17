#!/usr/bin/env -S node --trace-warnings

'use strict';

const program = require('commander');
const { missingCommand } = require('./lib/c');

program.command('symlink', 'Create a symlink').parse(process.argv);

missingCommand(program);
