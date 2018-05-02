#!/usr/bin/env node

'use strict';

const program = require('commander');
const { missingCommand } = require('./lib/c');

program
    .command('apply <location>', 'Deploy a particular Kubernetes locations.')
    .command('build <location>', 'Build a defined Docker location. Use `all` to build all locations.')
    .command('clean <location>', 'Clean images specific to a Docker location.')
    .command('context', 'Get and set the kubectrl context.')
    .command('deploy <location>', 'Update all instances of a Docker location to the latest tag.')
    .command('logs', 'View all logs from Kubernetes pods.')
    .command('start', 'Deploy all Kubernetes locations.')
    .command('stop', 'Stop and remove certain Kubernetes objects described in Kubernetes locations.')
    .parse(process.argv);

missingCommand(program);
