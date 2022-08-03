#!/usr/bin/env -S node --trace-warnings

'use strict';

const program = require('commander');
const { exec } = require('shelljs');
const { newline, reportError } = require('./lib/c');
const { app } = require('./lib/c-ts');

program
    .arguments('<name>')
    .description(
        'Retrieves the IP address for a machine on Tailscale. Defaults to the current machine.'
    )
    .option('-n', 'Do not print the trailing newline character.')
    .option('-4', 'Only find the IPv4 address (default).')
    .option('-6', 'Only find the IPv6 address.')
    .parse(process.argv);

const [name = ''] = program.args;
const ipFlag = program[6] ? '-6' : '-4';

const command = `${app} ip ${ipFlag} ${name}`;

exec(command, { silent: true }, (err, stdout) => {
    if (err) {
        return reportError(err, false, true);
    }

    process.stdout.write(
        `${stdout.replace(/\n/, '', 'g')}${newline(program.N)}`
    );
});
