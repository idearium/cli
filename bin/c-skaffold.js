#!/usr/bin/env -S node --trace-warnings

'use strict';

const program = require('commander');
const { missingCommand } = require('./lib/c');

program
    .command(
        'build <location>',
        'Build a defined Docker location, using the Skaffold custom build script contract.'
    )
    .command(
        'dev',
        'A proxy for skaffold dev that will compile manifests before running skaffold.'
    )
    .description('Commands to make working with Skaffold easier.')
    .parse(process.argv);

missingCommand(program);
