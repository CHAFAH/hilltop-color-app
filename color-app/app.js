const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 8080;

// Get the background color from an environment variable (default: red)
const backgroundColor = process.env.COLOR || 'red';

// Ensure logs directory exists
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Logging setup
const logFilePath = path.join(logsDir, 'app.log');
const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

const serverInfo = `
==========================
Hilltop Consultancy Color Display Application
Address: Sylen 3, Høje Taastrup, Copenhagen
Website: www.htconsult.dk
Contact: +45 7157 3047
==========================
`;

console.log(serverInfo);
logStream.write(serverInfo + '\n');

// Serve index.html dynamically
app.get('/', (req, res) => {
    const timestamp = new Date().toISOString();
    const userAgent = req.headers['user-agent'] || 'Unknown';
    const remoteAddress = req.socket.remoteAddress;

    // Read the HTML file
    fs.readFile(path.join(__dirname, 'index.html'), 'utf8', (err, data) => {
        if (err) {
            res.status(500).send('Internal Server Error');
            return;
        }

        // Replace placeholders with actual values
        const htmlContent = data.replace(/{{COLOR}}/g, backgroundColor);
        res.send(htmlContent);
    });

    // Log request details
    const logMessage = `
[${timestamp}] New Request:
- Client IP: ${remoteAddress}
- User-Agent: ${userAgent}
- Background Color: ${backgroundColor}
- Accessed Page: /
==========================
`;
    console.log(logMessage);
    logStream.write(logMessage + '\n');
});

// Start the server
app.listen(PORT, () => {
    const startMessage = `
[${new Date().toISOString()}] Server started:
- Running on: http://localhost:${PORT}
- Background Color: ${backgroundColor}
- Hilltop Consultancy Contact: +45 7157 3047
==========================
`;
    console.log(startMessage);
    logStream.write(startMessage + '\n');
});
