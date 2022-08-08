'use strict';

const program = require('commander');
const { missingCommand } = require('./lib/c');

program
    .command(
        'cmd [command...]',
        'Execute a gcloud command with the projects configuration.'
    )
    .command('create', 'Create a new cluster')
    .parse(process.argv);

missingCommand(program);
