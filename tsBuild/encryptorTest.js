"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const crypto = require("crypto");
const futoin_hkdf_1 = __importDefault(require("futoin-hkdf"));
function encrypt(masterKey, data) {
    let salt = crypto.randomBytes(64);
    let key = futoin_hkdf_1.default(masterKey, 32, { salt: salt, info: "ss-subkey", hash: "SHA-1" });
    let iv = futoin_hkdf_1.default(masterKey, 16, { salt: salt, info: "ss-iv", hash: "SHA-1" });
    let cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let s = cipher.update(data);
    cipher.final();
    let authTag = cipher.getAuthTag();
    let encrypted = Buffer.concat([salt, iv, authTag, s]);
    return encrypted.toString("binary");
}
function decrypt(masterKey, encrypted) {
    let encryptedBuffer = Buffer.from(encrypted, "binary");
    let salt = encryptedBuffer.slice(0, 64);
    let iv = encryptedBuffer.slice(64, 80);
    let tag = encryptedBuffer.slice(80, 96);
    let data = encryptedBuffer.slice(96);
    let key = futoin_hkdf_1.default(masterKey, 32, { salt: salt, info: "ss-subkey", hash: "SHA-1" });
    let decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    let s = decipher.update(data).toString();
    decipher.final();
    return s;
}
let key = 'evenardo';
let data = "Hello, nodejs.和java程序进行交互的时候，java那边使用AES 128位填充模式：AES/CBC/PKCS5Padding加密方法，在nodejs中采用" +
    "对应的aes-128-cbc加密方法就能对应上，因为有使用向量（iv），所以nodejs中要用createCipheriv方法，而不是createCipher。";
for (let i = 0; i < 9; i++) {
    data += data;
}
console.time("start");
let encrypted = encrypt(key, data);
let dec = decrypt(key, encrypted);
console.log(data === dec);
console.timeEnd("start");
//# sourceMappingURL=encryptorTest.js.map