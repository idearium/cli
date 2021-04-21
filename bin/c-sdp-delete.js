#!/usr/bin/env node

'use strict';

const { exec } = require('shelljs');

const command = `c mk delete -p section`;

exec(command);
