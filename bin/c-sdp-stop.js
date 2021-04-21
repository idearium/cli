#!/usr/bin/env node

'use strict';

const { exec } = require('shelljs');

const command = `c mk stop -p section`;

exec(command);
