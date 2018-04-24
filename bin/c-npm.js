#!/usr/bin/env node

'use strict';

const program = require('commander');
const { missingCommand } = require('./lib/c');

// The basic program, which uses sub-commands.
program
    .command('auth', 'Retrieves your NPM auth key from ~/.npmrc')
    .parse(process.argv);

missingCommand(program);
