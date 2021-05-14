#!/usr/bin/env -S node --trace-warnings

'use strict';

const program = require('commander');
const { exec } = require('shelljs');

// The basic program, which uses sub-commands.
program
    .option(
        '-p [profile]',
        'Specify a minikube profile, otherwise the default minikube profile will be used.'
    )
    .parse(process.argv);

const profile = program.P ? ` -p ${program.P}` : '';
const stopCommand = `c mk stop${profile}`;
const startCommand = `c mk start${profile}`;

exec(stopCommand);
exec(startCommand);
