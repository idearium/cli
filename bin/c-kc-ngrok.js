#!/usr/bin/env node

'use strict';

const program = require('commander');
const { exec } = require('shelljs');
const { formatProjectPrefix } = require('./lib/c-project');
const { loadConfig, reportError } = require('./lib/c');

const location = 'ngrok';

program
    .description('Expose services to the world via Ngrok.')
    .option('-s', 'Stops and removes the ngrok pod.')
    .parse(process.argv);

loadConfig()
    .then(config => new Promise((resolve, reject) => {

        const { project } = config;
        const { organisation, name } = project;
        const prefix = formatProjectPrefix(organisation, name, 'local', true, true);

        if (program.S) {

            exec(`c kc cmd delete pod ${location}`);

            return resolve();

        }

        // Apply the ngrok configuration.
        // eslint-disable-next-line no-unused-expressions
        exec(`c kc apply ${location}`, { silent: false }).stdout;

        exec(`kubectl run ${location} --image=stefanprodan/ngrok --overrides='{"spec":{"containers":[{"name":"ngrok","image":"stefanprodan/ngrok:latest","command":["./ngrok","start","-config=/home/ngrok/.ngrok2/ngrok.yaml","--all"],"volumeMounts":[{"name":"config","mountPath":"/home/ngrok/.ngrok2/"}]}],"volumes":[{"name":"config","configMap":{"name":"ngrok"}}]}}' --namespace=${prefix} --restart=Never --image-pull-policy=IfNotPresent -i --tty --rm`, (code, stdout, stderr) => {

            if (stderr) {
                return reject(new Error(stderr));
            }

            return resolve();

        });

        return resolve();

    }))
    .catch(reportError);
