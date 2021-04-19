const config = require("../nashi/config.json");
const constants = require("./constants");
const utility = require("../nashi/utility");
const express = require('express');
const expressSession = require('express-session');
const sharp = require('sharp');
const multer = require("multer");
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


const storage = multer.diskStorage({
    destination: (req, file, callback) => {
        callback(null, newdir);
    },
    filename: (req, file, callback) => {
        mysql.connection.execute(`INSERT INTO ringo.images (user_id, type_id, type, file_format, hidden, created_at) VALUES (?, ?, ?, ?, "0", UTC_TIMESTAMP())`, [req.session.user_id, req.session.user_id, "user", file.originalname.split('.').pop()], (error, result) => {
            if(error) return callback(new utility.errorHandling.SutekinaError(error.message, 500));
            return callback(null, `${result.insertId}.${file.originalname.split('.').pop()}`);
        });
    }
})

const upload = multer({
    storage: storage,
    limits: {
        fields: 10,
        fileSize: 1024 * 1024 * 1024, // 1GB, before this is possible nginx will block.
        files: 1        
    }
});

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
        let file = path.join(newdir, "banner.png");
        res.sendFile(file);
    });
    app.get("/:type/:type_id", (req, res, next) => {
        let type = req.params.type;
        let type_id = req.params.type_id;

        mysql.connection.execute(`SELECT * FROM images WHERE type = ? AND type_id = ? AND hidden = 0 ORDER BY image_id DESC`, [type, type_id], (error, result) => {
            if(error) return next(error);
            if(!result[0]) return next();
            res.redirect(302, `/${result[0].image_id}.${result[0].file_format}?size=${req.query.size || "max"}`);
        });
    });
    app.post("/:type/:type_id", (req, res, next) => {
        if(!req.session.nick) {
            req.session.error = {
                message: "Du bist nicht angemeldet.",
                status: 401
            };
            return res.redirect(`${config.services.nashi.domain}/error`);
        }
        upload.single("file")(req, res, (err) => {
            if (err) {
                req.session.error = {
                    message: err.message,
                    status: err.status || 500
                };
                console.log(err);
                res.redirect(`${config.services.nashi.domain}${req.session.redir || "/error"}`);
            } else {
                if(req.file.size > (1 * 1024 * 1024)) {
                    fs.readFile(req.file.path, (err, data) => {
                        if(err) {
                            req.session.error = {
                                message: err.message,
                                status: err.status || 500
                            };
                            console.log(err);
                            res.redirect(`${config.services.nashi.domain}${req.session.redir || "/error"}`);
                        } else {
                            sharp(data, { failOnError: false, withoutEnlargement: true }).resize(2000).toFile(req.file.path).then(info => {
                                console.log(info);
                                res.redirect(`${config.services.nashi.domain}${req.session.redir || ""}`);
                            }).catch(err => {
                                req.session.error = {
                                    message: err.message,
                                    status: err.status || 500
                                };
                                console.log(err);
                                res.redirect(`${config.services.nashi.domain}${req.session.redir || "/error"}`);
                            });
                        }
                    });
                } else {
                    res.redirect(`${config.services.nashi.domain}${req.session.redir || ""}`);
                }
            }
        });
    });
    app.get("/:path", (req, res, next) => {
        let file = path.join(newdir, req.params.path);
        if(!path.extname(file).slice(1)) return next();
    
        let image_id = req.params.path.split('.')[0];
        let file_format = req.params.path.split('.')[1];

        let file_size = constants.sizes[req.query.size || "max"] || constants.sizes["max"];
        mysql.connection.execute(`SELECT * FROM images WHERE image_id = ? AND hidden = 0`, [image_id], (error, result) => {
            if(error) return next(error);
            if(!result[0]) return next();
            if(file_format !== result[0].file_format) return res.redirect(301, `/${image_id}.${result[0].file_format}`);
            sharp(file, { failOnError: false }).resize(file_size).toBuffer().then(data => res.end(data)).catch(err => next(err));
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
