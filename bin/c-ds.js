#!/usr/bin/env -S node --trace-warnings

'use strict';

const program = require('commander');
const { missingCommand } = require('./lib/c');

program
    .command('handle', 'Manage your Idearium handle.')
    .command('mk', 'Manage your Minikube name.')
    .command('pc', 'Manager your computer name.')
    .parse(process.argv);

missingCommand(program);
