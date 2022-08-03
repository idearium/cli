#!/usr/bin/env -S node --trace-warnings

'use strict';

const program = require('commander');
const { missingCommand } = require('./lib/c');

program
    .command('get', 'Get your Minikube name.')
    .command('set <minikube-name>', 'Set your Minikube name.')
    .parse(process.argv);

missingCommand(program);
