#!/usr/bin/env node

'use strict';

const program = require('commander');
const hostile = require('hostile');
const { reportError } = require('./lib/c');

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

// Create the record
hostile.remove(ip, domain, (err) => {

    if (err) {
        return reportError(err);
    }

});
