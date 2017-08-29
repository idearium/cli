#!/usr/bin/env node

'use strict';

const program = require('commander');
const { exec } = require('shelljs');
const { npmAuthToken } = require('./lib/c');

// The basic program, which uses sub-commands.
program
    .parse(process.argv);

npmAuthToken()
    .then((token) => {

        const env = { NPM_AUTH_TOKEN: token };

        // Using shelljs here.
        // Quicker than `child_process.execFile` because it doesn't require a full path to the binary.
        exec('docker-compose logs -f', { env });


    });
