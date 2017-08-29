#!/usr/bin/env node

'use strict';

const program = require('commander');

// The basic program, which uses sub-commands.
program
    .command('build [service]', 'Build or rebuild services')
    .command('env <setting> <value>', 'Set Docker Compose .env file settings.')
    .command('down', 'Stop and remove containers, networks, images and volumes')
    .command('images', 'List images')
    .command('logs', 'View output from containers')
    .command('pull', 'Pull service images')
    .command('ps', 'List containers')
    .command('up', 'Create and start containers')
    .parse(process.argv);
