'use strict';

const { execFileSync } = require('child_process');
const { createHash, randomBytes } = require('crypto');
const https = require('https');
const { readFileSync, writeFileSync } = require('fs');
const { join } = require('path');
const { homedir } = require('os');

const VAULT = 'Team';
const OP_SESSION_FILE = join(homedir(), '.local/state/idearium/op-session');

// Environment variables whose presence indicates a non-interactive agent
// context - plaintext output is hard-blocked while any is set.
const AGENT_ENV_VARS = [
    'CLAUDECODE',
    'CLAUDE_CODE_ENTRYPOINT',
    'CODEX_SANDBOX',
    'GEMINI_CLI',
    'OPENCODE',
];

const sha12 = ({ value }) =>
    createHash('sha256').update(value).digest('hex').slice(0, 12);

/**
 * Resolve the op session token from the environment or the op-session
 * alias' state file. Never print or log the return value.
 * @returns {String} The session token.
 */
const opSession = () => {
    if (process.env.OP_SESSION_idearium) {
        return process.env.OP_SESSION_idearium;
    }

    try {
        return readFileSync(OP_SESSION_FILE, 'utf8').trim();
    } catch (e) {
        throw new Error(
            'No 1Password session. Run the op-session alias (or export OP_SESSION_idearium), then retry.'
        );
    }
};

/**
 * Run the op cli with the session wired in. Input/values pass via stdin or
 * in-memory buffers, never via printed output.
 * @param {Object} options
 * @param {Array} options.args The op arguments.
 * @param {String} [options.input] Stdin to pipe into op.
 * @returns {String} The command's stdout.
 */
const runOp = ({ args, input }) => {
    try {
        return execFileSync('op', args, {
            encoding: 'utf8',
            env: Object.assign({}, process.env, {
                OP_SESSION_idearium: opSession(),
            }),
            input,
            stdio: ['pipe', 'pipe', 'pipe'],
        });
    } catch (e) {
        const stderr = String(e.stderr);

        if (
            stderr.includes('not currently signed in') ||
            stderr.includes('no active session found')
        ) {
            throw new Error(
                'The 1Password session has expired. Run the op-session alias, then retry.'
            );
        }

        throw e;
    }
};

/**
 * Read a 1Password reference's value (exact bytes, no trailing newline).
 * The return value is a secret - never print it; hash it instead.
 * @param {Object} options
 * @param {String} options.ref The op:// reference.
 * @returns {String} The value.
 */
const opRead = ({ ref }) => runOp({ args: ['read', '-n', ref] });

/**
 * Hash a 1Password reference's value without exposing it.
 * @param {Object} options
 * @param {String} options.ref The op:// reference.
 * @returns {String} A truncated sha256.
 */
const opReadSha = ({ ref }) =>
    sha12({ value: Buffer.from(opRead({ ref }), 'utf8') });

/**
 * List a 1Password item's fields (labels and sections only).
 * @param {Object} options
 * @param {String} options.item The item id.
 * @returns {Array} Fields with section labels.
 */
const opItemFields = ({ item }) => {
    const raw = runOp({ args: ['item', 'get', item, '--format=json'] });

    return JSON.parse(raw).fields.map((field) => ({
        field: field.label,
        section: field.section ? field.section.label : null,
    }));
};

/**
 * Check whether a section/field exists on an item.
 * @param {Object} options
 * @param {String} options.field The field label.
 * @param {String} options.item The item id.
 * @param {String} options.section The section label.
 * @returns {Boolean}
 */
const opFieldExists = ({ field, item, section }) =>
    opItemFields({ item }).some(
        (candidate) =>
            candidate.section === section && candidate.field === field
    );

/**
 * Upsert a field on a 1Password item. The value transits argv (the op cli
 * demands it for assignments) - the same trust domain as typing the value.
 * @param {Object} options
 * @param {String} options.field The field label.
 * @param {String} options.item The item id.
 * @param {String} options.section The section label.
 * @param {String} options.value The value.
 * @returns {Void}
 */
const opUpsertField = ({ field, item, section, value }) => {
    runOp({
        args: [
            'item',
            'edit',
            item,
            `${section}.${field}=${value}`,
            '--format=json',
        ],
    });
};

/**
 * Create a 1Password item (DATABASE category, no required built-ins) and
 * return its id.
 * @param {Object} options
 * @param {String} options.title The item title (e.g. ras-rsc/service).
 * @returns {String} The new item id.
 */
const opCreateItem = ({ title }) => {
    const raw = runOp({
        args: [
            'item',
            'create',
            '--category=database',
            `--title=${title}`,
            `--vault=${VAULT}`,
            '--format=json',
        ],
    });

    return JSON.parse(raw).id;
};

/**
 * Block plaintext output unless the user is at a terminal with no agent
 * environment variables set. --force overrides, with a warning.
 * @param {Object} options
 * @param {Boolean} options.force Whether --force was passed.
 * @returns {Void}
 */
const guardPlaintext = ({ force }) => {
    if (force) {
        process.stderr.write(
            'WARNING: plaintext output forced. Do not paste this into transcripts, files or tickets.\n'
        );

        return;
    }

    if (!process.stdout.isTTY) {
        throw new Error(
            'Plaintext output requires a terminal (stdout is not a TTY).'
        );
    }

    const agent = AGENT_ENV_VARS.find((envVar) => process.env[envVar]);

    if (agent) {
        throw new Error(
            `Plaintext output is blocked in agent/CI contexts (${agent} is set). Re-run personally, or use --force against your better judgement.`
        );
    }
};

/**
 * Generate a random value for `set --generate`.
 * @param {Object} options
 * @param {Number} options.length The desired length (characters).
 * @param {String} options.type hex, base64 or alphanumeric.
 * @returns {String} The generated value.
 */
const generateValue = ({ length = 32, type = 'hex' }) => {
    if (type === 'hex') {
        return randomBytes(Math.ceil(length / 2))
            .toString('hex')
            .slice(0, length);
    }

    if (type === 'base64') {
        return randomBytes(length).toString('base64').slice(0, length);
    }

    if (type === 'alphanumeric') {
        const alphabet =
            'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        const bytes = randomBytes(length);

        return Array.from(bytes)
            .map((byte) => alphabet[byte % alphabet.length])
            .join('');
    }

    throw new Error(`Unknown --type '${type}' (hex, base64, alphanumeric)`);
};

/**
 * Map gcloud authentication failures to a friendly, actionable error.
 * @param {Object} options
 * @param {String} options.stderr The failed command's stderr.
 * @returns {Error|null} The friendly error, or null when not auth-related.
 */
const gcloudAuthError = ({ stderr }) => {
    const phrases = [
        'Reauthentication failed',
        'to obtain new credentials',
        'cannot prompt during non-interactive execution',
        'do not currently have an active account selected',
    ];

    return phrases.some((phrase) => stderr.includes(phrase))
        ? new Error(
              'gcloud authentication has expired. Run `gcloud auth login` (interactive), then retry.'
          )
        : null;
};

/**
 * Run gcloud and return its stdout.
 * @param {Object} options
 * @param {Array} options.args The gcloud arguments.
 * @returns {String} The command's stdout.
 */
const runGcloud = ({ args }) => {
    try {
        return execFileSync('gcloud', args, {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
        });
    } catch (e) {
        const friendly = gcloudAuthError({ stderr: String(e.stderr) });

        throw friendly || e;
    }
};

/**
 * Assert gcloud is authenticated (up front, before any work) for commands
 * that touch Google Cloud.
 * @returns {Void}
 */
const assertGcloudAuth = () => {
    runGcloud({ args: ['auth', 'print-access-token'] });
};

/**
 * Make a Google Secret Manager REST call against the global endpoint.
 * Payloads are built in-process and never logged.
 * @param {Object} options
 * @param {String} [options.body] A JSON request body.
 * @param {String} options.method The HTTP method.
 * @param {String} options.path The path after /v1.
 * @param {String} options.project The GCP project id.
 * @returns {Promise} Resolves with the parsed JSON response.
 */
const gsmRequest = ({ body, method, path, project }) =>
    new Promise((resolve, reject) => {
        const token = runGcloud({ args: ['auth', 'print-access-token'] });

        const request = https.request(
            {
                headers: {
                    'authorization': `Bearer ${token.trim()}`,
                    'content-type': 'application/json',
                },
                host: 'secretmanager.googleapis.com',
                method,
                path: `/v1/projects/${project}${path}`,
            },
            (res) => {
                let raw = '';

                res.on('data', (chunk) => {
                    raw += chunk;
                });

                res.on('end', () => {
                    if (res.statusCode >= 300) {
                        return reject(
                            new Error(
                                `GSM ${method} ${path} failed (${
                                    res.statusCode
                                }): ${raw.slice(0, 200)}`
                            )
                        );
                    }

                    return resolve(raw ? JSON.parse(raw) : {});
                });
            }
        );

        request.on('error', reject);

        if (body) {
            request.write(JSON.stringify(body));
        }

        request.end();
    });

/**
 * Check whether a GSM secret exists (and return its labels).
 * @param {Object} options
 * @param {String} options.id The GSM secret id.
 * @param {String} options.project The GCP project id.
 * @returns {Promise} Resolves with the secret resource, or null.
 */
const gsmDescribe = ({ id, project }) =>
    gsmRequest({ method: 'GET', path: `/secrets/${id}`, project }).catch(
        (e) => {
            if (e.message.includes('(404)')) {
                return null;
            }

            throw e;
        }
    );

/**
 * Create a pinned-global GSM secret with the standard labels.
 * @param {Object} options
 * @param {String} options.env The environment label.
 * @param {String} options.id The GSM secret id.
 * @param {String} options.managedBy The managed-by label (org-repo).
 * @param {String} options.project The GCP project id.
 * @param {String} options.region The replication region.
 * @param {String} options.service The service label.
 * @returns {Promise}
 */
const gsmCreate = ({ env, id, managedBy, project, region, service }) =>
    gsmRequest({
        body: {
            labels: {
                'environment': env,
                'managed-by': managedBy,
                service,
            },
            replication: {
                userManaged: {
                    replicas: [{ location: region }],
                },
            },
        },
        method: 'POST',
        path: `/secrets?secretId=${id}`,
        project,
    });

/**
 * Add a version to a GSM secret. The value is base64-encoded in-process.
 * @param {Object} options
 * @param {String} options.id The GSM secret id.
 * @param {String} options.project The GCP project id.
 * @param {String} options.value The secret value.
 * @returns {Promise}
 */
const gsmAddVersion = ({ id, project, value }) =>
    gsmRequest({
        body: {
            payload: { data: Buffer.from(value, 'utf8').toString('base64') },
        },
        method: 'POST',
        path: `/secrets/${id}:addVersion`,
        project,
    });

/**
 * Read a GSM secret's latest version. The return value is a secret - never
 * print it; hash it instead.
 * @param {Object} options
 * @param {String} options.id The GSM secret id.
 * @param {String} options.project The GCP project id.
 * @returns {Promise} Resolves with the value as a Buffer.
 */
const gsmRead = ({ id, project }) =>
    gsmRequest({
        method: 'GET',
        path: `/secrets/${id}/versions/latest:access`,
        project,
    }).then((res) => Buffer.from(res.payload.data, 'base64'));

/**
 * Delete a GSM secret. Point of no return - callers must gate this on a
 * consumers check.
 * @param {Object} options
 * @param {String} options.id The GSM secret id.
 * @param {String} options.project The GCP project id.
 * @returns {Promise}
 */
const gsmDelete = ({ id, project }) =>
    gsmRequest({ method: 'DELETE', path: `/secrets/${id}`, project });

/**
 * List every GSM secret id in the project.
 * @param {Object} options
 * @param {String} options.project The GCP project id.
 * @returns {Promise} Resolves with an array of secret ids.
 */
const gsmList = ({ project }) => {
    const ids = [];

    const page = (pageToken) =>
        gsmRequest({
            method: 'GET',
            path: `/secrets${pageToken ? `?pageToken=${pageToken}` : ''}`,
            project,
        }).then((res) => {
            (res.secrets || []).forEach((secret) => {
                ids.push(secret.name.split('/').pop());
            });

            if (res.nextPageToken) {
                return page(res.nextPageToken);
            }

            return ids;
        });

    return page('');
};

/**
 * List the project's Cloud Functions (scoped to the repo's name prefix)
 * with the GSM secret ids each consumes. Function names do not encode the
 * environment (e.g. beta carries an infix, production does not) - the env
 * lives in the referenced secret ids.
 * @param {Object} options
 * @param {String} options.project The GCP project id.
 * @param {String} options.region The region.
 * @param {String} options.repoPrefix The function-name prefix (org-repo-).
 * @returns {Promise} Resolves with [{ name, secrets: [secretId] }].
 */
const gcfList = ({ project, region, repoPrefix }) => {
    const names = runGcloud({
        args: [
            'functions',
            'list',
            `--filter=name~functions/${repoPrefix}`,
            `--format=value(name)`,
            `--project=${project}`,
        ],
    })
        .split('\n')
        .map((name) => name.trim().split('/').pop())
        .filter((name) => name.length > 0);

    return Promise.all(
        names.map((name) => {
            const shortName = name.split('/').pop();

            const raw = runGcloud({
                args: [
                    'functions',
                    'describe',
                    shortName,
                    `--format=json`,
                    `--project=${project}`,
                    `--region=${region}`,
                ],
            });

            const secrets = (
                (JSON.parse(raw).serviceConfig || {})
                    .secretEnvironmentVariables || []
            ).map((entry) => entry.secret);

            return { name: shortName, secrets };
        })
    );
};

/**
 * Map kubectl failures to a friendly, actionable error.
 * @param {Object} options
 * @param {String} options.context The kubectl context (for messages).
 * @param {String} options.stderr The failed command's stderr.
 * @returns {Error|null} The friendly error, or null when unmapped.
 */
const kubectlError = ({ context, stderr }) => {
    if (
        /context "[^"]+" does not exist/.test(stderr) ||
        stderr.includes('no context exists') ||
        stderr.includes('context was not found')
    ) {
        return new Error(
            `kubectl has no context '${context}'. Run \`c kc context set\`, then retry.`
        );
    }

    const unreachable = [
        'Unable to connect to the server',
        'You must be logged in',
        'Unauthorized',
        'error: exec',
    ];

    return unreachable.some((phrase) => stderr.includes(phrase))
        ? new Error(
              `kubectl cannot reach the cluster '${context}' (credentials expired or cluster unreachable). Run \`gcloud auth login\` if expired, and confirm the context with \`c kc context set\`, then retry.`
          )
        : null;
};

/**
 * Run kubectl and return its stdout, with friendly failure mapping.
 * @param {Object} options
 * @param {Array} options.args The kubectl arguments.
 * @param {String} options.context The kubectl context.
 * @returns {String} The command's stdout.
 */
const runKubectl = ({ args, context }) => {
    try {
        return execFileSync('kubectl', ['--context', context].concat(args), {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
        });
    } catch (e) {
        const friendly = kubectlError({ context, stderr: String(e.stderr) });

        throw friendly || e;
    }
};

/**
 * Assert kubectl can reach the context's server with valid credentials
 * (up front, before any work) for commands that read the cluster.
 * @param {Object} options
 * @param {String} options.context The kubectl context.
 * @returns {Void}
 */
const assertKubectl = ({ context }) => {
    try {
        execFileSync(
            'kubectl',
            [
                '--context',
                context,
                '--request-timeout=10s',
                'get',
                '--raw',
                '/version',
            ],
            { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
        );
    } catch (e) {
        const friendly = kubectlError({ context, stderr: String(e.stderr) });

        if (friendly) {
            throw friendly;
        }

        throw new Error(
            `kubectl cannot reach the cluster '${context}'. Confirm the context with \`c kc context set\`, then retry. (${String(
                e.stderr || e.message
            )
                .trim()
                .slice(0, 120)})`
        );
    }
};

/**
 * Read one key of a Kubernetes secret.
 * @param {Object} options
 * @param {String} options.context The kubectl context.
 * @param {String} options.key The secret key.
 * @param {String} options.namespace The namespace.
 * @param {String} options.secret The Kubernetes secret name.
 * @returns {String} The base64-encoded value.
 */
const k8sReadKey = ({ context, key, namespace, secret }) =>
    runKubectl({
        args: [
            '-n',
            namespace,
            'get',
            'secret',
            secret,
            '-o',
            `jsonpath={.data.${key}}`,
        ],
        context,
    }).trim();

/**
 * List the keys of a Kubernetes secret.
 * @param {Object} options
 * @param {String} options.context The kubectl context.
 * @param {String} options.namespace The namespace.
 * @param {String} options.secret The Kubernetes secret name.
 * @returns {Array} The secret's keys.
 */
const k8sSecretKeys = ({ context, namespace, secret }) => {
    const raw = runKubectl({
        args: ['-n', namespace, 'get', 'secret', secret, '-o', 'json'],
        context,
    });

    return Object.keys(JSON.parse(raw).data || {});
};

/**
 * List every SecretProviderClass in a namespace with the GSM ids their
 * parameters reference.
 * @param {Object} options
 * @param {String} options.context The kubectl context.
 * @param {String} options.namespace The namespace.
 * @returns {Promise} Resolves with [{ name, ids: [secretId] }].
 */
const spcList = ({ context, namespace }) =>
    new Promise((resolve, reject) => {
        let raw = '';

        try {
            raw = runKubectl({
                args: [
                    '-n',
                    namespace,
                    'get',
                    'secretproviderclass',
                    '-o',
                    'json',
                ],
                context,
            });
        } catch (e) {
            return reject(e);
        }

        const items = JSON.parse(raw).items.map((item) => ({
            ids:
                ((item.spec.parameters || {}).secrets || '').match(
                    /resourceName:\s*'projects\/[^/]+\/secrets\/([^']+)'/g
                ) || [],
            name: item.metadata.name,
        }));

        return resolve(
            items.map((item) => ({
                ids: item.ids.map((entry) =>
                    entry
                        .replace(/.*secrets\//, '')
                        .replace(/'/g, '')
                        .replace(/\/versions\/latest$/, '')
                ),
                name: item.name,
            }))
        );
    });

/**
 * Assert a warm 1Password session (up front, before any work) for commands
 * that read or write op values. Throws the friendly session errors.
 * @returns {Void}
 */
const assertOpSession = () => {
    opSession();
    runOp({ args: ['whoami', '--format=json'] });
};

/**
 * Find a 1Password item by exact title, returning its id (or null).
 * @param {Object} options
 * @param {String} options.title The item title.
 * @returns {String|null} The item id.
 */
const opFindItemByTitle = ({ title }) => {
    const raw = runOp({
        args: ['item', 'list', '--vault=Team', '--format=json'],
    });

    const item = JSON.parse(raw).find((candidate) => candidate.title === title);

    return item ? item.id : null;
};

/**
 * Resolve a service's 1Password item: a bound opItem wins; otherwise look
 * the item up by title; otherwise create it (write paths only - read
 * paths pass create false and get a guidance error instead).
 * @param {Object} options
 * @param {Boolean} options.create Whether an item may be created.
 * @param {String} [options.noCreateMessage] A specific error message when
 * creation is not allowed (used for the shared block, which never creates).
 * @param {String} [options.opItem] The bound opItem, when present.
 * @param {String} options.title The item title ({org}-{repo}/{service}).
 * @returns {Object} { created, id, persisted } - persisted true when the
 * binding should be written back into c.js.
 */
const resolveOpItem = ({ create, noCreateMessage, opItem, title }) => {
    if (opItem) {
        return { created: false, id: opItem, persisted: false };
    }

    const found = opFindItemByTitle({ title });

    if (found) {
        return { created: false, id: found, persisted: true };
    }

    if (!create) {
        throw new Error(
            noCreateMessage ||
                `No 1Password item '${title}' - read commands never create items. Bind one first: c op set (or add) the service's first key.`
        );
    }

    return { created: true, id: opCreateItem({ title }), persisted: true };
};

/**
 * Resolve the target item for an owning entry: services resolve-or-create;
 * the shared block only ever resolves (where a shared value lives is the
 * author's decision, never the tool's).
 * @param {Object} options
 * @param {Object} options.owner The owning service or shared entry.
 * @param {String} options.title The item title.
 * @returns {Object} { created, id, persisted }.
 */
const resolveOwnerItem = ({ owner, title }) =>
    owner && owner.name === 'shared'
        ? resolveOpItem({
              create: false,
              noCreateMessage:
                  "The 'shared' block stores its values in a 1Password item you choose - set shared.opItem in c.js (often the item of a service that uses the key).",
              opItem: owner.opItem,
              title,
          })
        : resolveOpItem({ create: true, opItem: owner && owner.opItem, title });

/**
 * Read the c.js file's text from the project directory.
 * @returns {String} The file contents.
 */
const readCjs = () => readFileSync(join(process.cwd(), 'c.js'), 'utf8');

/**
 * Write the c.js file's text back to the project directory.
 * @param {Object} options
 * @param {String} options.text The new file contents.
 * @returns {Void}
 */
const writeCjs = ({ text }) => writeFileSync(join(process.cwd(), 'c.js'), text);

/**
 * Quote a service/key name for c.js: single quotes only when required.
 * @param {Object} options
 * @param {String} options.name The name to quote.
 * @returns {String} The (maybe quoted) name.
 */
const quoteIfNeeded = ({ name }) =>
    /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : `'${name}'`;

/**
 * Register a new service in c.js's secrets contract (used by set/add when
 * the service doesn't exist yet). Inserts alphabetically into
 * secrets.services.
 * @param {Object} options
 * @param {String} options.key The first key the service owns.
 * @param {String} options.name The service name.
 * @param {String} options.opItem The 1Password item id.
 * @returns {Void}
 */
const registerServiceInCjs = ({ key, name, opItem }) => {
    const text = readCjs();

    // The minimal scaffold's single-line empty map: expand it with the
    // first entry.
    const emptyMatch = text.match(/\n(\s*)services:\s*\{\}/);

    if (emptyMatch) {
        const [, emptyIndent] = emptyMatch;

        const expanded = [
            `${emptyIndent}services: {`,
            `${emptyIndent}    ${quoteIfNeeded({ name })}: {`,
            `${emptyIndent}        keys: ['${key}'],`,
            `${emptyIndent}        opItem: '${opItem}',`,
            `${emptyIndent}    },`,
            `${emptyIndent}}`,
        ].join('\n');

        writeCjs({ text: text.replace(emptyMatch[0], `\n${expanded}`) });

        return;
    }

    const servicesMatch = text.match(/\n(\s*)services:\s*\{/);

    if (!servicesMatch) {
        throw new Error(
            'Could not find secrets.services in c.js - add the service manually.'
        );
    }

    const [, indent] = servicesMatch;
    const startIndex = servicesMatch.index + servicesMatch[0].length;
    const closingIndex = text.indexOf(`\n${indent}}`, startIndex);

    if (closingIndex === -1) {
        throw new Error(
            'Could not find the end of secrets.services in c.js - add the service manually.'
        );
    }

    // Walk the top-level entries to find the alphabetical insertion point.
    let insertIndex = closingIndex;
    const entryRegex = new RegExp(`^${indent}    ('?[^':\\n]+'?):`, 'gm');
    entryRegex.lastIndex = startIndex;

    let match = entryRegex.exec(text);

    while (match && match.index < closingIndex) {
        const entryName = match[1].replace(/^'|'$/g, '');

        if (entryName > name) {
            insertIndex = match.index;
            break;
        }

        match = entryRegex.exec(text);
    }

    const fullBlock = [
        `${indent}    ${quoteIfNeeded({ name })}: {`,
        `${indent}        keys: ['${key}'],`,
        `${indent}        opItem: '${opItem}',`,
        `${indent}    },`,
    ].join('\n');

    writeCjs({
        text: `${text.slice(0, insertIndex)}${fullBlock}\n${text.slice(
            insertIndex
        )}`,
    });
};

/**
 * Add a key to a service's keys array in c.js, preserving the array's
 * existing layout (single-line or multi-line).
 * @param {Object} options
 * @param {String} options.key The key to add.
 * @param {String} options.name The service name.
 * @returns {Void}
 */
const addKeyToServiceInCjs = ({ key, name }) => {
    const text = readCjs();

    const servicePattern = new RegExp(
        `\\n(\\s*)${quoteIfNeeded({ name })}:\\s*\\{`
    );
    const serviceMatch = text.match(servicePattern);

    if (!serviceMatch) {
        throw new Error(`Could not find service '${name}' in c.js.`);
    }

    const [, indent] = serviceMatch;
    const serviceStart = serviceMatch.index;
    const serviceEnd = text.indexOf(`\n${indent}}`, serviceStart);

    if (serviceEnd === -1) {
        throw new Error(`Could not find the end of service '${name}' in c.js.`);
    }

    const serviceText = text.slice(serviceStart, serviceEnd);

    const keysMatch = serviceText.match(/keys:\s*\[([^\]]*)\]/);

    if (!keysMatch) {
        throw new Error(
            `Could not find a keys array for service '${name}' in c.js.`
        );
    }

    const entries = keysMatch[1]
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
        .map((entry) => entry.replace(/^'|'$/g, ''));

    if (entries.includes(key)) {
        return;
    }

    entries.push(key);
    entries.sort();

    const multiline = keysMatch[0].includes('\n');

    const rendered = multiline
        ? `keys: [\n${entries
              .map((entry) => `${indent}    '${entry}',`)
              .join('\n')}\n${indent}],`
        : `keys: [${entries.map((entry) => `'${entry}'`).join(', ')}]`;

    const newServiceText = serviceText.replace(keysMatch[0], rendered);

    writeCjs({
        text:
            text.slice(0, serviceStart) +
            newServiceText +
            text.slice(serviceEnd),
    });
};

/**
 * Bind a service's opItem in c.js (inserting the property when the service
 * block has none) - used to persist lazily resolved item ids.
 * @param {Object} options
 * @param {String} options.name The service name.
 * @param {String} options.opItem The 1Password item id.
 * @returns {Void}
 */
const setOpItemInCjs = ({ name, opItem }) => {
    const text = readCjs();

    const servicePattern = new RegExp(
        `\\n(\\s*)${quoteIfNeeded({ name })}:\\s*\\{`
    );
    const serviceMatch = text.match(servicePattern);

    if (!serviceMatch) {
        throw new Error(`Could not find service '${name}' in c.js.`);
    }

    const [, indent] = serviceMatch;
    const serviceStart = serviceMatch.index;
    const serviceEnd = text.indexOf(`\n${indent}}`, serviceStart);

    if (serviceEnd === -1) {
        throw new Error(`Could not find the end of service '${name}' in c.js.`);
    }

    const serviceText = text.slice(serviceStart, serviceEnd);

    if (/opItem:\s*'/.test(serviceText)) {
        return;
    }

    writeCjs({
        text: `${text.slice(
            0,
            serviceEnd
        )}\n${indent}    opItem: '${opItem}',${text.slice(serviceEnd)}`,
    });
};

/**
 * Push a value to a GSM secret and verify the readback by hash: create the
 * secret (with labels, pinned-global replication) when missing, add a
 * version otherwise. versions/latest is eventually consistent, so the
 * readback retries briefly before declaring a mismatch.
 * @param {Object} options
 * @param {Object} options.contract The normalised contract.
 * @param {String} options.env The environment (labels).
 * @param {String} options.id The GSM secret id.
 * @param {String} options.owner The owning service name (labels).
 * @param {String} options.value The secret value.
 * @returns {Promise} Resolves with { created, sourceSha, readbackSha }.
 */
const gsmPushVerified = ({ contract, env, id, owner, value }) => {
    const attempts = 5;
    const delayMs = 3000;

    const sleep = (ms) =>
        new Promise((resolve) => {
            setTimeout(resolve, ms);
        });

    const sourceSha = sha12({ value: Buffer.from(value, 'utf8') });

    return gsmDescribe({ id, project: contract.project }).then((secret) => {
        const created = !secret;

        const create = secret
            ? Promise.resolve()
            : gsmCreate({
                  env,
                  id,
                  managedBy: `${contract.organisation}-${contract.name}`,
                  project: contract.project,
                  region: contract.region,
                  service: owner,
              });

        return create
            .then(() => gsmAddVersion({ id, project: contract.project, value }))
            .then(() => {
                const attempt = (remaining) =>
                    gsmRead({ id, project: contract.project }).then(
                        (readback) => {
                            const readbackSha = sha12({ value: readback });

                            if (readbackSha === sourceSha) {
                                return { created, readbackSha, sourceSha };
                            }

                            if (remaining > 0) {
                                return sleep(delayMs).then(() =>
                                    attempt(remaining - 1)
                                );
                            }

                            throw new Error(
                                `Readback MISMATCH for ${id} (source:${sourceSha} gsm:${readbackSha}) - versions/latest may still be propagating.`
                            );
                        }
                    );

                return attempt(attempts);
            });
    });
};

module.exports = {
    addKeyToServiceInCjs,
    assertGcloudAuth,
    assertKubectl,
    assertOpSession,
    gcfList,
    generateValue,
    guardPlaintext,
    gsmAddVersion,
    gsmCreate,
    gsmDelete,
    gsmDescribe,
    gsmList,
    gsmPushVerified,
    gsmRead,
    k8sReadKey,
    k8sSecretKeys,
    opCreateItem,
    opFieldExists,
    opFindItemByTitle,
    opRead,
    opSession,
    opReadSha,
    opUpsertField,
    quoteIfNeeded,
    registerServiceInCjs,
    resolveOpItem,
    resolveOwnerItem,
    runKubectl,
    runOp,
    setOpItemInCjs,
    sha12,
    spcList,
};
