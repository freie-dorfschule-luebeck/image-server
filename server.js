const config = require("../nashi/config.json");
const constants = require("./constants");
const utility = require("../nashi/utility");
const express = require('express');
const expressSession = require('express-session');
const sharp = require('sharp');
const cors = require("cors");
const app = express(); app.listen(config.services.image_server.port, () => console.log(config.services.image_server.displayname + ' running on ' + config.services.image_server.port));

//next time i do shit for this i have to add file upload x3

const morgan = require("morgan");
app.use(morgan("dev"));
app.use(cors());
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

app.use(express.urlencoded({
    extended: true,
    limit: '500kb'
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
        // IS USER LOGGED IN
        if(!req.session.nick || !req.session.user_id) return next({
            message: "Du bist nicht angemeldet.",
            status: 401,
            forward: true
        });
        // USER PROFILE PICTURE UPLOAD
        if(req.params.type === "user") {
            // IS THE TYPE_ID DIFFERENT FROM THE USER'S ID
            if(req.session.user_id != req.params.type_id) return next({
                message: "Du kannst keine Profilbilder für andere Benutzer hochladen!",
                status: 403,
                forward: true
            });
            
            getImageID(req, 'png').then((image_id) => {
                fs.writeFile(path.join(newdir, image_id + ".png"), req.body.file.replace(/^data:image\/png;base64,/, ""), 'base64', (err) => {
                    // SOMETHING WENT WRONG WITH FILESYSTEM, NO PERMISSION?
                    if(err) {
                        return next({...err, ...{forward: true}});
                    }
                    res.redirect(`${config.services.nashi.domain}${req.session.redir || ""}`);
                });
            }).catch((err) => { 
                // SOMETHING WENT WRONG WITH MYSQL
                return next({...err, ...{forward: true}})
            });
        }
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
    body = {
        code: err.status || err.statusCode || 500,
        message: err.message || err
    };
    
    if(body.code === 413) {
        err.forward = true;
        body.message = "Ihr Bild ist zu groß!"
    }

    if(err.forward) {
        req.session.error = {
            message: body.message,
            status: body.code
        };
        return res.redirect(`${config.services.nashi.domain}/error`);
    }

    res.set('Content-Type', 'application/json');
    res.statusMessage = utility.errorHandling.ErrorStatusCodes[body.code];
    res.status(body.code).send(body);
});


const getImageID = (req, fileFormat) => {
    return new Promise((resolve, reject) => {
        mysql.connection.execute(`INSERT INTO ringo.images (user_id, type_id, type, file_format, hidden, created_at) VALUES (?, ?, ?, ?, "0", UTC_TIMESTAMP())`, [req.session.user_id, req.params.type_id, req.params.type, fileFormat], (error, result) => {
            if(error) return reject(new utility.errorHandling.SutekinaError(error.message, 500));
            return resolve(result.insertId);
        });
    })
}