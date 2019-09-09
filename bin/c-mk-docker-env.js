#!/usr/bin/env node

'use strict';

const os = require('os');
const program = require('commander');
const execa = require('execa');
const { spawn } = require('child_process');

// The basic program, which uses sub-commands.
program
    .description(
        "Spawns a login shell with your current environment and additional Docker environment variables to use the Minikube's Docker daemon"
    )
    .option(
        '-p [profile]',
        'Specify a minikube profile, otherwise the default minikube profile will be used.'
    )
    .parse(process.argv);

const profile = program.P ? ` --profile ${program.P}` : '';
const command = `minikube docker-env${profile}`;

Promise.all([
    // The Docker environment variables we need
    execa.shell(command),
    // The current shell's environment
    execa.shell('env'),
]).then(([{ stdout: minikubeStdOut }, { stdout: envStdOut }]) => {
    // Format the Docker environment variables with the current shell's variables
    const shellExports = minikubeStdOut
        .split(os.EOL)
        .filter((line) => line.indexOf('export') === 0)
        .map((line) => line.substr(7).replace(/"/g, ''))
        .concat(envStdOut.split(os.EOL));

    // Turn the environment variables into an object
    const env = {};

    shellExports.forEach((line) => {
        const [name, value] = line.split('=');

        env[name] = value;
    });

    // Create our new login shell
    spawn('/bin/bash', ['--login'], {
        env,
        stdio: 'inherit',
    });
});
