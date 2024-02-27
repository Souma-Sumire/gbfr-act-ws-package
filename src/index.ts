type SourceOrTargetRaw = [type: string, idx: number, id: number, party_idx: number];

interface DamageRaw {
  type: "damage";
  time_ms: number;
  data: {
    action_id: number;
    damage: number;
    flags: number;
    source: SourceOrTargetRaw;
    target: SourceOrTargetRaw;
  };
}

interface EnterAreaRaw {
  type: "enter_area";
  time_ms: number;
}

interface SourceOrTarget {
  type: string;
  idx: number;
  id: number;
  partyIdx: number;
}

interface Damage {
  type: "damage";
  timeMs: number;
  data: {
    actionId: number;
    damage: number;
    flags: number;
    source: SourceOrTarget;
    target: SourceOrTarget;
  };
}

interface EnterArea {
  type: "enterArea";
  timeMs: number;
}

class Action {
  constructor(
    public timestamp: number,
    public damage: number,
    public source: SourceOrTarget,
    public target: SourceOrTarget,
    public actionId: number,
  ) {}
}

class Actor {
  public actions: Action[] = [];
  public damage: number = 0;
  public hexId: string;
  public addAction(action: Action) {
    this.actions.push(action);
    this.damage += action.damage;
  }
  constructor(public idx: number, public id: number, public partyIdx: number) {
    this.hexId = numberToHexStringWithZFill(this.id);
  }
}

class CombatData {
  public actors: Actor[] = [];
  #timestamp: number;
  constructor(public title: string) {
    this.#timestamp = Date.now();
  }
  public get duration() {
    const ms = Date.now() - this.#timestamp;
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const MMSS = `${minutes.toString().padStart(2, "0")}:${
      (seconds % 60)
        .toString()
        .padStart(2, "0")
    }`;

    return { ms, seconds, minutes, MMSS };
  }
  public get partyDamage() {
    return this.actors.reduce((sum, actor) => sum + actor.damage, 0);
  }
}

interface MessageData {
  damage: Damage;
  enterArea: EnterArea;
  combatData: CombatData;
}

type MessageName = keyof MessageData;

export type MessageHandler<T extends MessageName> = (
  data: MessageData[T],
) => void;

interface Options {
  port: number;
  updateInterval: number;
  reconnectTimeout: number;
  maxCombats: number;
}

const isDamageMessage = (v: DamageRaw | EnterAreaRaw): v is DamageRaw => v.type === "damage";
const isEnterAreaMessage = (v: DamageRaw | EnterAreaRaw): v is EnterAreaRaw => v.type === "enter_area";
const transformDamage = (msg: DamageRaw): Damage => {
  return {
    type: "damage",
    timeMs: msg.time_ms,
    data: {
      actionId: msg.data.action_id,
      damage: msg.data.damage,
      flags: msg.data.flags,
      source: transformSourceOrTarget(msg.data.source),
      target: transformSourceOrTarget(msg.data.target),
    },
  };
};
const transformEnterArea = (msg: EnterAreaRaw): EnterArea => {
  return {
    type: "enterArea",
    timeMs: msg.time_ms,
  };
};

const transformSourceOrTarget = (
  { "0": type, "1": idx, "2": id, "3": party_idx }: SourceOrTargetRaw,
): SourceOrTarget => ({ type, idx, id, partyIdx: party_idx });

const transformMessage = (msg: DamageRaw | EnterAreaRaw): Damage | EnterArea => {
  if (isDamageMessage(msg)) {
    return transformDamage(msg);
  } else if (isEnterAreaMessage(msg)) {
    return transformEnterArea(msg);
  }
  throw new Error(`Unknown message type: ${JSON.stringify(msg)}`);
};

class _GbfrActWs {
  private messageHandlers: { [key in MessageName]: MessageHandler<key>[] } = {
    damage: [],
    enterArea: [],
    combatData: [],
  };
  private socket: WebSocket | null = null;
  private combats: CombatData[] = [];
  private combatCount: number = 0;
  private options: Options = {
    port: 24399,
    updateInterval: 1000,
    reconnectTimeout: 3000,
    maxCombats: 10,
  };
  private combatSubscriptions = 0;
  private lastUpdateTimestamp = 0;
  private rafId: number = -1;
  private inCombat: boolean = false;
  constructor(options?: Partial<Options>) {
    this.options = { ...this.options, ...options };
    this.connect();
    this.registerMessageHandler();
  }

  private registerMessageHandler() {
    this.on("damage", (data) => this.handleDamageMessage(data));
    this.on("enterArea", (data) => this.handleEnterAreaMessage(data));
  }

  public on<T extends MessageName>(event: T, handler: MessageHandler<T>): void {
    this.messageHandlers[event].push(handler);
    if (event === "combatData") {
      this.combatSubscriptions++;
      if (this.combatSubscriptions === 1) {
        this.rafId = requestAnimationFrame(this.broadcastCombat);
      }
    }
  }

  public off<T extends MessageName>(
    event: T,
    handler: MessageHandler<T>,
  ): void {
    const handlers = this.messageHandlers[event];
    const index = handlers.indexOf(handler);
    if (index !== -1) {
      handlers.splice(index, 1);
    }
    if (event === "combatData") {
      this.combatSubscriptions--;
      if (this.combatSubscriptions === 0) {
        cancelAnimationFrame(this.rafId);
      }
    }
  }

  private connect() {
    const url = `ws://localhost:${this.options.port}`;
    console.debug(`尝试连接到WebSocket服务器 '${url}'`);

    if (this.socket !== null && this.socket.readyState !== WebSocket.CLOSED) {
      console.debug("WebSocket连接已存在或正在连接中");
      return;
    }
    this.socket = new WebSocket(url);

    this.socket.addEventListener("open", () => {
      console.log("WebSocket连接已建立");
    });

    this.socket.addEventListener("message", (event) => {
      const msg: DamageRaw | EnterAreaRaw = JSON.parse(event.data);
      const transformedMsg = transformMessage(msg);
      this.emit(transformedMsg.type, (listener) => listener(transformedMsg));
    });

    this.socket.addEventListener("close", () => {
      this.reconnect();
    });
  }

  private emit<T extends MessageName>(
    type: T,
    callback: (data: MessageHandler<T>) => void,
  ): void {
    const listeners = this.messageHandlers[type];
    listeners.forEach((listener) => callback(listener));
  }

  private reconnect() {
    console.debug("尝试重新连接...");
    setTimeout(() => {
      this.connect();
    }, this.options.reconnectTimeout);
  }

  private getLatestCombat(): CombatData {
    if (this.combats.length === 0) {
      this.newCombat();
    }
    return this.combats[this.combats.length - 1];
  }

  private newCombat() {
    this.combats.push(new CombatData(`#${++this.combatCount}`));
    if (this.combats.length >= this.options.maxCombats) {
      this.combats.shift();
    }
  }

  private processActionId: (data: Damage["data"]) => number = ({ flags, actionId }) => {
    if (flags & (1 << 15)) return -3; // 追击因子
    return actionId;
  };

  private handleDamageMessage = (data: Damage): void => {
    const { damage, source, target } = data.data;
    const { type: _sourceType, idx: sourceIdx, id: sourceId, partyIdx: sourcePartyIdx } = source;
    const { type: _targetType, idx: _targetIdx, id: targetId, partyIdx: _targetPartyIdx } = target;
    if (targetId === 0x22a350f) return; // HARDCODE: 对欧根附加炸弹造成的伤害不进行记录
    if (sourcePartyIdx === -1) return; // 奥义连锁？
    this.inCombat = true;
    const combat = this.getLatestCombat();
    let actor = combat.actors.find((v) => v.idx === sourceIdx);
    if (actor === undefined) {
      actor = combat.actors[
        combat.actors.push(
          new Actor(sourceIdx, sourceId, sourcePartyIdx),
        ) - 1
      ];
    }
    const actionId = this.processActionId(data.data);
    actor.addAction(
      new Action(data.timeMs, damage, source, target, actionId),
    );
  };

  private handleEnterAreaMessage = (_data: EnterArea): void => {
    this.inCombat = false;
    this.newCombat();
  };

  private broadcastCombat = (timestamp: number): void => {
    if (
      (this.lastUpdateTimestamp === 0
        || timestamp - this.lastUpdateTimestamp > this.options.updateInterval)
      && this.socket?.readyState === WebSocket.OPEN
      && this.inCombat
    ) {
      this.emit("combatData", (listener) => {
        for (let i = this.combats.length - 1; i >= 0; i--) {
          const combat = this.combats[i];
          if (combat.partyDamage > 0) {
            combat.actors.sort((a, b) => a.partyIdx - b.partyIdx);
            listener(combat);
            break;
          }
        }
      });
      this.lastUpdateTimestamp = timestamp;
    }
    this.rafId = requestAnimationFrame(this.broadcastCombat);
  };
}

const numberToHexStringWithZFill = (id: number) => {
  return id.toString(16).padEnd(8, "0");
};

type Constructor<T = {}> = new(...args: any[]) => T;

const singleton = <T extends Constructor>(className: T): T => {
  let instance: InstanceType<T> | null = null;
  return new Proxy(className, {
    construct(target, ...args) {
      if (!instance) {
        instance = Reflect.construct(target, ...args) as InstanceType<T>;
      }
      return instance;
    },
  }) as T;
};

const GbfrActWs = singleton(_GbfrActWs);
export { GbfrActWs };
