import {Socket} from "net";
import hkdf from "futoin-hkdf";

const log = require("../common/log");
const ipBuffer = require("../common/ip");
import crypto = require('crypto');
import {BufferFlow} from "../interface/BufferFlow";
import {Shadow} from "../protocol/shadow";

export class ShadowAEAD {
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
    private nonceNumber: number = 0;
    private nonceBuffer: Buffer = Buffer.alloc(12);
    private nonceNumberRemote: number = 0;
    private nonceBufferRemote: Buffer = Buffer.alloc(12);

    constructor(password: string, method: string, localSocket: Socket, remoteSocket: Socket) {
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

    private static decryptSalt(bufferFlow: BufferFlow): BufferFlow {
        let result = Buffer.from(bufferFlow.flow.slice(0, 32));
        let flow = Buffer.from(bufferFlow.flow.slice(32));
        return {flow, result}
    }

    private decryptPayload(bufferFlow: BufferFlow): BufferFlow {
        let subKey = hkdf(this.psk, 32, {salt: this.salt, info: "ss-subkey", hash: "SHA-1"});

        this.nonceBuffer.writeUInt16LE(this.nonceNumber++, 0);
        let payloadLenDecipher = crypto.createDecipheriv('aes-256-gcm', subKey, this.nonceBuffer);

        this.nonceBuffer.writeUInt16LE(this.nonceNumber++, 0);
        let payloadDecipher = crypto.createDecipheriv('aes-256-gcm', subKey, this.nonceBuffer);

        let payloadLen = bufferFlow.flow.slice(0, 2);
        let payloadLenTag = bufferFlow.flow.slice(2, 18);
        payloadLenDecipher.setAuthTag(payloadLenTag);
        let len = payloadLenDecipher.update(payloadLen).readUInt16BE(0);
        payloadLenDecipher.final();

        let payload = bufferFlow.flow.slice(18, 18 + len);
        let payloadTag = bufferFlow.flow.slice(18 + len, 34 + len);
        payloadDecipher.setAuthTag(payloadTag);
        let result: Buffer = payloadDecipher.update(payload);
        payloadDecipher.final();

        let flow: Buffer = Buffer.from(bufferFlow.flow.slice(34 + len));
        return {flow, result};
    }

    public onDataLocal(data: Buffer) {
        try {
            let bufferFlow = {flow: data, result: Buffer.alloc(0)};
            if (this.isFirst) {
                bufferFlow = ShadowAEAD.decryptSalt({flow: data, result: null});
                this.salt = bufferFlow.result;

                bufferFlow = this.decryptPayload(bufferFlow);
                this.parseHeader(bufferFlow.result);
                this.isFirst = false;
            }
            while (bufferFlow.flow.length > 0) {
                bufferFlow = this.decryptPayload(bufferFlow);
                this.parseData(bufferFlow.result);
            }
        } catch (e) {
            log.error("connection on data error " + e);
            this.error = true;
        }
    }

    public onDataRemote(data: Buffer) {
        try {
            if (this.isRemoteFirst) {
                this.dataCacheFromRemote.push(this.salt);
                this.isRemoteFirst = false;
            }
            let subKey = hkdf(this.psk, 32, {salt: this.salt, info: "ss-subkey", hash: "SHA-1"});

            this.nonceBufferRemote.writeUInt16LE(this.nonceNumberRemote++, 0);
            let payloadLenCipher = crypto.createCipheriv('aes-256-gcm', subKey, this.nonceBufferRemote);
            this.nonceBufferRemote.writeUInt16LE(this.nonceNumberRemote++, 0);
            let payloadCipher = crypto.createCipheriv('aes-256-gcm', subKey, this.nonceBufferRemote);
            //////

            let payload = payloadCipher.update(data);
            payloadCipher.final();
            let payloadTag = payloadCipher.getAuthTag();

            let lenBuffer = Buffer.alloc(2);
            lenBuffer.writeUInt16BE(payload.length, 0);
            let payloadLen = payloadLenCipher.update(lenBuffer);
            payloadLenCipher.final();
            let payloadLenTag = payloadLenCipher.getAuthTag();

            let encryptedData = Buffer.concat([payloadLen, payloadLenTag, payload, payloadTag]);
            this.dataCacheFromRemote.push(encryptedData)
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

    private parseData(dataDecrypted: Buffer): void {
        this.dataCacheFromLocal.push(Buffer.from(dataDecrypted));
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

