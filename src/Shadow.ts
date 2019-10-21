const log = require("./log");
const Encryptor = require("./encrypt").Encryptor;
const utils = require("./utils");
const inet = require("./inet");
import net from "net";

export default class Shadow {
    public error = false;
    public remoteAddr: string = "";
    public remotePort: number = 0;
    private encryptor = new Encryptor("evenardo", "aes-256-cfb");
    private dataCacheFromLocal: any[] = [];
    private dataCacheFromRemote: any[] = [];
    private localSocket = new net.Socket();
    private remoteSocket = new net.Socket();
    private headerLength: number = 0;
    private isFirst: boolean = true;

    constructor(password: string, method: string, localSocket: net.Socket, remoteSocket: net.Socket) {
        this.encryptor = new Encryptor(password, method);
        this.localSocket = localSocket;
        this.remoteSocket = remoteSocket;
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

    public onLocalData(data: Buffer) {
        let dataDecrypted = this.encryptor.decrypt(data);
        if (this.isFirst) {
            this.parseHeader(dataDecrypted);
            this.parseFirstData(dataDecrypted);
            this.isFirst = false;
        } else {
            this.decryptDataFromLocalAndPush(dataDecrypted);
        }
    }

    public onRemoteData(data: Buffer) {
        try {
            let dataEncrypted = this.encryptor.encrypt(data);
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
            this.remoteAddr = utils.inetNtoa(dataDecrypted.slice(1, 5));
            this.remotePort = dataDecrypted.readUInt16BE(5);
            this.headerLength = 1 + 4 + 2;
        }
        if (addrType === 4) {
            this.remoteAddr = inet.inet_ntop(dataDecrypted.slice(1, 17));
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


