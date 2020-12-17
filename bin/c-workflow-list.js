#!/usr/bin/env -S node --trace-warnings

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
    projectWorkflows.forEach((workflow) => {
        const isAvailable = workflow.include ? '' : ' (n/a)';
        const label = `- ${workflow.name}${isAvailable}`.padEnd(20);

        out(`${label}${workflow.description}`);

        if (workflow.include && workflow.status !== 'ok') {
            out(`\n\t\tCaught error: "${workflow.error.toString()}"\n`);
        }
    });
    out('\n');
}
