#!/usr/bin/env node

'use strict';

const program = require('commander');
const { spawnSync } = require('child_process');
const { hostilePath, reportError } = require('./lib/c');

// The basic program, which uses sub-commands.
program
    .arguments('<ip> <domain>')
    .parse(process.argv);

const [ip, domain] = program.args;

if (!ip) {
    return reportError(new Error('You must pass the ip argument.'), program);
}

if (!domain) {
    return reportError(new Error('You must pass the domain argument.'), program);
}

const { status, stderr } = spawnSync('sudo', [hostilePath(), 'set', ip, domain]);

if (status) {
    reportError(new Error(stderr.toString()), false, true);
}
