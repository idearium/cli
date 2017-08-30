#!/usr/bin/env node

'use strict';

const program = require('commander');

// The basic program, which uses sub-commands.
program
    .command('images', 'Removes unused images.')
    .command('containers', 'Removes unused containers.')
    .parse(process.argv);
