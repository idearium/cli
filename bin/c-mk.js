'use strict';

const program = require('commander');
const { missingCommand } = require('./lib/c');

// The basic program, which uses sub-commands.
program
    .command('delete', 'Delete minikube')
    .command(
        'docker-env',
        "Setup the docker command to use Minikube's Docker daemon"
    )
    .command('hosts', "Add Minikube's IP to your hosts record")
    .command('ip', "Retrieve Minikube's IP")
    .command('restart', 'Restart minikube')
    .command('ssh', 'Run a command in minikube')
    .command('start', 'Start minikube')
    .command('stop', 'Stop minikube')
    .parse(process.argv);

missingCommand(program);
