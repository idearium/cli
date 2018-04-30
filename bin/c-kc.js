#!/usr/bin/env node

'use strict';

const program = require('commander');
const { missingCommand } = require('./lib/c');

program
    .command('apply', 'Execute `kubectl apply` against the current environment.')
    .command('build <location>', 'Build a defined Docker location. Use `all` to build all locations.')
    .command('clean <location>', 'Clean images specific to a Docker location.')
    .command('context', 'Get and set the kubectrl context.')
    .parse(process.argv);

missingCommand(program);
