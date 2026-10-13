import https from 'https';
import fs from 'fs';
import express from 'express';
import path from 'path';

const app = express();

// Сертификаты лежат в certs/ (игнорируется git), а не в public/, откуда всё публикуется:
// сначала доверенные mkcert (npm run cert:dev), иначе старый самоподписанный — как в webpack.config.js.
const certPair = [
    ['certs/localhost-key.pem', 'certs/localhost.pem'],
    ['certs/private.key', 'certs/private.crt'],
].find(([keyPath, certPath]) => fs.existsSync(keyPath) && fs.existsSync(certPath));

if (!certPair) {
    throw new Error('No TLS certificate in certs/. Run `npm run cert:dev` first.');
}

const key = fs.readFileSync(certPair[0]);
const cert = fs.readFileSync(certPair[1]);

const buildPath = path.resolve('dist');

// Middleware для проверки корректности URL
app.use((req, res, next) => {
    try {
        decodeURIComponent(req.url);
    } catch (e) {
        console.error('Malformed URL:', req.url);
        return res.status(400).send('Bad Request: Malformed URL');
    }
    next();
});

app.use(express.static(buildPath));

// Express 5: «любой путь» записывается именованным шаблоном, голая «*» больше не принимается.
app.get('/{*splat}', (req, res) => {
    res.sendFile(path.resolve(buildPath, 'index.html'));
});

const PORT = process.env.PORT || 3000;

https.createServer({ key, cert }, app).listen(PORT, () => {
    console.log(`HTTPS server is running on https://localhost:${PORT}`);
});
