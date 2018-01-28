const express = require('express');
const request = require('request');

var bodyParser = require('body-parser');
var cors = require('cors');

const port = process.env.PORT || 3000; 

var app = express();

app.use(bodyParser.json({limit: '50mb'}));
// app.use(cors());

app.use('/files', express.static('routes/tmp'));

app.use(function (req, res, next) {
    res.header("Access-Control-Allow-Origin", '*');
    res.header("Access-Control-Allow-Credentials", true);
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
    res.header("Access-Control-Allow-Headers", 'Origin,X-Requested-With,Content-Type,Accept,content-type,application/json');
    next();
});

var publish = require('./routes/publish');

app.get('/', (req, res) => {

});

app.use('/@api/publish', publish);

app.listen(port, ()=> {
    console.log(`Server is up on port ${port}`);
});
