#!/usr/bin/env node

'use strict';

const program = require('commander');
const { missingCommand } = require('./lib/c');

program
    .command('context', 'Get and set the kubectrl context.')
    .command('build <location>', 'Build a defined Docker location. Use `all` to build all locations.')
    .parse(process.argv);

missingCommand(program);
