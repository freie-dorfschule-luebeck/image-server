const express = require('express');
const app = express();
app.listen(3000);

//next time i do shit for this i have to add file upload x3

const morgan = require("morgan");
app.use(morgan("dev"));
app.disable('x-powered-by');
app.set('etag', 'strong');

const path = require('path');
const fs = require('fs');
const utility = require("utility");
const dir = path.join(__dirname, 'public');

const mime = {
    jpg: 'image/jpeg',
};

try {
    app.all('/', (req, res, next) => {
        res.redirect('https://github.com/fdl-stuff/image-server');
    })
    app.get('*', function (req, res, next) {
        let file = path.join(dir, req.path);
        let extname = path.extname(file).slice(1);
        if(!extname || !mime[extname]) next();
        let stream = fs.createReadStream(file);
        stream.on('open', function () {
            stream.pipe(res);

        });
        stream.on('error', function () {
            next(new utility.errorHandling.SutekinaStatusError(404))
        });
    });
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
    res.status(body.code).send(body.message)
});