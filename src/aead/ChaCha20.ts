import {Socket} from "net";
import hkdf from "futoin-hkdf";

const chacha = require("chacha");
const crypto = require('crypto');
const log = require("../common/log");
const ipBuffer = require("../common/ip");

export class ChaCha20 {
    public error = false;
    public remoteAddr: string = "";
    public remotePort: number = 0;

    private dataCacheFromLocal: any[] = [];
    private dataCacheFromRemote: any[] = [];

    private localSocket: Socket | any = new Socket();
    private remoteSocket: Socket | any = new Socket();

    private headerLength: number = 0;

    private isFirst: boolean = true;
    private isFirstRemote: boolean = true;

    private psk: Buffer = Buffer.from("a218ba5edad3d9f2d45d479d7d12a1dcdfa5df372bcedbd53aa0528e23919d79", "hex");

    private salt: Buffer = Buffer.alloc(32);
    private saltRemote: Buffer = crypto.randomBytes(32);

    private subKey: Buffer = Buffer.alloc(32);
    private subKeyRemote: Buffer = Buffer.alloc(32);

    private nonceNumber: number = 0;
    private nonceNumberRemote: number = 0;

    private nonceBuffer: Buffer = Buffer.alloc(12);
    private nonceBufferRemote: Buffer = Buffer.alloc(12);

    constructor(password: string, method: string, localSocket: Socket | any, remoteSocket: Socket | any) {
        this.localSocket = localSocket;
        this.remoteSocket = remoteSocket;
        this.subKeyRemote = hkdf(this.psk, 32, {salt: this.saltRemote, info: "ss-subkey", hash: "SHA-1"});
    }

    public writeToRemote() {
        while (this.dataCacheFromLocal.length) {
            this.remoteSocket.write(this.dataCacheFromLocal.shift());
        }
    }

    /**
     * 接管 local 端 过来的数据
     */
    public async takeOver() {
        await this.readSalt();
        await this.readHeader();
        this.remoteSocket.connect(this.remotePort, this.remoteAddr, async () => {
            log.info("connect       : " + this.remoteAddr + ":" + this.remotePort);
        });
        this.remoteSocket.on("readable", async () => {
            await this.onRemoteReadable();
        });
        while (this.localSocket.readable) {
            if (this.localSocket.readableLength > 34) {
                let payload = await this.readPayloadFromLocal();
                if (payload) {
                    this.remoteSocket.write(payload);
                }
            }
            await this.sleep(200);
        }
    }

    private close() {
        this.localSocket.destroy();
        this.remoteSocket.destroy();
    }

    private resume() {
        this.localSocket.pause();
        this.localSocket.resume();
        this.remoteSocket.pause();
        this.remoteSocket.resume();
    }

    private writeToLocal() {
        while (this.dataCacheFromRemote.length) {
            this.localSocket.write(this.dataCacheFromRemote.shift());
        }
    }

    private async onRemoteReadable() {
        try {
            if (this.isFirstRemote) {
                this.localSocket.write(this.saltRemote);
                this.isFirstRemote = false;
            }

            let data = this.remoteSocket.read();
            for (let i = 0; i < data.length; i += 0x3fff) {
                this.encryptChunk(data.slice(i, i + 0x3fff))
            }
            this.writeToLocal();
        } catch (e) {
            log.error("remote connection on data error " + e);
            this.close();
            this.error = true;
        }


    }

    private async readHeader() {
        let header = await this.readPayloadFromLocal();
        if (this.isNull(header)) {
            return null;
        }
        this.parseHeader(<Buffer>header);
    }

    private async readSalt() {
        let salt = await this.readUntilFrom(this.localSocket, 32);
        if (this.isNull(salt)) {
            return;
        }
        this.salt = <Buffer>salt;
        this.subKey = hkdf(this.psk, 32, {salt: this.salt, info: "ss-subkey", hash: "SHA-1"});
    }

    private isNull(any: any) {
        if (!any) {
            this.localSocket.destroy();
            this.remoteSocket.destroy();
            return true
        }
        return false
    }

    private sleep(waitMS: number = 200) {
        return new Promise(resolve => {
            setTimeout(() => {
                resolve();
            }, waitMS)
        })
    }

    private async readUntilFrom(socket: Socket, size: number) {
        let times = 5;
        let waitMS = 200;
        let time = 0;
        while (socket.readableLength < size) {
            if (time++ > times) {
                socket.destroy();
                // let msg = "Retried " + times + " times x " + waitMS + " ms . And not enough data received, socket will be destroy";
                // log.error(msg);
                return null
            }
            await this.sleep(waitMS)
        }
        return (socket.read(size));
    }

    private async readPayloadFromLocal() {
        this.nonceBuffer.writeUInt16LE(this.nonceNumber++, 0);
        let payloadLenDecipher = chacha.createDecipher(this.subKey, this.nonceBuffer);

        this.nonceBuffer.writeUInt16LE(this.nonceNumber++, 0);
        let payloadDecipher = chacha.createDecipher(this.subKey, this.nonceBuffer);

        let payloadLen = await this.readUntilFrom(this.localSocket, 2);
        if (this.isNull(payloadLen)) {
            return null;
        }
        let payloadLenTag = await this.readUntilFrom(this.localSocket, 16);
        if (this.isNull(payloadLenTag)) {
            return null;
        }
        let len = payloadLenDecipher.update(payloadLen).readUInt16BE(0);
        try {
            payloadLenDecipher.setAuthTag(payloadLenTag);
            payloadLenDecipher.final();
        } catch (e) {
            log.error(e);
            this.localSocket.destroy();
            return null;
        }
        if (this.isNull(len)) {
            return null;
        }
        let payload = await this.readUntilFrom(this.localSocket, len);
        if (this.isNull(payload)) {
            return null;
        }
        let payloadTag = await this.readUntilFrom(this.localSocket, 16);
        if (this.isNull(payloadTag)) {
            return null;
        }
        let result: Buffer = payloadDecipher.update(payload);
        try {
            payloadDecipher.setAuthTag(payloadTag);
            payloadDecipher.final();
        } catch (e) {
            log.error(e);
            this.localSocket.destroy();
            return null;
        }
        if (this.isNull(result)) {
            return null;
        }
        return result;
    }

    private encryptChunk(bufferSlice: Buffer) {

        this.nonceBufferRemote.writeUInt16LE(this.nonceNumberRemote++, 0);
        let payloadLenCipher = chacha.createCipher(this.subKeyRemote, this.nonceBufferRemote);
        this.nonceBufferRemote.writeUInt16LE(this.nonceNumberRemote++, 0);
        let payloadCipher = chacha.createCipher(this.subKeyRemote, this.nonceBufferRemote);
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
}

