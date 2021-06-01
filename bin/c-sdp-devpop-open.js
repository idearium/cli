#!/usr/bin/env node

'use strict';

const { exec } = require('shelljs');

exec('/usr/local/bin/c sdp service -n section-shared developer-pop');
