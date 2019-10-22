const log = require("./log");
const {Encryptor} = require("./encrypt");
const utils = require("./utils");
const inet = require("./inet");

class Shadow {
    constructor(password, method, localSocket, remoteSocket) {
        this.error = false;
        this.remoteAddr = "";
        this.remotePort = 0;
        this._encryptor = new Encryptor(password, method);
        this._dataCacheFromLocal = [];
        this._dataCacheFromRemote = [];
        this._local = localSocket;
        this._remote = remoteSocket;
        this._headerLength = 0;
        this._isFirst = true;
    }

    writeToLocal() {
        while (this._dataCacheFromRemote.length) {
            this._local.write(this._dataCacheFromRemote.shift());
        }
    }

    writeToRemote() {
        while (this._dataCacheFromLocal.length) {
            this._remote.write(this._dataCacheFromLocal.shift());
        }
    }

    onLocalData(data) {
        let dataDecrypted = this._encryptor.decrypt(data);
        if (this._isFirst) {
            this._parseHeader(dataDecrypted);
            this._parseFirstData(dataDecrypted);
            this._isFirst = false;
        } else {
            this._decryptDataFromLocalAndPush(dataDecrypted);
        }
    }

    onRemoteData(data) {
        try {
            let dataEncrypted = this._encryptor.encrypt(data);
            this._encryptDataFromRemoteAndPush(dataEncrypted);
        } catch (e) {
            log.error("connection on data error " + e);
            this.error = true;
        }
    }

    _encryptDataFromRemoteAndPush(encryptedData) {
        this._dataCacheFromRemote.push(encryptedData)
    }

    _parseHeader(dataDecrypted) {
        let addrType = dataDecrypted[0];

        if (addrType === void 0) {
            this.error = true;
        }

        if (addrType !== 3 && addrType !== 1 && addrType !== 4) {
            log.error("unsupported addrtype: " + addrType + " maybe wrong password");
            this.error = true;
            return
        }
        if (addrType === 3) {
            let addrLen = dataDecrypted[1];
            this.remoteAddr = dataDecrypted.slice(2, 2 + addrLen).toString("binary");
            this.remotePort = dataDecrypted.readUInt16BE(2 + addrLen);
            this._headerLength = 2 + addrLen + 2;
        }
        if (addrType === 1) {
            this.remoteAddr = utils.inetNtoa(dataDecrypted.slice(1, 5));
            this.remotePort = dataDecrypted.readUInt16BE(5);
            this._headerLength = 1 + 4 + 2;
        }
        if (addrType === 4) {
            this.remoteAddr = inet.inet_ntop(dataDecrypted.slice(1, 17));
            this.remotePort = dataDecrypted.readUInt16BE(17);
            this._headerLength = 1 + 16 + 2;
        }
    }

    _parseFirstData(dataDecrypted) {
        if (dataDecrypted.length > this._headerLength) {
            this._dataCacheFromLocal.push(Buffer.from(dataDecrypted.slice(this._headerLength)));
            return;
        }
        this.error = true;
    }

    _decryptDataFromLocalAndPush(decryptedData) {
        this._dataCacheFromLocal.push(decryptedData);
    }
}

module.exports = {
    Shadow
};
