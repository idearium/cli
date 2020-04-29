#!/usr/bin/env node

'use strict';

const program = require('commander');
const { missingCommand } = require('./lib/c');

// The basic program, which uses sub-commands.
program
    .command('d <command>', 'Shortcuts to control Docker.')
    .command('dc <command>', 'Shortcuts to control Docker Compose.')
    .command('gc <command>', 'Shortcuts to help with gcloud.')
    .command('hosts <command>', 'Shortcuts to help with hosts management.')
    .command('kc <command>', 'Shortcuts to help with kubectrl.')
    .command('fs <command>', 'Shortcuts to help with the file system.')
    .command('mk <command>', 'Shortcuts to control Minikube.')
    .command('mongo <command>', 'Shortcuts to help with the database.')
    .command('npm <command>', 'Shortcuts to help with NPM.')
    .command('project <command>', 'Shortcuts to help with project management.')
    .command('skaffold <command>', 'Shortcuts to help with Skaffold.')
    .command(
        'workflow <command>',
        'Common workflows that can be executed within the context of a project.'
    )
    .command('yarn <command>', 'Shortcuts to help with Yarn.')
    .parse(process.argv);

missingCommand(program);
