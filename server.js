const express = require('express');
const request = require('request');

var bodyParser = require('body-parser')

const port = process.env.PORT || 3000; 

var app = express();

app.use(bodyParser.json());

var publish = require('./routes/publish');

app.get('/', (req, res) => {

});

app.use('/@api/publish', publish);

app.listen(port, ()=> {
    console.log(`Server is up on port ${port}`);
});
