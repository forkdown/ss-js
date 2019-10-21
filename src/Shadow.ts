const log = require("./log");
const Encryptor = require("./encrypt").Encryptor;
const utils = require("./utils");
const inet = require("./inet");

class Shadow {
    public error = false;
    public remoteAddr: string = "";
    public remotePort: number = 0;
    public dataCacheFromLocal: Buffer[] = [];
    public dataCacheFromRemote: Buffer[] = [];
    private encryptor = new Encryptor("foobar", "aes-256-cfb");
    private headerLength: number = 0;

    constructor(password: string, method: string, data: Buffer) {
        this.encryptor = new Encryptor(password, method);
        this.parseHeader(data);
        this.parseFirstData(data);
    }

    public encryptDataFromRemoteAndPush(originData: Buffer): void {
        let encryptData = this.encryptor.encrypt(originData);
        this.dataCacheFromRemote.push(encryptData)
    }

    public decryptDataFromLocalAndPush(encryptedData: Buffer): void {
        let decryptData = this.encryptor.decrypt(encryptedData);
        this.dataCacheFromLocal.push(decryptData);
    }

    parseHeader(data: Buffer) {
        data = this.encryptor.decrypt(data);
        let addrType = data[0];

        if (addrType === void 0) {
            this.error = true;
        }

        if (addrType !== 3 && addrType !== 1 && addrType !== 4) {
            log.error("unsupported addrtype: " + addrType + " maybe wrong password");
            this.error = true;
            return
        }
        if (addrType === 3) {
            let addrLen = data[1];
            this.remoteAddr = data.slice(2, 2 + addrLen).toString("binary");
            this.remotePort = data.readUInt16BE(2 + addrLen);
            this.headerLength = 2 + addrLen + 2;
            return
        }
        if (addrType === 1) {
            this.remoteAddr = utils.inetNtoa(data.slice(1, 5));
            this.remotePort = data.readUInt16BE(5);
            this.headerLength = 1 + 4 + 2;
        }
        if (addrType === 4) {
            this.remoteAddr = inet.inet_ntop(data.slice(1, 17));
            this.remotePort = data.readUInt16BE(17);
            this.headerLength = 1 + 16 + 2;
        }
        return
    }

    parseFirstData(data: Buffer) {
        if (data.length > this.headerLength) {
            this.dataCacheFromLocal.push(Buffer.from(data.slice(this.headerLength)));
        }
        this.error = true;
    }
}


