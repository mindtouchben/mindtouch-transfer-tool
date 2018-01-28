const express = require('express');
const request = require('request');

var bodyParser = require('body-parser');

const port = process.env.PORT || 3000; 

var app = express();

app.use(bodyParser.json({limit: '50mb'}));

app.use('/files', express.static('routes/tmp'));

app.use(function (req, res, next) {

    // Website you wish to allow to connect
    res.setHeader('Access-Control-Allow-Origin', 'https://benr-demo.mindtouch.us');
    res.setHeader('Access-Control-Allow-Origin', 'https://www.how-to-and-help.com');

    // Request methods you wish to allow
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');

    // Request headers you wish to allow
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');

    // Set to true if you need the website to include cookies in the requests sent
    // to the API (e.g. in case you use sessions)
    res.setHeader('Access-Control-Allow-Credentials', true);

    // Pass to next layer of middleware
    next();
});

var publish = require('./routes/publish');

app.get('/', (req, res) => {

});

app.use('/@api/publish', publish);

app.listen(port, ()=> {
    console.log(`Server is up on port ${port}`);
});
