#!/usr/bin/env node

'use strict';

const program = require('commander');
const { spawnSync } = require('child_process');
const { hostilePath, reportError } = require('./lib/c');

let ip;
let domains;

// The basic program, which uses sub-commands.
program
    .arguments('<ip> <domain...>')
    .action((ipValue, domainsValue) => {
        ip = ipValue;
        domains = domainsValue;
    })
    .parse(process.argv);

if (!ip) {
    return reportError(new Error('You must pass the ip argument.'), program);
}

if (!domains) {
    return reportError(new Error('You must pass the domain argument.'), program);
}

const { status, stderr } = spawnSync('sudo', [hostilePath(), 'set', ip, domains.toString(' ')]);

if (status) {
    reportError(new Error(stderr.toString()), false, true);
}
