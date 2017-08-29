#!/usr/bin/env node

'use strict';

const program = require('commander');

// The basic program, which uses sub-commands.
program
    .command('file <value>', 'Set the COMPOSE_FILE value.')
    .parse(process.argv);
