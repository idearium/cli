#!/usr/bin/env node

'use strict';

const program = require('commander');
const { missingCommand } = require('./lib/c');

// The basic program, which uses sub-commands.
program
    .command('checkout', 'Checkout and optionally create a branch.')
    .command('cmd', 'Execute a git command against the sectionio submodule.')
    .command(
        'push',
        'Push the state of the sectionio submodule to the devepop.'
    )
    .command(
        'remote',
        'Setup a remote in the sectionio submodule to the devpop.'
    )
    .parse(process.argv);

missingCommand(program);
