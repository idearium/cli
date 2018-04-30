#!/usr/bin/env node

'use strict';

const program = require('commander');
const { missingCommand } = require('./lib/c');

program
    .command('apply', 'Deploy all Kubernetes locations.')
    .command('build <location>', 'Build a defined Docker location. Use `all` to build all locations.')
    .command('clean <location>', 'Clean images specific to a Docker location.')
    .command('deploy <location>', 'Update all instances of a Docker location to the latest tag.')
    .command('context', 'Get and set the kubectrl context.')
    .command('stop', 'Stop and remove certain Kubernetes objects described in Kubernetes locations.')
    .parse(process.argv);

missingCommand(program);
