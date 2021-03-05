const config = require("../nashi/config.json");
const utility = require("utility");
const express = require('express');
const app = express(); app.listen(config.services.image_server.port, () => console.log(config.services.image_server.displayname + ' running on ' + config.services.image_server.port));

//next time i do shit for this i have to add file upload x3

const morgan = require("morgan");
app.use(morgan("dev"));
app.disable('x-powered-by');
app.set('etag', false);

const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, 'publicold');

const mysql = require("mysql2");
const db_config = {
    host : config.mysql.host,
    user : config.mysql.user,
    password : config.mysql.password,
    database : config.mysql.database,
    timezone: config.mysql.timezone,
    insecureAuth : true
}

let connection;

handleDisconnect = () => {
    mysql.connection = mysql.createConnection(db_config);
    mysql.connection.connect(function(err) {
        if(err) {
            console.log('MYSQL CONNECT ERR ' + err);
            setTimeout(handleDisconnect, 2000);
        } else {
            console.log(`Successfully connected to MYSQL`)
        }
    });

    mysql.connection.on('error', function(err) {
        console.log('MYSQL ERR ' + err);
        handleDisconnect();                         
    });
}

handleDisconnect();

try {
    app.all('/', (req, res, next) => {
        res.set('Content-Type', 'application/json');
        body = {
            code: 200,
            message: "the image-server is working ^_^"
        };
        res.statusMessage = utility.errorHandling.ErrorStatusCodes[body.code];
        res.status(body.code).send(body)
    })
    app.get("/:type/:type_id", (req, res, next) => {
        next();
    });

    app.get('*', function (req, res, next) {
        let file = path.join(dir, req.path);
        // let extname = path.extname(file).slice(1);
        // if(!extname || !mime[extname]) next();
        let stream = fs.createReadStream(file);
        stream.on('open', function () {
            stream.pipe(res);
        });
        stream.on('error', function () {
           stream.close();
           next();
        });
    });
} catch (err) {
    console.log(err)
    app.use((req, res, next) => next(err));
}

// 
app.use((req, res, next) => res.status(404).sendFile(path.join(dir, '/0.svg')));

app.use((err, req, res, next) => {
    res.set('Content-Type', 'application/json');
    body = {
        code: err.status || err.statusCode || 500,
        message: err.message || err
    };
    res.statusMessage = utility.errorHandling.ErrorStatusCodes[body.code];
    res.status(body.code).send(body)
});
