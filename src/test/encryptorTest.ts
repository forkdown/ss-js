import crypto = require('crypto');
import hkdf from "futoin-hkdf";
import {Buffer} from "buffer";

function encrypt(masterKey: string, data: Buffer): Buffer {
    let salt = crypto.randomBytes(32);
    let key = hkdf(masterKey, 32, {salt: salt, info: "ss-subkey", hash: "SHA-1"});
    // let iv = hkdf(masterKey, 32, {salt: salt, info: "ss-iv", hash: "SHA-1"});

    let cipherPayload: crypto.CipherGCM = crypto.createCipher('aes-256-gcm', key);
    let cipherPayloadLen: crypto.CipherGCM = crypto.createCipher('aes-256-gcm', key);

    let payload = cipherPayload.update(data);
    cipherPayload.final();
    let payloadTag = cipherPayload.getAuthTag();

    let buf = Buffer.alloc(2);
    buf.writeUInt16BE(payload.length, 0);
    let payloadLen = cipherPayloadLen.update(buf);
    cipherPayloadLen.final();
    let payloadLenTag = cipherPayloadLen.getAuthTag();

    let encrypted: Buffer = Buffer.concat([salt, payloadLen, payloadLenTag, payload, payloadTag]);
    return encrypted
}

function hkdfTest() {
    let salt = Buffer.from("123456789012");
    let subKey = hkdf("evenardo", 32, {salt: salt, info: "ss-subkey", hash: "SHA-1"});
    console.log(subKey)
}

// hkdfTest();

function decryptShadow(masterKey: string, salt: Buffer, nonce: Buffer, encryptedBuffer: Buffer) {
    let payloadLen = encryptedBuffer.slice(0, 2);
    let payloadLenTag = encryptedBuffer.slice(2, 18);

    let key = hkdf(masterKey, 32, {salt: salt, info: "ss-subkey", hash: "SHA-1"});
    let payloadLenDecipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
    payloadLenDecipher.setAuthTag(payloadLenTag);
    let len = payloadLenDecipher.update(payloadLen).readUInt16BE(0);
    payloadLenDecipher.final();
    console.log(len.toString())

}

function decrypt(masterKey: string, encrypted: Buffer): Buffer {
    let encryptedBuffer = encrypted;

    let salt = encryptedBuffer.slice(0, 32);
    let payloadLen = encryptedBuffer.slice(32, 34);
    let payloadLenTag = encryptedBuffer.slice(34, 50);

    let key = hkdf(masterKey, 32, {salt: salt, info: "ss-subkey", hash: "SHA-1"});
    // let iv = hkdf(masterKey, 32, {salt: salt, info: "ss-iv", hash: "SHA-1"});
    let payloadLenDecipher = crypto.createDecipher('aes-256-gcm', key);
    payloadLenDecipher.setAuthTag(payloadLenTag);

    let len = payloadLenDecipher.update(payloadLen).readUInt16BE(0);
    payloadLenDecipher.final();

    let payload = encryptedBuffer.slice(50, 50 + len);
    let payloadTag = encryptedBuffer.slice(50 + len);

    let payloadDecipher = crypto.createDecipher('aes-256-gcm', key);
    payloadDecipher.setAuthTag(payloadTag);

    let dec = payloadDecipher.update(payload);
    payloadDecipher.final();
    return dec;
}

function test() {
    let key = 'evenardo';
    let data = "Hello2";
    console.time("start");
    let encrypted = encrypt(key, Buffer.from(data));
    let decrypted = decrypt(key, encrypted);
    console.log(data === decrypted.toString("binary"));
    console.timeEnd("start");
}

// test();
let bytes_to_key_results: any = {};

function EVP_BytesToKey(password: any, key_len: number, iv_len: number) {
    var count, d, data, i, iv, key, m, md5, ms;
    if (bytes_to_key_results["" + password + ":" + key_len + ":" + iv_len]) {
        return bytes_to_key_results["" + password + ":" + key_len + ":" + iv_len];
    }
    m = [];
    i = 0;
    count = 0;
    while (count < key_len + iv_len) {
        md5 = crypto.createHash('md5');
        data = password;
        if (i > 0) {
            data = Buffer.concat([m[i - 1], password]);
        }
        md5.update(data);
        d = md5.digest();
        m.push(d);
        count += d.length;
        i += 1;
    }
    ms = Buffer.concat(m);
    key = ms.slice(0, key_len);
    iv = ms.slice(key_len, key_len + iv_len);
    bytes_to_key_results[password] = [key, iv];
    return [key, iv];
}

console.log("haha");
let evpBytesToKey = EVP_BytesToKey(Buffer.from("evenardo", "binary"), 32, 32);
console.log(evpBytesToKey[0].toString("hex"));

module.exports = {
    encrypt, decrypt, decryptShadow
};



