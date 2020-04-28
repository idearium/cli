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

program.option('-t, --type <type>', 'The version bump type', 'patch');

program.on('--help', () => {
    console.log('');
    console.log('  The following types are currently accepted:');
    console.log('');
    console.log(
        '    alpha: increment the patch version, then makes an alpha release. If the input version is already an alpha release it simply increments it.'
    );
    console.log(
        '    alphamajor: bump the version up to the next major version and down to an alpha release of that major version.'
    );
    console.log(
        '    alphaminor: bump the version up to the next minor version and down to an alpha release of that minor version.'
    );
    console.log(
        '    alphapatch: bump the version up to the next patch version and down to an alpha release of that patch version.'
    );
    console.log(
        '    beta: increment the patch version, then makes a beta release. If the input version is already a beta release it simply increments it.'
    );
    console.log(
        '    betamajor: bump the version up to the next major version and down to a beta release of that major version.'
    );
    console.log(
        '    betaminor: bump the version up to the next minor version and down to a beta release of that minor version.'
    );
    console.log(
        '    betapatch: bump the version up to the next patch version and down to a beta release of that patch version.'
    );
    console.log(
        '    prerelease: increment the patch version, then makes an alpha release. If the input version is already a prerelease it simply increments it.'
    );
});

program.parse(process.argv);

const { version: currentVersion } = require(`${pathResolve(
    process.cwd(),
    'package.json'
)}`);
let { type } = program;

let prereleaseIdentifier = currentVersion.includes('beta') ? 'beta' : 'alpha';

if (
    type &&
    ['alpha', 'beta'].some((prereleaseType) => type.includes(prereleaseType))
) {
    prereleaseIdentifier = type.includes('beta') ? 'beta' : 'alpha';
}

if (['alphamajor', 'betamajor'].includes(type)) {
    type = 'premajor';
}

if (['alphaminor', 'betaminor'].includes(type)) {
    type = 'preminor';
}

if (['alphapatch', 'betapatch'].includes(type)) {
    type = 'prepatch';
}

if (['alpha', 'beta'].includes(type)) {
    type = 'prerelease';
}

// Always ensure we get beta.1, never beta.0.
let newVersion = semver.inc(currentVersion, type, prereleaseIdentifier);

if (newVersion.includes(`${prereleaseIdentifier}.0`)) {
    newVersion = semver.inc(newVersion, 'prerelease', prereleaseIdentifier);
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
                    bumpVersion({
                        file: 'version.json',
                        location: locations[location],
                        newVersion,
                    })
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
        const environment = /(alpha|beta|pre)/.test(type)
            ? `${prereleaseIdentifier}`
            : 'production';
        const suffix =
            environment === `${prereleaseIdentifier}`
                ? `-${prereleaseIdentifier}`
                : '';

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
