#!/usr/bin/env node

'use strict';

const program = require('commander');
const { missingCommand } = require('./lib/c');

program
    .command(
        'build <location>',
        'Build a defined Docker location, using the Skaffold custom build script contract.',
    )
    .description('Commands to make working with Skaffold easier.')
    .parse(process.argv);

missingCommand(program);
