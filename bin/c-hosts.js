#!/usr/bin/env node

'use strict';

const program = require('commander');
const { missingCommand } = require('./lib/c');

// The basic program, which uses sub-commands.
program
    .command('add <ip> <domain>', 'A a record to /etc/hosts')
    .command('remove <ip> <domain>', 'Remove a record from /etc/hosts')
    .parse(process.argv);

missingCommand(program);
