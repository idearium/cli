#!/usr/bin/env node

'use strict';

const program = require('commander');
const { spawnSync } = require('child_process');
const { hostilePath, reportError } = require('./lib/c');

// The basic program, which uses sub-commands.
program.arguments('<domain>').parse(process.argv);

const [domain] = program.args;

if (!domain) {
    return reportError(
        new Error('You must pass the domain argument.'),
        program
    );
}

const { status, stderr } = spawnSync('sudo', [hostilePath(), 'remove', domain]);

if (status) {
    reportError(new Error(stderr.toString()), false, true);
}
