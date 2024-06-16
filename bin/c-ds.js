#!/usr/bin/env -S node

'use strict';

const program = require('commander');
const { missingCommand } = require('./lib/c');

program
    .command('handle', 'Manage your Idearium handle.')
    .command('mk', 'Manage your minikube name.')
    .command('dev', 'Manage your dev computer name.')
    .command('pc', 'Manage your computer name.')
    .command('target', 'Manage your deployment target.')
    .parse(process.argv);

missingCommand(program);
