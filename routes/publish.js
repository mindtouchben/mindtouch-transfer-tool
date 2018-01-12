const express = require('express');
const request = require('request');
const fs = require('fs');

var URL = require('url-parse');
var _ = require('lodash');
var async = require('async');

var router = express.Router();

var upload_file = (params, callback) => {
    // upload file
    var pageid = params.pageid;
    var url = new URL(params.destination);
    importURL = decodeURIComponent(url.pathname);
    importURL = encodeURIComponent(encodeURIComponent(importURL));

    var options = {
        url: `${url.origin}/@api/deki/pages/=${importURL}?dream.out.format=json`,
        auth: {
            user: 'mtimport',
            pass: '1234Mind'
        },
        json: true
    }

    request.get(options, (error, response) => {
        if (!error) {
            var parentid = response.body['@id'];            
            options = {
                url: `${url.origin}/@api/deki/pages/${parentid}/import?dream.out.format=json&filename=${pageid}.mtarc&behavior=async`,
                auth: {
                    user: 'mtimport',
                    pass: '1234Mind'
                },
                json: true
            }

            fs.createReadStream(__dirname + `/tmp/${pageid}.mtarc`).pipe(request.put(options, (error, response) => {
                console.log(response.body);
                console.log(params.destination);
                callback();
            }))
        } else {
            // log error
            console.log(error);
        }
    });
}

var queue = async.queue(upload_file, 5);

var getRoutes = (pageid, callback) => {
    // query database by pageid to check if routes exist 

    fs.readFile(__dirname + `/files/${pageid}.txt`, 'utf8', function(err, contents) {
        if (err) {
            callback(null, err.message);
        } else {
            callback(JSON.parse(contents));
        }
    });
}

var saveRoutes = (pageid, routes, callback) => {
    fs.writeFile(__dirname + `/files/${pageid}.txt`, JSON.stringify(routes, null, 2), (err, fd) => {
        callback(err);
    })
}

router.get('/', (req, res) => {
    var pageid = req.query.pageid != undefined ? req.query.pageid : null;

    if (pageid) {
        getRoutes(pageid, (routes, err) => {
            if (err) {
                res.status(400).json({
                    message: err
                });
            } else {
                res.json(routes);
            }
        });
    } else {
        res.status(400).json({
            message: "Missing parameter {pageid}"
        })
    }
});

router.post('/', (req, res) => {
    var pageid = req.query.pageid != undefined ? req.query.pageid : null;

    var incomingRoutes = req.body.incomingRoutes;

    // check if incoming routes have all elements if not return 400

    if (pageid && incomingRoutes != undefined) {

        // publish original page
        var url = new URL(incomingRoutes.sourceUrl);
        var publishURL = `${url.origin}/@api/deki/drafts/${pageid}/publish`;

        var options = {
            url: publishURL,
            auth: {
                user: 'mtimport',
                pass: '1234Mind'
            }
        }

        request.post(options, (err, response) => {
            // if (err || response.statusCode == 404) {
            if (err) {
                res.status(400).json({
                    message: "Something went wrong please try again"
                })
            } else {
                // download mtar from source
                options = {
                    url: `${url.origin}/@api/deki/pages/${pageid}?dream.out.format=json`,
                    auth: {
                        user: 'mtimport',
                        pass: '1234Mind'
                    },
                    json: true
                }

                request.get(options, (err, response) => {
                    
                    var parentid = response.body['page.parent']['@id'];
                    options = {
                        url: `${url.origin}/@api/deki/pages/${pageid}/export/${pageid}?relto=${parentid}`,
                        auth: {
                            user: 'mtimport',
                            pass: '1234Mind'
                        }
                    }

                    var stream = request.get(options).pipe(fs.createWriteStream(__dirname + `/tmp/${pageid}.mtarc`));
                    
                    stream.on('finish', () => {
                        for (var x in incomingRoutes.destinations) {
                            var destination = incomingRoutes.destinations[x];
                            queue.push({pageid, destination});
                        }
                    })

                    saveRoutes(pageid, incomingRoutes, (err) => {
                        if (err) {
                            res.status(400).json({
                                msg: err
                            })
                        } else {
                            // return reponse based on success
                            res.json({
                                msg: 'completed',
                                destinations: incomingRoutes
                            })
                        }
                    })
                })
        
                // loop through all destinations and post mtarc
            
                // store new routes
                
            }
        })
    } else {
        res.status(400).json({
            message: "Missing parameter {pageid} or post body"
        })
    }
});

router.delete('/', (req, res) => {
    var pageid = req.query.pageid != undefined ? req.query.pageid : null;
    var deleteOriginal = req.query.deleteOriginal != undefined ? req.query.pageid : false;

    var incomingRoutes = req.body.incomingRoutes;

    if (pageid || incomingRoutes != undefined) {
        getRoutes(pageid, (routes, err) => {
            if (err) {
                res.status(400).send(err);
            } else {
                // Get difference between submitted routes and stored routes

                var updatedLocations = _.difference(routes.destinations, incomingRoutes.destinations);

                // publish original page
                
                // loop through all destinations and delete page
            
                // return reponse based on success

                // update current routes

                if (deleteOriginal) {
                    // delete original page

                    // delete routes

                    fs.unlink(__dirname + `/files/${pageid}.txt`, (err) => {
                        if (!err) {
                            res.json({
                                msg: 'All pages deleted'
                            })
                        }
                    });
                } else {
                    getRoutes(pageid, (routes, err) => {
                        if (err) {
                            res.status(400).json({
                                message: err
                            });
                        } else {
                            routes.destinations = updatedLocations;
                            saveRoutes(pageid, routes, (err) => {
                                if (err) {
                                    res.status(400).json({
                                        msg: err
                                    })
                                } else {
                                    // return reponse based on success
                                    res.json({
                                        msg: 'completed',
                                        destinations: routes
                                    })
                                }
                            })
                        }
                    });
                }
            }
        });
    } else {
        res.status(400).json({
            message: "Missing parameter {pageid}"
        })
    }
});

module.exports = router;