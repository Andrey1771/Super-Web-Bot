import https from 'https';
import fs from 'fs';
import express from 'express';
import path from 'path';

const app = express();

const cert = fs.readFileSync('./public/private.crt');
const key = fs.readFileSync('./public/private.key');

const buildPath = path.resolve('dist');

app.use(express.static(buildPath));

app.get('*', (req, res) => {
    res.sendFile(path.resolve(buildPath, 'index.html'));
});

const PORT = process.env.PORT || 3000;

https.createServer({ key, cert }, app).listen(PORT, () => {
    console.log(`HTTPS server is running on https://localhost:${PORT}`);
});
