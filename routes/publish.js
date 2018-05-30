const express = require('express');
const request = require('request');
const fs = require('fs');
const requestsync = require('sync-request');
const unzip = require('unzipper');
const path = require('path');
var zipFolder = require('zip-folder');
var archiver = require('archiver');

var AWS = require('aws-sdk');
var URL = require('url-parse');
var _ = require('lodash');
var async = require('async');
var cors = require('cors');

var router = express.Router();

var s3 = new AWS.S3({
    accessKeyId: process.env.S3_KEY,
    secretAccessKey: process.env.S3_SECRET,
    apiVersion: '2006-03-01',
    params: { Bucket: 'electrolux-publish-tool' }
})

var upload_file = (params, callback) => {
    // upload file
    var pageid = params.pageid;
    var url = new URL(params.destination);
    importURL = decodeURIComponent(url.pathname);
    importURL = encodeURIComponent(encodeURIComponent(importURL));

    var options = {
        url: `${url.origin}/@api/deki/pages/=${importURL}?dream.out.format=json`,
        auth: {
            user: process.env.MT_USERNAME,
            pass: process.env.MT_PASSWORD
        },
        json: true
    }

    request.get(options, (error, response) => {
        if (!error && response.body['@id'] != undefined) {
            var parentid = response.body['@id'];
            var finalDestinationURL = response.body['uri.ui'];

            console.log(finalDestinationURL);

            options = {
                method: 'PUT',
                preambleCRLF: true,
                postambleCRLF: true,
                url: `${url.origin}/@api/deki/pages/${parentid}/import?dream.out.format=json&filename=${pageid}.mtarc&behavior=async`,
                auth: {
                    user: process.env.MT_USERNAME,
                    pass: process.env.MT_PASSWORD
                },
                json: true,
                multipart: [
                    {
                        'content-type': 'application/json',
                        body: fs.readFileSync(`/tmp/${pageid}.mtarc`)
                    }
                ]
            }

            request.put(options, (err, res, body) => {
                if (res.statusCode != 200) {
                    console.log('Failed upload to' + url.origin);
                    console.log(res);
                    console.log(options);
                    setTimeout(() => {
                        upload_file(params, callback);
                    }, 10000)
                } else {
                    console.log('Complete');
                    console.log(params.destination);
                    options = {
                        method: 'GET',
                        url: `${$finalDestinationURL}?nocache=true`,
                        auth: {
                            user: process.env.MT_USERNAME,
                            pass: process.env.MT_PASSWORD
                        },
                        json: true
                    }

                    request.get(options, (_a, _b, _c) => {
                        callback();
                    })
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

    s3.getObject({ Key: `${pageid}.txt` }, function(err, data) {
        if (err) {
            callback(null, err.message);
        } else {
            callback(JSON.parse(data.Body.toString()));
        }
    });
}

var saveRoutes = (pageid, routes, callback) => {
    var base64data = new Buffer(JSON.stringify(routes, null, 2));

    s3.putObject({
        Key: `${pageid}.txt`,
        Body: base64data
    }, function(err) {
        if (err) {
            callback(err);
        } else {
            callback();
        }
    })
}

router.get('/', cors(),  (req, res) => {
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

router.post('/', cors(), (req, res) => {
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
                user: process.env.MT_USERNAME,
                pass: process.env.MT_PASSWORD
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
                        user: process.env.MT_USERNAME,
                        pass: process.env.MT_PASSWORD
                    },
                    json: true
                }


                request.get(options, (err, response) => {

                    var parentid = response.body['page.parent']['@id'];
                    options = {
                        url: `${url.origin}/@api/deki/pages/${pageid}/export/${pageid}?relto=${parentid}`,
                        auth: {
                            user: process.env.MT_USERNAME,
                            pass: process.env.MT_PASSWORD
                        }
                    }

                    var stream = request.get(options).pipe(unzip.Extract({path: `/tmp/${pageid}`})).on('close', () => {
                        setTimeout(() => {
                            fs.readdir(`/tmp/${pageid}/relative`, (err, files) => {
                                if( err ) {
                                    console.error( "Could not list the directory.", err );
                                    process.exit(1);
                                }
                                updatefile = '';
                                updatedata = '';
                                files.forEach((file, index) => {
                                    if (file != '.DS_Store') {
                                        var data = fs.readFileSync(`/tmp/${pageid}/relative/${file}/page.xml`, 'utf8');
                                        if (typeof(data) == "string") {
                                            var pattern = /<img\s*alt=".*"\s*class=".*"\s*src.path=".*"\s*src.filename=".*"\s*\/>/g;
                                            var result = String(data).match(pattern);
                                            if (result) {
                                                result.forEach((path) => {
                                                    var imagePath = /(?:src.path=")(.*)(?:"\ssrc)/g.exec(path)[1];
                                                    var filename = /(?:src.filename=")(.*)(?:"\s\/>)/g.exec(path)[1];
                                                    var mediaURL;
                                                    if (imagePath.startsWith('//')) {
                                                        mediaURL = `${url.origin}/@api/deki/pages/${pageid}/files/?dream.out.format=json`

                                                    } else {
                                                        mediaURL = `${url.origin}/@api/deki/pages/=${encodeURIComponent(encodeURIComponent(imagePath))}/files/?dream.out.format=json`
                                                    }
                                                    options.url = mediaURL
                                                    var updatedSrc = ""
                                                    const res = requestsync('GET', mediaURL, {
                                                        headers: {authorization: 'Basic ' + Buffer(`${process.env.MT_USERNAME}:${process.env.MT_PASSWORD}`).toString('base64')}
                                                    });
                                                    console.log(mediaURL);
                                                    const body = JSON.parse(res.getBody('utf8'));
                                                    if ("@href" in body.file && body.file.filename == filename) {
                                                        updatedSrc = body.file.contents['@href'];
                                                    } else {
                                                        body.file.forEach((file) => {
                                                            if (file.filename == filename) {
                                                                updatedSrc = file.contents['@href'];
                                                            }
                                                        })
                                                    }
                                                    var newPath = path.replace(/(?:src.*=")(.*)(?:"\s\/>)/g, `src="${updatedSrc}" />`);
                                                    data = data.replace(path, newPath);
                                                });
                                                fs.writeFileSync(`/tmp/${pageid}/relative/${file}/page.xml`, data, 'utf8');
                                            }

                                            var pattern = /<a((?!href\.anchor).)*?href\.filename=".*?">/g;
                                            var result = String(data).match(pattern);
                                            if (result) {
                                                result.forEach((path) => {
                                                    var imagePath = /(?:href.path=")(.*)(?:"\shref)/g.exec(path)[1];
                                                    var filename = /(?:href.filename=")(.*)(?:">)/g.exec(path)[1];

                                                    if (imagePath && filename) {
                                                        var mediaURL = `${url.origin}/@api/deki/pages/=${encodeURIComponent(encodeURIComponent(imagePath))}/files/?dream.out.format=json`
                                                        console.log(mediaURL);
                                                        options.url = mediaURL
                                                        var updatedSrc = ""
                                                        const res = requestsync('GET', mediaURL, {
                                                            headers: {authorization: 'Basic ' + Buffer(`${process.env.MT_USERNAME}:${process.env.MT_PASSWORD}`).toString('base64')}
                                                        });
                                                        const body = JSON.parse(res.getBody('utf8'));
                                                        if ("@href" in body.file && body.file.filename == filename) {
                                                            updatedSrc = body.file['@href'];
                                                        } else {
                                                            body.file.forEach((file) => {
                                                                if (file.filename == filename) {
                                                                    updatedSrc = file.contents['@href'];
                                                                }
                                                            })
                                                        }
                                                        var newPath = path.replace(/(?:href.*=")(.*)(?:")/g, `href="${updatedSrc}"`);
                                                        console.log(path, newPath);
                                                        data = data.replace(path, newPath);
                                                    }
                                                });
                                                fs.writeFileSync(`/tmp/${pageid}/relative/${file}/page.xml`, data, 'utf8');
                                            }
                                            fs.writeFileSync(`/tmp/${pageid}/relative/${file}/page.xml`, data, 'utf8');
                                            var output = fs.createWriteStream(`/tmp/${pageid}.mtarc`);
                                            var archive = archiver('zip');
                                            archive.pipe(output);
                                            archive.directory(`/tmp/${pageid}`, false);
                                            archive.finalize();

                                            for (var x in incomingRoutes.destinations) {
                                                var destination = incomingRoutes.destinations[x];
                                                queue.push({pageid, destination});
                                            }
                                        }
                                    }
                                });
                            });
                        }, 3000);
                    });

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

router.delete('/', cors(),  (req, res) => {
    var pageid = req.query.pageid != undefined ? req.query.pageid : null;
    var deleteOriginal = req.query.deleteOriginal != undefined ? req.query.deleteOriginal : false;

    console.log("delete Original: ", deleteOriginal);

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
                        user: process.env.MT_USERNAME,
                        pass: process.env.MT_PASSWORD
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
                                    user: process.env.MT_USERNAME,
                                    pass: process.env.MT_PASSWORD
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

                        if (deleteOriginal === 'true') {
                            // delete original page

                            console.log('Deleting Original');

                            options = {
                                url: `${url.origin}/@api/deki/pages/${pageid}`,
                                auth: {
                                    user: process.env.MT_USERNAME,
                                    pass: process.env.MT_PASSWORD
                                }
                            }

                            request.delete(options, (err, response) => {
                                if (err || response.statusCode != 200) {
                                    // log error
                                }
                            })

                            // delete routes
                            var params = {
                                Delete: { // required
                                    Objects: [ // required
                                    {
                                      Key: `${pageid}` // required
                                    }
                                    ],
                                },
                            };

                            s3.deleteObjects(params, function(err, data) {
                                if (err) console.log(err, err.stack); // an error occurred
                                else     console.log(res.json({ msg: 'All pages deleted' }));           // successful response
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
