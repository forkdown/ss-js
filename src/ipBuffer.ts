/**
 *      http://kevin.vanzonneveld.net
 *   original by: Theriault
 *     example 1: inet_pton('::');
 *     returns 1: '\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0' (binary)
 *     example 2: inet_pton('127.0.0.1');
 *     returns 2: '\x7F\x00\x00\x01' (binary)
 */
function ipStringToBuffer(ipString: string): Buffer {
    let ipv4Regex = /^(?:\d{1,3}(?:\.|$)){4}/g; // IPv4
    let ipv4match: RegExpMatchArray | null = ipString.match(ipv4Regex);
    if (ipv4match) {
        let split: number[] = ipv4match[0].split('.').map((item: any) => {
            return Number(item);
        });
        return Buffer.from(split);
    }
    let ipv6Regex = /^((?:[\da-f]{1,4}(?::|)){0,8})(::)?((?:[\da-f]{1,4}(?::|)){0,8})$/;    // IPv6
    let ipv6match: any = ipString.match(ipv6Regex);
    if (ipv6match) {
        let bufferArr: Buffer[] = new Array(4).fill(Buffer.alloc(0));
        for (let j = 1; j <= 3; j++) {
            // Index 2 is :: and if no length, continue.
            if (ipv6match[j].length === 0 || j === 2) {
                continue;
            }
            bufferArr[j] = Buffer.from(ipv6match[j].split(":").join(""), "hex");
        }
        bufferArr[2] = Buffer.alloc(16 - bufferArr[1].length - bufferArr[3].length, 0);
        return Buffer.concat(bufferArr);
    }
    return Buffer.alloc(0)
}

/**
 *   http://kevin.vanzonneveld.net
 *   original by: Theriault
 *     example 1: inet_ntop('\x7F\x00\x00\x01');
 *     returns 1: '127.0.0.1'
 *     example 2: inet_ntop('\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\1');
 *     returns 2: '::1'*
 */
function ipBufferToString(ipBuffer: Buffer): string {
    if (ipBuffer.length === 4) { // IPv4
        return ipBuffer.map((item: any) => item.toString()).join(".");
    }
    if (ipBuffer.length === 16) { // IPv6
        let arr: string[] = new Array(16);
        ipBuffer.forEach((item: number) => {
            let hex = item.toString(16);
            arr.push(hex.length > 1 ? hex : "0" + hex);
        });
        let match: any = arr.join("").match(/\w{4}/g);
        return match.join(":");
    }
    return "";
}

module.exports = {
    ipStringToBuffer, ipBufferToString

};
