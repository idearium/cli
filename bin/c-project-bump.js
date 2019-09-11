#!/usr/bin/env node

'use strict';

const program = require('commander');
const { resolve: pathResolve } = require('path');
const { loadConfig, reportError } = require('./lib/c');
const semver = require('semver');
const gulp = require('gulp');
const replace = require('gulp-replace');
const chalk = require('chalk');
const clipboardy = require('clipboardy');
const fs = require('fs');

program
    .option('-t, --type <type>', 'The version bump type', 'patch')
    .parse(process.argv);

const { type } = program;
const { version: currentVersion } = require(`${pathResolve(
    process.cwd(),
    'package.json'
)}`);

// Always ensure we get beta.1, never beta.0.
let newVersion = semver.inc(currentVersion, type, 'beta');

if (newVersion.includes('beta.0')) {
    newVersion = semver.inc(newVersion, 'prerelease', 'beta');
}

const bumpVersion = ({ file, location }) =>
    new Promise((resolve) => {
        const src = `${location}${file}`;

        fs.access(src, fs.constants.F_OK, (err) => {
            if (err) {
                return resolve();
            }

            console.log(
                `Bumping ${src} from ${chalk.white.bold(
                    currentVersion
                )} to ${chalk.cyan.bold(newVersion)}`
            );

            const stream = gulp
                .src(src)
                .pipe(
                    replace(
                        new RegExp('"version": "([0-9a-z.-]+)"'),
                        `"version": "${newVersion}"`
                    )
                )
                .pipe(gulp.dest(location));

            stream.on('finish', () => resolve());
        });
    });

loadConfig('npm.locations')
    .then((locations) =>
        Promise.all(
            Object.keys(locations)
                .filter((location) => location !== 'project')
                .map((location) =>
                    Promise.all([
                        bumpVersion({
                            file: 'package.json',
                            location: locations[location],
                            newVersion,
                        }),
                        bumpVersion({
                            file: 'version.json',
                            location: locations[location],
                            newVersion,
                        }),
                    ])
                )
        )
    )
    .then(() =>
        bumpVersion({
            file: 'version.json',
            location: './static/root/www/',
            newVersion,
        })
    )
    .then(() =>
        bumpVersion({
            file: 'package.json',
            location: './',
            newVersion,
        })
    )
    .then(() => loadConfig('project'))
    .then(({ gcpProjectId, name }) => {
        const environment = type.includes('pre') ? 'beta' : 'production';
        const suffix = environment === 'beta' ? '-beta' : '';

        const toReplace = `gcr.io/${gcpProjectId}/${name}-([a-z]+)${suffix}:(?:.+)`;

        console.log(
            `Bumping ${environment} manifests from ${chalk.white.bold(
                currentVersion
            )} to ${chalk.cyan.bold(newVersion)}`
        );

        return gulp
            .src(`./manifests/${environment}/*.deployment.yaml`)
            .pipe(
                replace(
                    new RegExp(toReplace),
                    `gcr.io/${gcpProjectId}/${name}-$1${suffix}:${newVersion}`
                )
            )
            .pipe(gulp.dest(`./manifests/${environment}`));
    })
    .then(() => {
        console.log(
            `\nCopied ${chalk.cyan.bold(newVersion)} to your clipboard.`
        );

        // Copy new version to the clipboard.
        clipboardy.write(newVersion);
    })
    .catch((err) => {
        if (err.code === 'ENOENT') {
            return reportError(
                new Error(
                    'Please create a c.js file with your project configuration. See https://github.com/idearium/cli#configuration'
                ),
                false,
                true
            );
        }

        return reportError(err, false, true);
    });