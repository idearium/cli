#!/usr/bin/env node

'use strict';

const program = require('commander');
const { exec } = require('shelljs');

// The basic program, which uses sub-commands.
program
    .parse(process.argv);

exec('minikube start --extra-config=apiserver.ServiceNodePortRange=80-32767 --memory=4096 --vm-driver=vmwarefusion');
