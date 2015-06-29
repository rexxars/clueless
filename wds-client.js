/* global __resourceQuery */
/* eslint no-console: 0 */
'use strict';

var io = require('socket.io-client');
var scriptElements = document.getElementsByTagName('script');
io = io.connect(typeof __resourceQuery === 'string' && __resourceQuery ?
    __resourceQuery.substr(1) :
    scriptElements[scriptElements.length - 1].getAttribute('src').replace(/\/[^\/]+$/, '')
);

io.on('css', function(file) {
    var links = document.head.querySelectorAll('link[href*="' + file + '"]'),
        numLinks = links.length;

    if (numLinks) {
        console.log('[WDS] CSS file updated, reloading: ' + file);
    }

    while (numLinks--) {
        var href = links[numLinks].href.replace(/[?&]wdsBreak=([^&$]*)/, '');
        links[numLinks].href = href + (href.indexOf('?') >= 0 ? '&' : '?') + 'wdsBreak=' + Date.now();
    }
});
