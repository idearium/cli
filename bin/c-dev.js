#!/usr/bin/env -S node

'use strict';

const program = require('commander');
const { missingCommand } = require('./lib/c');

program.command('ip', 'Manage your dev computer.').parse(process.argv);

missingCommand(program);
