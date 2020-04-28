#!/usr/bin/env node

'use strict';

const program = require('commander');
const { missingCommand } = require('./lib/c');

// The basic program, which uses sub-commands.
program
    .command('auth', 'Retrieves your NPM auth key from ~/.npmrc')
    .command(
        'proxy <location> [cmd...]',
        'Run an NPM command against an NPM location.'
    )
    .parse(process.argv);

missingCommand(program);
