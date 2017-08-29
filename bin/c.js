#!/usr/bin/env node

'use strict';

const program = require('commander');

// The basic program, which uses sub-commands.
program
    .command('dc <command>', 'Shortcuts to control Docker Compose.')
    .parse(process.argv);
