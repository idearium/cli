#!/usr/bin/env node

'use strict';

const program = require('commander');
const { exec } = require('shelljs');

// The basic program, which uses sub-commands.
program
    .option('-a, --all', 'Show all containers (default shows just running)')
    .parse(process.argv);

const parts = ['docker', 'ps'];

/* eslint-disable padded-blocks */
if (program.all) {
    parts.push('-a');
}
/* eslint-enable padded-blocks */

exec(parts.join(' '));
