'use strict';

const print = (line) => process.stdout.write(`${line}\n`);

const { readFileSync, writeFileSync } = require('fs');
const { join } = require('path');

const program = require('commander');
const { loadConfig, reportError } = require('./lib/c');
const { getSecretsContract } = require('./lib/c-secrets');
const { assertGcloudAuth, assertOpSession } = require('./lib/c-secrets-io');
const { draftContract } = require('./lib/c-secrets-init');

program
    .description(
        'Draft a secrets contract into c.js by scanning existing declarations (SecretProviderClasses, local secret templates, --set-secrets scripts, env.*.yaml references, docker build args and 1Password item names). Requires a warm 1Password session (the op-session alias) so item bindings resolve. The draft is a starting point: review ownership, opItems and sharedKeys, then verify. Exits without changes when a secrets contract already exists.'
    )
    .parse(process.argv);

const cjsPath = () => join(process.cwd(), 'c.js');

return loadConfig()
    .then((config) => {
        if (config.secrets) {
            return print(
                'A secrets contract already exists in c.js - nothing to init.'
            );
        }

        // A warm session is required: without the vault scan, services
        // draft unbound and (worse) a cold draft cannot be re-run to
        // completion.
        assertOpSession();
        assertGcloudAuth();

        return draftContract({ config }).then((draft) => {
            const backup = readFileSync(cjsPath(), 'utf8');
            let text = backup;

            // Ensure gcloud.region (the contract requires it; derive it from
            // regional resourceNames or the kubectl context).
            const gcloud = config.gcloud || {};

            if (!gcloud.region && draft.region) {
                const gcloudMatch = text.match(/\n(\s*)gcloud:\s*\{/);

                if (gcloudMatch) {
                    text = text.replace(
                        gcloudMatch[0],
                        `${gcloudMatch[0]}\n${gcloudMatch[1]}    region: '${draft.region}',`
                    );
                } else {
                    // No gcloud block at all: add one alongside the secrets
                    // block (projectId from the project configuration).
                    draft.blockText = [
                        `    gcloud: {`,
                        `        projectId: '${config.project.gcpProjectId}',`,
                        `        region: '${draft.region}',`,
                        `    },`,
                        draft.blockText,
                    ].join('\n');
                }
            } else if (!gcloud.region && !draft.region) {
                throw new Error(
                    'Could not derive a region for this project (no regional resourceNames, no gke_ kubectl context) - add gcloud.region to c.js, then re-run.'
                );
            }

            // Insert the secrets block before the module's closing brace.
            const closing = text.lastIndexOf('};');

            if (closing === -1) {
                throw new Error(
                    'Could not find the end of module.exports in c.js - add the secrets block manually.'
                );
            }

            text = `${text.slice(0, closing)}${draft.blockText}${text.slice(
                closing
            )}`;

            writeFileSync(cjsPath(), text);

            // The edited c.js must load and validate.
            try {
                delete require.cache[require.resolve(cjsPath())];

                const contract = getSecretsContract({
                    config: require(cjsPath()),
                });

                if (!contract) {
                    throw new Error(
                        'edited c.js still has no secrets contract'
                    );
                }
            } catch (e) {
                writeFileSync(cjsPath(), backup);

                throw new Error(
                    `Rolled back c.js - the drafted contract did not validate: ${e.message}`
                );
            }

            print('Drafted a secrets contract into c.js.\n');

            return draft.notes.forEach((note) => print(`- ${note}`));
        });
    })
    .catch((e) => reportError(e, false, true));
