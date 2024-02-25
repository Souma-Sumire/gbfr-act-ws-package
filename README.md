# GBFR-ACT-WS

Encapsulate WebSocket connection to [GBFR-ACT-WS](https://github.com/nyaoouo/GBFR-ACT), emit events after internal processing, and support TypeScript.

封装了 [GBFR-ACT-WS](https://github.com/nyaoouo/GBFR-ACT) 的 WebSocket 连接，内部处理后抛出事件，并支持 TypeScript。

## Install 安装

- `npm i gbfr-act-ws-package`

## Initialization 初始化

```javascript

  import { GbfrActWs } from "gbfr-act-ws-package";

  const gbfrActWs = new GbfrActWs({ port: 24399, updateInterval: 500 });

  gbfrActWs.on("combat_data", (data) => {
    console.log(data);
  });

```

## Event 事件

- combat_data 战斗数据

- enter_are 区域移动

- damage 伤害
