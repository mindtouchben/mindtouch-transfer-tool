const request = require('request');

module.exports = {
    getPageId: (url, path, classification = '') => {
        return new Promise((resolve, reject) => {
            if (typeof url === 'string' && typeof path === 'string') {
                if (!url.startsWith('http://') && !url.startsWith('https://')) {
                    url = `http://${url}`;
                }
                if (url.endsWith('/')) {
                    url = url.slice(0, -1);
                }
                if (path.indexOf('%')) {
                    path = encodeURIComponent(encodeURIComponent(path));
                }
                var options = {
                    url: `${url}/@api/deki/pages/=${path}?dream.out.format=json`,
                    auth: {
                        user: 'mtimport',
                        pass: '1234Mind'
                    },
                    json: true
                }
                request.get(options, (error, response, body) => {
                    if (error) {
                        reject(error.code);
                    } else {
                        var pageid = body['@id'];
                        resolve({ url, path, classification, pageid });
                    }
                })
            } else {
                reject('Parameters must be strings');
            }
        })
    },
    
    getDrafts: (url, pageid, classification = '') => {
        return new Promise((resolve, reject) => {
            if (pageid != 0) {
                if (classification.indexOf('%')) {
                    classification = encodeURIComponent(classification);
                }
                var options = {
                    url: `${url}/@api/deki/drafts/?parentid=${pageid}&dream.out.format=json` +
                         `&tags=${classification}&limit=1000&include=tags`,
                    auth: {
                        user: 'mtimport',
                        pass: '1234Mind'
                    },
                    json: true
                }
    
                request.get(options, (error, response, body) => {
                    var drafts;
                    if (body.pages.page instanceof Array) {
                        resolve(body.pages.page);
                    } else if (body.pages.page instanceof Object) {
                        resolve([body.pages.page]);
                    } else {
                        reject('No drafts found');
                    }
                });
            } else {
                reject('Path does not exist');
            }
        })
    }
}
