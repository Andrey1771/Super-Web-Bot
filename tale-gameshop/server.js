import https from 'https';
import fs from 'fs';
import express from 'express';
import path from 'path';

const app = express();

const cert = fs.readFileSync('./public/private.crt');
const key = fs.readFileSync('./public/private.key');

const buildPath = path.resolve('dist');
const indexPath = path.join(buildPath, 'index.html');

if (!fs.existsSync(indexPath)) {
    console.error('Build output not found. Run "npm run build" before starting the server.');
    process.exit(1);
}

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

app.get('*', (req, res) => {
    res.sendFile(path.resolve(buildPath, 'index.html'));
});

const PORT = process.env.PORT || 3000;

https.createServer({ key, cert }, app).listen(PORT, () => {
    console.log(`HTTPS server is running on https://localhost:${PORT}`);
});
