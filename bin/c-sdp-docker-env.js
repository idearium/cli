'use strict';

const os = require('os');
const program = require('commander');
const { spawn } = require('child_process');

// The basic program, which uses sub-commands.
program
    .description(
        "Spawns a login shell with your current environment and additional Docker environment variables to use the Minikube's Docker daemon"
    )
    .parse(process.argv);

import('execa')
    .then(({ execa }) =>
        Promise.all([
            // The Docker environment variables we need
            execa('minikube docker-env --profile section', { shell: true }),
            // The current shell's environment
            execa('env', { shell: true }),
        ])
    )
    .then(([{ stdout: minikubeStdOut }, { stdout: envStdOut }]) => {
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
        spawn('/bin/zsh', ['--login'], {
            env,
            stdio: 'inherit',
        });
    });
