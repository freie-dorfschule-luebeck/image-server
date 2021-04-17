const config = require("../nashi/config.json");
const constants = require("./constants");
const utility = require("utility");
const express = require('express');
const expressSession = require('express-session');
const sharp = require('sharp');
const app = express(); app.listen(config.services.image_server.port, () => console.log(config.services.image_server.displayname + ' running on ' + config.services.image_server.port));

//next time i do shit for this i have to add file upload x3

const morgan = require("morgan");
app.use(morgan("dev"));
app.disable('x-powered-by');
app.set('etag', "strong");

const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, 'publicold');
const newdir = path.join(__dirname, 'public');

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

const MySQLStore = require('express-mysql-session')(expressSession);

let session_config = Object.assign(db_config, {
    clearExpired: true,
    checkExpirationInterval: 900000,
    expiration: 86400000,
    createDatabaseTable: true,
    connectionLimit: 2,
    schema: {
        tableName: 'user_sessions',
        columnNames: {
            session_id: 'session_id',
            expires: 'expires',
            data: 'data'
        }
    }
});
const sessionStore = new MySQLStore(session_config);

app.use(expressSession({
    key: config.cookies.session.name,
    secret: config.cookies.session.secret,
    store: sessionStore,
    saveUninitialized: false,
    resave: false,
    // proxy: true,
    cookie: {
        domain: config.services.nashi.domain,
        maxAge: 315569259747,
        httpOnly: true, 
        sameSite: true,
        secure: false //in production set https ig
    } 
}));

try {
    app.all('/', (req, res, next) => {
        res.set('Content-Type', 'application/json');
        body = {
            code: 200,
            message: "the image-server is working ^w^"
        };
        if(req.session.nick) body.message = "welcome back " + req.session.nick;
        res.statusMessage = utility.errorHandling.ErrorStatusCodes[body.code];
        res.status(body.code).send(body)
    })
    app.get("/404.banner", (req, res, next) => {
        if(!req.query.new) return next();
        let file = path.join(newdir, "banner.png");
        res.sendFile(file);
    });
    app.get("/:type/:type_id", (req, res, next) => {
        if(!req.query.new) return next();

        let type = req.params.type;
        let type_id = req.params.type_id;

        mysql.connection.execute(`SELECT * FROM images WHERE type = ? AND type_id = ? AND hidden = 0 ORDER BY image_id DESC`, [type, type_id], (error, result) => {
            if(error) return next(error);
            if(!result[0]) return next();
            res.redirect(302, `/${result[0].image_id}.${result[0].file_format}?new=true&size=${req.query.size || "max"}`);
        });
    });
    app.get("/:path", (req, res, next) => {
        if(!req.query.new) return next();
        let file = path.join(newdir, req.params.path);
        if(!path.extname(file).slice(1)) return next();
    
        let image_id = req.params.path.split('.')[0];
        let file_format = req.params.path.split('.')[1];

        let file_size = constants.sizes[req.query.size || "max"] || constants.sizes["max"];
        mysql.connection.execute(`SELECT * FROM images WHERE image_id = ? AND hidden = 0`, [image_id], (error, result) => {
            if(error) return next(error);
            if(!result[0]) return next();
            if(file_format !== result[0].file_format) return res.redirect(301, `/${image_id}.${result[0].file_format}?new=true`);
            sharp(file).resize(file_size).toBuffer().then(data => res.end(data)).catch(err => next(err));
        });
    });
} catch (err) {
    console.log(err)
    app.use((req, res, next) => next(err));
}

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
