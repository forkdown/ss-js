# 重写 shadowsocks-nodejs

重写了大部分的代码， js 的一大特色就是简单易懂， 尽可能去掉了用不到的代码。 
使用了守护线程的方式执行了 server , 当内存大于一定数量，线程自动重启。
#### 配置文件
根目录下的 ssconfig.json

#### 启动服务器
```shell
yarn server
```

#### 启动服务器
```shell
yarn local
```
