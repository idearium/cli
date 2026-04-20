'use strict';

const os = require('os');
const program = require('commander');
const { exec } = require('shelljs');

// The basic program, which uses sub-commands.
program
    .option(
        '-p [profile]',
        'Specify a minikube profile, otherwise the default minikube profile will be used.'
    )
    .parse(process.argv);

const platform = os.platform();
const profile = program.P ? ` --profile ${program.P}` : '';
const command = `minikube start${profile}`;

const defaultSettings = {
    cpus: 4,
    memory: 12288,
};
const settings = {
    darwin: defaultSettings,
    linux: {
        cpus: 12,
        memory: 24576,
    },
};

exec(
    `${command} --extra-config=apiserver.service-node-port-range=80-32767 --cpus=${
        (settings[platform] ?? defaultSettings).cpus
    } --memory=${
        (settings[platform] ?? defaultSettings).memory
    } --vm-driver=docker`
);
