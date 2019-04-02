#!/usr/bin/env node

'use strict';

const program = require('commander');
const { exec } = require('shelljs');

// The basic program, which uses sub-commands.
program
    .parse(process.argv);

exec('minikube start --disk-size 64g --extra-config=apiserver.service-node-port-range=80-32767 --kubernetes-version v1.9.4 --memory=4096 --vm-driver=vmware');
