#!/usr/bin/env node

'use strict';

const program = require('commander');
const { getAll } = require('./lib/c-workflow');

// eslint-disable-next-line no-console
const out = (...args) => console.log.apply(null, args);

program
    .description('List all workflows supported by this project.')
    .parse(process.argv);

const projectWorkflows = getAll();

if (!projectWorkflows.length) {
    out('There are no available workflows.');
}

if (projectWorkflows.length) {
    out('\nAvailable workflows:\n');
    projectWorkflows.forEach(workflow => out(`- ${workflow.name}\t\t${workflow.description}`));
    out('\n');
}
