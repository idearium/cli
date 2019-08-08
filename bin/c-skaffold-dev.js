#!/usr/bin/env node

'use strict';

const program = require('commander');
const { exec } = require('shelljs');

program
    .description(
        'This command should be used to run skaffold dev. It will compile manifests before running skaffold dev.',
    )
    .parse(process.argv);

exec(`yarn c kc manifests`);
exec(`skaffold dev`);
