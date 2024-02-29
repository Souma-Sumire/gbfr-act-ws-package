# GBFR-ACT-WS

封装了 [GBFR-ACT-WS](https://github.com/nyaoouo/GBFR-ACT) 的 WebSocket 连接，内部处理后抛出事件，并支持 TypeScript。

## 导入

- `npm i gbfr-act-ws-package`

## 初始化

```javascript

  import { GbfrActWs } from "gbfr-act-ws-package";

  const gbfrActWs = new GbfrActWs();

  gbfrActWs.on("combatData", (data) => {
    console.log(data);
  });

```

你可以在构造函数中传入一个可选的options配置对象。

```typescript

  interface Options {
    port?: number;
    updateInterval?: number;
    reconnectTimeout?: number;
    maxCombats?: number;
  };

```

例如：

```javascript

  const options = {
    port: 24399;
  };

  const gbfrActWs = new GbfrActWs(options);

```

## 回调参数 data 的类型

目前支持3种事件类型，分别是 combatData、enterArea 和 damage。

```typescript

interface ExternalCombatData {
  title: string;
  duration: {
    ms: number;
    seconds: number;
    minutes: number;
    MMSS: string;
  };
  partyDamage: number;
  partyDamagePerSec: number;
  partyDamagePerSecInLastOneMinute: number;
  actors: {
    type: string;
    idx: number;
    id: number;
    partyIdx: number;
    damage: number;
    damagePerSec: number;
    damagePercentage: number;
    damageInLastOneMinute: number;
    damagePerSecInLastOneMinute: number;
  }[];
}

interface ExternalEnterArea {
  type: "enterArea";
  timeMs: number;
}

interface ExternalDamage {
  type: "damage";
  timeMs: number;
  data: {
    actionId: number;
    damage: number;
    flags: number;
    source: {
      type: string;
      idx: number;
      id: number;
      partyIdx: number;
    };
    target: {
      type: string;
      idx: number;
      id: number;
      partyIdx: number;
    };
  };
}

```
