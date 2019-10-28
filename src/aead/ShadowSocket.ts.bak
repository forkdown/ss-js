import {Socket} from "net";
import hkdf from "futoin-hkdf";

const chacha = require("chacha");
const log = require("../common/log");
const ipBuffer = require("../common/ip");
import crypto = require('crypto');


export class ShadowSocket {
    public error = false;
    public remoteAddr: string = "";
    public remotePort: number = 0;

    private dataCacheFromLocal: any[] = [];
    private dataCacheFromRemote: any[] = [];

    private localSocket = new Socket();
    private remoteSocket = new Socket();

    private headerLength: number = 0;
    private isFirst: boolean = true;
    private isRemoteFirst: boolean = true;

    private psk: Buffer = Buffer.from("a218ba5edad3d9f2d45d479d7d12a1dcdfa5df372bcedbd53aa0528e23919d79", "hex");
    private salt: Buffer = Buffer.alloc(32);
    private subKey: Buffer = Buffer.alloc(32);

    private saltRemote: Buffer = crypto.randomBytes(32);
    private nonceNumber: number = 0;
    private nonceBuffer: Buffer = Buffer.alloc(12);
    private nonceNumberRemote: number = 0;
    private nonceBufferRemote: Buffer = Buffer.alloc(12);

    constructor(password: string, method: string, localSocket: Socket) {
        this.localSocket = localSocket;
    }

    public parseHeader() {
        this.salt = this.localSocket.read(32);
        this.subKey = hkdf(this.psk, 32, {salt: this.salt, info: "ss-subkey", hash: "SHA-1"});
        this.readAddress();
    }

    private readPayload(): Buffer {
        this.nonceBuffer.writeUInt16LE(this.nonceNumber++, 0);
        let payloadLenDecipher = chacha.createDecipher(this.subKey, this.nonceBuffer);
        this.nonceBuffer.writeUInt16LE(this.nonceNumber++, 0);
        let payloadDecipher = chacha.createDecipher(this.subKey, this.nonceBuffer);

        let payloadLen = this.localSocket.read(2);
        let payloadLenTag = this.localSocket.read(16);
        let len = payloadLenDecipher.update(payloadLen).readUInt16BE(0);
        payloadLenDecipher.setAuthTag(payloadLenTag);
        payloadLenDecipher.final();

        let payload = this.localSocket.read(len);
        let payloadTag = this.localSocket.read(16);
        let decryptedPayload: Buffer = payloadDecipher.update(payload);
        payloadDecipher.setAuthTag(payloadTag);
        payloadDecipher.final();

        return decryptedPayload;
    }

    private readAddress(): void {
        let dataDecrypted = this.readPayload();

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

    /////////////

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

    private encryptChunk(bufferSlice: Buffer) {
        let subKey = hkdf(this.psk, 32, {salt: this.saltRemote, info: "ss-subkey", hash: "SHA-1"});

        this.nonceBufferRemote.writeUInt16LE(this.nonceNumberRemote++, 0);
        let payloadLenCipher = chacha.createCipher(subKey, this.nonceBufferRemote);
        this.nonceBufferRemote.writeUInt16LE(this.nonceNumberRemote++, 0);
        let payloadCipher = chacha.createCipher(subKey, this.nonceBufferRemote);
        //////

        let payload = payloadCipher.update(bufferSlice);
        let final = payloadCipher.final();
        if (final.length > 0) {
            console.log("final ", final.length);
        }
        let payloadTag = payloadCipher.getAuthTag();

        let lenBuffer = Buffer.alloc(2);
        lenBuffer.writeUInt16BE(payload.length, 0);
        let payloadLen = payloadLenCipher.update(lenBuffer);
        payloadLenCipher.final();
        let payloadLenTag = payloadLenCipher.getAuthTag();

        let encryptedData = Buffer.concat([payloadLen, payloadLenTag, payload, payloadTag]);
        this.dataCacheFromRemote.push(encryptedData)
    }

}

