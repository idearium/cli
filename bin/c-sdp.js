#!/usr/bin/env node

'use strict';

const program = require('commander');
const { missingCommand } = require('./lib/c');

// The basic program, which uses sub-commands.
program
    .command(
        'bootstrap',
        "Bootstrap the devpop app onto the minikube instance for Section's devpop"
    )
    .command('delete', "Delete the minikube instance for Section's devpop")
    .command(
        'docker-env',
        "Setup the docker command to use the Docker daemon on the minikube instance for Section's devpop"
    )
    .command('gm', 'Interact with the sectionio submodule.')
    .command(
        'ip',
        "Retrieve the IP of the minikube instance for Section's devpop"
    )
    .command('kc', 'Shortcuts to help with kubectl')
    .command(
        'service',
        "Interact with the service command for the minikube instance for Section's devpop"
    )
    .command(
        'ssh',
        "Run a command in the minikube instance for Section's devpop"
    )
    .command('devpop', 'Interact with the devpop')
    .command('start', "Start the minikube instance for Section's devpop")
    .command('stop', "Stop the minikube instance for Section's devpop")
    .command('url', "Retrieve the URL Section's devpop app")
    .parse(process.argv);

missingCommand(program);
