#!/usr/bin/env node

'use strict';

const program = require('commander');
const { spawn } = require('child_process');
const { reportError } = require('./lib/c');

// The basic program, which uses sub-commands.
program
    .arguments('<location>')
    .arguments('[command]')
    .parse(process.argv);

const [location, command] = program.args;

if (!location) {
    return reportError(new Error('Please provide a location'), program);
}

if (!command) {
    return reportError(new Error('Please provide a command'), program);
}

spawn(`c kc cmd exec $(c kc pod ${location}) -it ${command}`, {
    shell: true,
    stdio: 'inherit',
});
