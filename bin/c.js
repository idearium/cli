#!/usr/bin/env node

'use strict';

const program = require('commander');
const { missingCommand, spawnWithExitCode } = require('./lib/c');

// Commander's git-style dispatch re-parses subcommand args at every layer
// before spawning (dropping -- and unknown options, breaking passthroughs
// like `c op cmd run -- sh -c ...` and `c kc cmd` commands carrying
// kubectl flags), so the passthrough-owning subtrees are dispatched with
// the verbatim argv instead - their own cmd guards carry it the rest of
// the way down.
const VERBATIM_DISPATCH = {
    kc: 'c-kc.js',
    op: 'c-op.js',
};

const verbatimChild = VERBATIM_DISPATCH[process.argv[2]];

if (verbatimChild) {
    const { join } = require('path');

    spawnWithExitCode({
        args: [join(__dirname, verbatimChild)].concat(process.argv.slice(3)),
        command: 'node',
    });

    return;
}

// The basic program, which uses sub-commands.
program
    .command('d <command>', 'Shortcuts to control Docker.')
    .command('dc <command>', 'Shortcuts to control Docker Compose.')
    .command('dev <command>', 'Shortcuts to manage your dev computer.')
    .command('gc <command>', 'Shortcuts to help with gcloud.')
    .command('ds <command>', 'Shortcuts to manage DevSpace.')
    .command('hosts <command>', 'Shortcuts to help with hosts management.')
    .command('kc <command>', 'Shortcuts to help with kubectl.')
    .command('fs <command>', 'Shortcuts to help with the file system.')
    .command('mk <command>', 'Shortcuts to control Minikube.')
    .command('mongo <command>', 'Shortcuts to help with the database.')
    .command('npm <command>', 'Shortcuts to help with NPM.')
    .command('op <command>', 'Shortcuts to manage 1Password secret values.')
    .command('project <command>', 'Shortcuts to help with project management.')
    .command('sdp <command>', "Shortcuts to help with Section's devpop.")
    .command(
        'secrets <command>',
        'Shortcuts to manage project secrets across their stores.'
    )
    .command('skaffold <command>', 'Shortcuts to help with Skaffold.')
    .command('ts <command>', 'Shortcuts to help with Tailscale.')
    .command(
        'workflow <command>',
        'Common workflows that can be executed within the context of a project.'
    )
    .parse(process.argv);

missingCommand(program);
