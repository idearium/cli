#!/usr/bin/env node

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

const profile = program.P ? ` --profile ${program.P}` : '';
const command = `minikube delete${profile}`;

exec(command);
