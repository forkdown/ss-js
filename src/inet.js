function main() {
    inet_pton("127.96.8.1")
}

main();

function inet_pton(ipString) {
    // http://kevin.vanzonneveld.net
    // +   original by: Theriault
    // *     example 1: inet_pton('::');
    // *     returns 1: '\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0' (binary)
    // *     example 2: inet_pton('127.0.0.1');
    // *     returns 2: '\x7F\x00\x00\x01' (binary)
    var r, x, i, j, f = String.fromCharCode;
    // let matched = ipString.match(/^(?:\d{1,3}(?:\.|$)){4}/); // IPv4
    let matched = ipString.match(/(((\d{1,2})|(1\d{2})|(2[0-4]\d)|(25[0-5]))\.){3}((\d{1,2})|(1\d{2})|(2[0-4]\d)|(25[0-5]))/); // IPv4
    if (matched) {
        matched = matched[0].split('.');
        console.log(matched);
        matched = f(matched[0]) + f(matched[1]) + f(matched[2]) + f(matched[3]);
        // Return if 4 bytes, otherwise false.
        return matched.length === 4 ? matched : false;
    }
    r = /^((?:[\da-f]{1,4}(?::|)){0,8})(::)?((?:[\da-f]{1,4}(?::|)){0,8})$/;
    matched = ipString.match(r); // IPv6
    if (matched) {
        // Translate each hexadecimal value.
        for (j = 1; j < 4; j++) {
            // Indice 2 is :: and if no length, continue.
            if (j === 2 || matched[j].length === 0) {
                continue;
            }
            matched[j] = matched[j].split(':');
            for (i = 0; i < matched[j].length; i++) {
                matched[j][i] = parseInt(matched[j][i], 16);
                // Would be NaN if it was blank, return false.
                if (isNaN(matched[j][i])) {
                    return false; // Invalid IP.
                }
                matched[j][i] = f(matched[j][i] >> 8) + f(matched[j][i] & 0xFF);
            }
            matched[j] = matched[j].join('');
        }
        x = matched[1].length + matched[3].length;
        if (x === 16) {
            return matched[1] + matched[3];
        } else if (x < 16 && matched[2].length > 0) {
            return matched[1] + (new Array(16 - x + 1)).join('\x00') + matched[3];
        }
    }
    return false; // Invalid IP.
}

function inet_ntop(a) {
    // http://kevin.vanzonneveld.net
    // +   original by: Theriault
    // *     example 1: inet_ntop('\x7F\x00\x00\x01');
    // *     returns 1: '127.0.0.1'
    // *     example 2: inet_ntop('\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\1');
    // *     returns 2: '::1'
    var i = 0,
        m = '',
        c = [];
    if (a.length === 4) { // IPv4
        a += '';
        return [
            a.charCodeAt(0), a.charCodeAt(1), a.charCodeAt(2), a.charCodeAt(3)].join('.');
    } else if (a.length === 16) { // IPv6
        for (i = 0; i < 16; i += 2) {
            var group = (a.slice(i, i + 2)).toString("hex");
            //replace 00b1 => b1  0000=>0
            while (group.length > 1 && group.slice(0, 1) == '0')
                group = group.slice(1);
            c.push(group);
        }
        return c.join(':').replace(/((^|:)0(?=:|$))+:?/g, function (t) {
            m = (t.length > m.length) ? t : m;
            return t;
        }).replace(m || ' ', '::');
    } else { // Invalid length
        return false;
    }
}

exports.inet_pton = inet_pton;
exports.inet_ntop = inet_ntop;
