#!/usr/bin/env -S node

'use strict';

const program = require('commander');
const { missingCommand } = require('./lib/c');

program
    .command('ip <machine-name>', 'Find the IP for a machine on Tailscale.')
    .parse(process.argv);

missingCommand(program);
