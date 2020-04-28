#!/usr/bin/env node

'use strict';

const program = require('commander');
const { exec } = require('shelljs');
const { loadConfig, reportError } = require('./lib/c');

program.parse(process.argv);

loadConfig('gcloud')
    .then((gcloud) => {
        const { clusterName } = gcloud;

        exec(`c gc cmd container clusters create ${clusterName}`);
        exec(`c gc cmd container clusters get-credentials ${clusterName}`);
    })
    .catch((err) => {
        return reportError(err, false, true);
    });
