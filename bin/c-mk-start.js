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
const command = `minikube start${profile}`;

exec(
    `${command} --extra-config=apiserver.service-node-port-range=80-32767 --cpus=4 --memory=12288 --vm-driver=docker`
);
