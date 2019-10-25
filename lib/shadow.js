"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const net_1 = require("net");
const log = require("./log");
const { Encryptor } = require("./encrypt");
const ipBuffer = require("./ipBuffer");
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
    onLocalData(data) {
        let dataDecrypted = this.encryptor.decrypt(data);
        if (this.isFirst) {
            this.parseHeader(dataDecrypted);
            this.parseFirstData(dataDecrypted);
            this.isFirst = false;
        }
        else {
            this.decryptDataFromLocalAndPush(dataDecrypted);
        }
    }
    onRemoteData(data) {
        try {
            let dataEncrypted = this.encryptor.encrypt(data);
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
//# sourceMappingURL=shadow.js.map