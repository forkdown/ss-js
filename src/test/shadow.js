"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const net_1 = require("net");
const futoin_hkdf_1 = __importDefault(require("futoin-hkdf"));
const log = require("./log");
const { Encryptor } = require("./encrypt");
const ipBuffer = require("./ipBuffer");
const enc = require("./encryptorTest");
const crypto = require("crypto");
class Shadow {
    constructor(password, method, localSocket, remoteSocket) {
        this.error = false;
        this.remoteAddr = "";
        this.remotePort = 0;
        this.encryptor = new Encryptor("evenardo", "aes-256-cfb");
        this.dataCacheFromLocal = [];
        this.dataCacheFromRemote = [];
        this.localSocket = new net_1.Socket();
        this.remoteSocket = new net_1.Socket();
        this.headerLength = 0;
        this.isFirst = true;
        this.encryptor = new Encryptor(password, method);
        this.localSocket = localSocket;
        this.remoteSocket = remoteSocket;
    }
    onClose() {
        this.localSocket.end();
        this.localSocket.destroy();
        this.remoteSocket.end();
        this.remoteSocket.destroy();
    }
    onDrain() {
        this.localSocket.resume();
        this.remoteSocket.resume();
    }
    writeToLocal() {
        while (this.dataCacheFromRemote.length) {
            this.localSocket.write(this.dataCacheFromRemote.shift());
        }
    }
    writeToRemote() {
        while (this.dataCacheFromLocal.length) {
            this.remoteSocket.write(this.dataCacheFromLocal.shift());
        }
    }
    onLocalDataAEAD(data) {
        try {
            // console.log(data);
            //
            // let dataDecrypted = enc.decrypt("evenardo", data);
            if (this.isFirst) {
                let psk = Buffer.from("a218ba5edad3d9f2d45d479d7d12a1dcdfa5df372bcedbd53aa0528e23919d79", "hex");
                let salt = data.slice(0, 32);
                let payloadLen = data.slice(32, 34);
                let payloadLenTag = data.slice(34, 50);
                let key = futoin_hkdf_1.default(psk, 32, { salt: salt, info: "ss-subkey", hash: "SHA-1" });
                let nonce = Buffer.alloc(12);
                let payloadLenDecipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
                payloadLenDecipher.setAuthTag(payloadLenTag);
                let len = payloadLenDecipher.update(payloadLen).readUInt16BE(0);
                payloadLenDecipher.final();
                console.log(len.toString());
            }
            else {
            }
        }
        catch (e) {
            log.error("connection on data error " + e);
            this.error = true;
        }
    }
    onLocalData(data) {
        // let dataDecrypted = this.encryptor.decrypt(data);
        try {
            console.log(data);
            let dataDecrypted = enc.decrypt("evenardo", data);
            if (this.isFirst) {
                this.parseHeader(dataDecrypted);
                this.parseFirstData(dataDecrypted);
                this.isFirst = false;
            }
            else {
                this.decryptDataFromLocalAndPush(dataDecrypted);
            }
        }
        catch (e) {
            log.error("connection on data error " + e);
            this.error = true;
        }
    }
    onRemoteData(data) {
        try {
            // let dataEncrypted = this.encryptor.encrypt(data);
            let dataEncrypted = enc.encrypt("evenardo", data);
            this.encryptDataFromRemoteAndPush(dataEncrypted);
        }
        catch (e) {
            log.error("connection on data error " + e);
            this.error = true;
        }
    }
    encryptDataFromRemoteAndPush(encryptedData) {
        this.dataCacheFromRemote.push(encryptedData);
    }
    parseHeader(dataDecrypted) {
        let addrType = dataDecrypted[0];
        if (addrType === void 0) {
            this.error = true;
        }
        if (addrType !== 3 && addrType !== 1 && addrType !== 4) {
            log.error("unsupported addrtype: " + addrType + " maybe wrong password");
            this.error = true;
            return;
        }
        if (addrType === 3) {
            let addrLen = dataDecrypted[1];
            this.remoteAddr = dataDecrypted.slice(2, 2 + addrLen).toString("binary");
            this.remotePort = dataDecrypted.readUInt16BE(2 + addrLen);
            this.headerLength = 2 + addrLen + 2;
        }
        if (addrType === 1) {
            this.remoteAddr = ipBuffer.ipBufferToString(dataDecrypted.slice(1, 5));
            this.remotePort = dataDecrypted.readUInt16BE(5);
            this.headerLength = 1 + 4 + 2;
        }
        if (addrType === 4) {
            this.remoteAddr = ipBuffer.ipBufferToString(dataDecrypted.slice(1, 17));
            this.remotePort = dataDecrypted.readUInt16BE(17);
            this.headerLength = 1 + 16 + 2;
        }
        return;
    }
    parseFirstData(dataDecrypted) {
        if (dataDecrypted.length > this.headerLength) {
            this.dataCacheFromLocal.push(Buffer.from(dataDecrypted.slice(this.headerLength)));
            return;
        }
        this.error = true;
    }
    decryptDataFromLocalAndPush(decryptedData) {
        this.dataCacheFromLocal.push(decryptedData);
    }
}
exports.Shadow = Shadow;
