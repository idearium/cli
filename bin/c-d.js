#!/usr/bin/env -S node --trace-warnings

'use strict';

const program = require('commander');
const { missingCommand } = require('./lib/c');

// The basic program, which uses sub-commands.
program
    .command('build <location>', 'Builds a Docker image from a Docker location')
    .command('clean <type>', 'Removes unused containers and images')
    .command('images', 'List images')
    .command('ps', 'List containers')
    .parse(process.argv);

missingCommand(program);
