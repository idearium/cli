#!/usr/bin/env node

'use strict';

const program = require('commander');
const { missingCommand } = require('./lib/c');

program
    .command('apply <location>', 'Deploy a particular Kubernetes locations.')
    .command(
        'build <location>',
        'Build a defined Docker location. Use `all` to build all locations.'
    )
    .command('clean <location>', 'Clean images specific to a Docker location.')
    .command(
        'cmd [command...]',
        'Execute a kubectl command within the projects context and namespace.'
    )
    .command('context', 'Get and set the kubectl context.')
    .command(
        'deploy <location>',
        'Update all instances of a Docker location to the latest tag.'
    )
    .command('exec <location> <command>', 'Execute a command on a pod.')
    .command('logs', 'View all logs from Kubernetes pods.')
    .command('manifests', 'Compile the manifests.')
    .command('ngrok', 'Expose services to the world via Ngrok.')
    .command(
        'pod <location>',
        'Get the name of a pod for a Kubernetes location.'
    )
    .command('secret', 'Base64 encode a string, ready for a Kubernetes secret.')
    .command('start', 'Deploy all Kubernetes locations.')
    .command(
        'stop',
        'Stop and remove certain Kubernetes objects described in Kubernetes locations.'
    )
    .command('test <location>', 'Test a specific Docker location.')
    .description(
        "Helps run kubectl commands. Most commands run using the project's context, not kubectl's context."
    )
    .parse(process.argv);

missingCommand(program);
