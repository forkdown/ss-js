import {Socket} from "net";
import hkdf from "futoin-hkdf";

const log = require("./log");
const {Encryptor} = require("./encrypt");
const ipBuffer = require("./ipBuffer");
const enc = require("./encryptorTest");
import crypto = require('crypto');

export class Shadow {
    public error = false;
    public remoteAddr: string = "";
    public remotePort: number = 0;
    private encryptor = new Encryptor("evenardo", "aes-256-cfb");
    private dataCacheFromLocal: any[] = [];
    private dataCacheFromRemote: any[] = [];
    private localSocket = new Socket();
    private remoteSocket = new Socket();
    private headerLength: number = 0;
    private isFirst: boolean = true;

    constructor(password: string, method: string, localSocket: Socket, remoteSocket: Socket) {
        this.encryptor = new Encryptor(password, method);
        this.localSocket = localSocket;
        this.remoteSocket = remoteSocket;
    }

    public onClose() {
        this.localSocket.end();
        this.localSocket.destroy();
        this.remoteSocket.end();
        this.remoteSocket.destroy();
    }

    public onDrain() {
        this.localSocket.resume();
        this.remoteSocket.resume();
    }

    public writeToLocal() {
        while (this.dataCacheFromRemote.length) {
            this.localSocket.write(this.dataCacheFromRemote.shift());
        }
    }

    public writeToRemote() {
        while (this.dataCacheFromLocal.length) {
            this.remoteSocket.write(this.dataCacheFromLocal.shift());
        }
    }

    public onLocalDataAEAD(data: Buffer) {
        try {
            // console.log(data);
            //
            // let dataDecrypted = enc.decrypt("evenardo", data);

            if (this.isFirst) {
                let psk = Buffer.from("a218ba5edad3d9f2d45d479d7d12a1dcdfa5df372bcedbd53aa0528e23919d79", "hex")


                let salt = data.slice(0, 32);
                let payloadLen = data.slice(32, 34);
                let payloadLenTag = data.slice(34, 50);

                let key = hkdf(psk, 32, {salt: salt, info: "ss-subkey", hash: "SHA-1"});
                let nonce = Buffer.alloc(12);

                let payloadLenDecipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
                payloadLenDecipher.setAuthTag(payloadLenTag);
                let len = payloadLenDecipher.update(payloadLen).readUInt16BE(0);
                payloadLenDecipher.final();
                console.log(len.toString())

            } else {
            }
        } catch (e) {
            log.error("connection on data error " + e);
            this.error = true;
        }
    }

    public onLocalData(data: Buffer) {
        // let dataDecrypted = this.encryptor.decrypt(data);
        try {
            console.log(data);

            let dataDecrypted = enc.decrypt("evenardo", data);

            if (this.isFirst) {
                this.parseHeader(dataDecrypted);
                this.parseFirstData(dataDecrypted);
                this.isFirst = false;
            } else {
                this.decryptDataFromLocalAndPush(dataDecrypted);
            }
        } catch (e) {
            log.error("connection on data error " + e);
            this.error = true;
        }
    }

    public onRemoteData(data: Buffer) {
        try {
            // let dataEncrypted = this.encryptor.encrypt(data);
            let dataEncrypted = enc.encrypt("evenardo", data);
            this.encryptDataFromRemoteAndPush(dataEncrypted);
        } catch (e) {
            log.error("connection on data error " + e);
            this.error = true;
        }
    }

    private encryptDataFromRemoteAndPush(encryptedData: Buffer): void {
        this.dataCacheFromRemote.push(encryptedData)
    }

    private parseHeader(dataDecrypted: Buffer): void {
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
        return
    }

    private parseFirstData(dataDecrypted: Buffer): void {
        if (dataDecrypted.length > this.headerLength) {
            this.dataCacheFromLocal.push(Buffer.from(dataDecrypted.slice(this.headerLength)));
            return;
        }
        this.error = true;
    }

    private decryptDataFromLocalAndPush(decryptedData: Buffer): void {
        this.dataCacheFromLocal.push(decryptedData);
    }
}

