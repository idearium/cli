#!/usr/bin/env -S node --trace-warnings

'use strict';

const program = require('commander');
const { exec } = require('shelljs');
const { npmAuthToken } = require('./lib/c');

// The basic program, which uses sub-commands.
program.arguments('[service]').parse(process.argv);

npmAuthToken().then((token) => {
    // ENV variables for shelljs
    const env = { NPM_AUTH_TOKEN: token };

    // Basic command.
    let command = 'docker-compose build';

    // Are we building all, or just one contaner?
    if (program.args.length) {
        const [image] = program.args;

        command = `${command} ${image}`;
    }

    // Using shelljs here.
    // Quicker than `child_process.execFile` because it doesn't require a full path to the binary.
    exec(command, { env });
});
