const express = require('express');
const request = require('request');
const fs = require('fs');

var URL = require('url-parse');
var _ = require('lodash');
var async = require('async');
var FormData = require('form-data');

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
        if (!error && response.body['@id'] != undefined) {
            var parentid = response.body['@id'];       
            
            options = {
                method: 'PUT',
                preambleCRLF: true,
                postambleCRLF: true,
                url: `${url.origin}/@api/deki/pages/${parentid}/import?dream.out.format=json&filename=${pageid}.mtarc&behavior=async`,
                auth: {
                    user: 'mtimport',
                    pass: '1234Mind'
                },
                json: true,
                multipart: [
                    {
                        'content-type': 'application/json',
                        body: fs.readFileSync(__dirname + `/tmp/${pageid}.mtarc`)
                    }
                ]
            }

            request.put(options, (err, res, body) => {
                if (response.statusCode != 200) {
                    console.log('Failed upload to' + url.origin);
                    console.log(body);
                    console.log(options);
                    setTimeout(() => {
                        upload_file(params, callback);
                    }, 10000)
                } else {
                    console.log('Complete');
                    console.log(body);
                    console.log(params.destination);
                    callback();
                }
            })

        } else {
            // log error
            console.log(error);
            console.log(options, response.body);
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

                    // loop through all destinations and post mtarc
                    stream.on('close', () => {
                        console.log('uploading now');
                        for (var x in incomingRoutes.destinations) {
                            var destination = incomingRoutes.destinations[x];
                            queue.push({pageid, destination});
                        }
                    })

                    // store new routes
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
    var deleteOriginal = req.query.deleteOriginal != undefined ? req.query.deleteOriginal : false;

    var incomingRoutes = req.body.incomingRoutes;

    if (pageid || incomingRoutes != undefined) {
        getRoutes(pageid, (routes, err) => {
            if (err) {
                res.status(400).send(err);
            } else {
                // Get difference between submitted routes and stored routes
                var updatedLocations = _.difference(routes.destinations, incomingRoutes.destinations);
                var pageName = '/' + incomingRoutes.name;

                console.log(incomingRoutes.destinations);

                var deleteRoutes = incomingRoutes.destinations;

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
                    if (err) {

                    } else {
                        // loop through all destinations and delete page
                        for (var x in deleteRoutes) {

                            var destinationURL = new URL(deleteRoutes[x])
                            deletePath = decodeURIComponent(destinationURL.pathname + pageName);
                            deletePath = encodeURIComponent(encodeURIComponent(deletePath));
                            var deleteURL = `${destinationURL.origin}/@api/deki/pages/=${deletePath}`;

                            options = {
                                url: deleteURL,
                                auth: {
                                    user: 'mtimport',
                                    pass: '1234Mind'
                                }
                            }

                            console.log(options);

                            request.delete(options, (err, response) => {
                                if (err || response.statusCode != 200) {
                                    // log error
                                    
                                }
                                console.log(err, response.body);
                            })
                        }

                        if (deleteOriginal) {
                            // delete original page
                            options = {
                                url: `${url.origin}/@api/deki/pages/${pageid}`,
                                auth: {
                                    user: 'mtimport',
                                    pass: '1234Mind'
                                }
                            }

                            request.delete(options, (err, response) => {
                                if (err || response.statusCode != 200) {
                                    // log error
                                }
                            })
        
                            // delete routes
                            fs.unlink(__dirname + `/files/${pageid}.txt`, (err) => {
                                if (!err) {
                                    res.json({
                                        msg: 'All pages deleted'
                                    })
                                }
                            });
                        } else {
                            // update current routes
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
            }
        });
    } else {
        res.status(400).json({
            message: "Missing parameter {pageid}"
        })
    }
});

module.exports = router;