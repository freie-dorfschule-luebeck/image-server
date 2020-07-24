const express = require('express');
const app = express();
app.listen(3000);

const path = require('path');
const fs = require('fs');
const utility = require("utility");
const dir = path.join(__dirname, 'public');

const mime = {
    html: 'text/html',
    txt: 'text/plain',
    css: 'text/css',
    gif: 'image/gif',
    jpg: 'image/jpeg',
    png: 'image/png',
    svg: 'image/svg+xml',
    js: 'application/javascript'
};

try {
    app.get('/:folder/:file/', function (req, res, next) {
        let file = path.join(dir, req.params.folder, req.params.file);
        let type = mime[path.extname(file).slice(1)];
        let stream = fs.createReadStream(file);
        stream.on('open', function () {
            res.set('Content-Type', type);
            stream.pipe(res);
        });
        stream.on('error', function () {
            next(new utility.errorHandling.SutekinaStatusError(404))
        });
    });
    app.use('*', (req, res, next) => {
        res.status(200).send("<body style=\"font-size: 2rem; width: 100%; height: 100%; display: flex; justify-content: center; align-items: center; flex-direction: column;\"><h3>freie dorfschule lübeck image server</h3><a href=\"https://github.com/fdl-stuff/image-server\" title=\"github repository\" style=\"color: black;\">github</a></body>")
    })
} catch (err) {
    app.use((req, res, next) => next(err));
}

app.use((req, res, next) => next(new utility.errorHandling.SutekinaStatusError(404)));

app.use((err, req, res, next) => {
    res.set('Content-Type', 'text/plain');
    body = {
        code: err.status || err.statusCode || 500,
        message: err.message || err
    };
    res.statusMessage = utility.errorHandling.ErrorStatusCodes[body.code];
    res.status(body.code).end(body.message)
});