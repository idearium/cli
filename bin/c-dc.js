'use strict';

const program = require('commander');
const { missingCommand } = require('./lib/c');

// The basic program, which uses sub-commands.
program
    .command('build [service]', 'Build services')
    .command('env <setting> <value>', 'Set Docker Compose .env file settings.')
    .command('down', 'Stop and remove containers, networks, images and volumes')
    .command('images', 'List images')
    .command('logs <service>', 'View output from containers')
    .command('ps', 'List containers')
    .command('pull', 'Pull service images')
    .command('rebuild [service]', 'Rebuild and restart a service')
    .command('up', 'Create and start containers')
    .parse(process.argv);

missingCommand(program);
