const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 8080;

// ── Values injected by Kubernetes ConfigMap and Secret ──────────────────────
const APP_COLOR   = process.env.APP_COLOR   || 'red';
const APP_ENV     = process.env.APP_ENV     || 'development';
const APP_MESSAGE = process.env.APP_MESSAGE || 'Hello from WANDAPREP!';
const SECRET_KEY  = process.env.SECRET_KEY  || 'not-set';

// ── Logging setup ────────────────────────────────────────────────────────────
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

const logStream = fs.createWriteStream(path.join(logsDir, 'app.log'), { flags: 'a' });

function log(msg) {
    console.log(msg);
    logStream.write(msg + '\n');
}

// ── Routes ───────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
    fs.readFile(path.join(__dirname, 'index.html'), 'utf8', (err, data) => {
        if (err) return res.status(500).send('Internal Server Error');
        res.send(
            data
                .replace(/{{APP_COLOR}}/g,   APP_COLOR)
                .replace(/{{APP_ENV}}/g,     APP_ENV)
                .replace(/{{APP_MESSAGE}}/g, APP_MESSAGE)
                .replace(/{{SECRET_KEY}}/g,  SECRET_KEY)
        );
    });

    log(`[${new Date().toISOString()}] [REQUEST] GET / — color=${APP_COLOR} env=${APP_ENV}`);
});

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    const banner = `
================================================================
  ✅  IF YOU SEE THIS LOG, THE WANDAPREP APP IS RUNNING!
================================================================
  Timestamp   : ${new Date().toISOString()}
  Port        : ${PORT}
  Environment : ${APP_ENV}
  Color       : ${APP_COLOR}
  Message     : ${APP_MESSAGE}
  Secret Key  : ${SECRET_KEY}
----------------------------------------------------------------
  These values come from:
    APP_COLOR   → ConfigMap  (wandaprep-config)
    APP_ENV     → ConfigMap  (wandaprep-config)
    APP_MESSAGE → ConfigMap  (wandaprep-config)
    SECRET_KEY  → Secret     (wandaprep-secret)
================================================================
`;
    log(banner);
});
