type DamageSource = [type: string, idx: number, id: number, party_idx: number];

type Damage = {
  type: "damage";
  time_ms: number;
  data: {
    action_id: number;
    damage: number;
    flags: number;
    source: DamageSource;
    target: DamageSource;
  };
};

type EnterArea = {
  type: "enter_area";
  time_ms: number;
};

class Action {
  constructor(
    public timestamp: number,
    public damage: number,
    public source: DamageSource,
    public target: DamageSource,
    public actionId: number
  ) {}
}

class Actor {
  public actions: Action[] = [];
  public damage: number = 0;
  public hexId: string;
  public partyIdx: number;
  public addAction(action: Action) {
    this.actions.push(action);
    this.damage += action.damage;
  }
  constructor(public idx: number, public id: number, party_idx: number) {
    this.partyIdx = party_idx;
    this.hexId = numberToHexStringWithZFill(this.id);
  }
}

class CombatData {
  public actors: Actor[] = [];
  #timestamp: number;
  constructor(public title: string) {
    this.#timestamp = Date.now();
  }
  get duration() {
    const ms = Date.now() - this.#timestamp;
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const MMSS = `${minutes.toString().padStart(2, "0")}:${(seconds % 60)
      .toString()
      .padStart(2, "0")}`;

    return { ms, seconds, minutes, MMSS };
  }
  get partyDamage() {
    return this.actors.reduce((sum, actor) => sum + actor.damage, 0);
  }
}

type MessageData = {
  damage: Damage;
  enter_area: EnterArea;
  combat_data: CombatData;
};

type MessageName = keyof MessageData;

export type MessageHandler<T extends MessageName> = (
  data: MessageData[T]
) => void;

interface Options {
  port: number;
  updateInterval: number;
  reconnectTimeout: number;
  maxCombats: number;
}

class _GbfrActWs {
  private messageHandlers: { [key in MessageName]: MessageHandler<key>[] } = {
    damage: [],
    enter_area: [],
    combat_data: [],
  };
  public port: number;
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

  constructor(options?: Partial<Options>) {
    this.options = { ...this.options, ...options };
    this.port = this.options.port;
    this.connect();
    this.registerMessageHandler();
  }

  private registerMessageHandler() {
    this.on("damage", (data) => this.handleDamageMessage(data));
    this.on("enter_area", (data) => this.handleEnterAreaMessage(data));
  }

  public on<T extends MessageName>(event: T, handler: MessageHandler<T>): void {
    this.messageHandlers[event].push(handler);
    if (event === "combat_data") {
      this.combatSubscriptions++;
      if (this.combatSubscriptions === 1) {
        this.rafId = requestAnimationFrame(this.broadcastCombat);
      }
    }
  }

  public off<T extends MessageName>(
    event: T,
    handler: MessageHandler<T>
  ): void {
    const handlers = this.messageHandlers[event];
    const index = handlers.indexOf(handler);
    if (index !== -1) {
      handlers.splice(index, 1);
    }
    if (event === "combat_data") {
      this.combatSubscriptions--;
      if (this.combatSubscriptions === 0) {
        cancelAnimationFrame(this.rafId);
      }
    }
  }

  private connect() {
    const url = `ws://localhost:${this.port}`;
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
      const data: Damage | EnterArea = JSON.parse(event.data);
      this.emit(data.type, (listener) => listener(data));
    });

    this.socket.addEventListener("close", () => {
      this.reconnect();
    });
  }

  private emit<T extends MessageName>(
    type: T,
    callback: (data: MessageHandler<T>) => void
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

  private handleDamageMessage = (data: Damage): void => {
    const { source, target, damage, action_id } = data.data;
    const [, source_idx, source_id, source_party_idx] = source;
    const [, , target_id] = target;
    if (target_id === 0x22a350f) return; // HARDCODE: 对欧根附加炸弹造成的伤害不进行记录
    if (source_party_idx === -1) return; // 奥义连锁？
    const combat = this.getLatestCombat();
    let actor = combat.actors.find((v) => v.idx === source_idx);
    if (actor === undefined) {
      actor =
        combat.actors[
          combat.actors.push(
            new Actor(source_idx, source_id, source_party_idx)
          ) - 1
        ];
    }
    actor.addAction(
      new Action(data.time_ms, damage, source, target, action_id)
    );
  };

  private handleEnterAreaMessage = (_data: EnterArea): void => {
    this.newCombat();
  };

  private broadcastCombat = (timestamp: number): void => {
    if (
      (this.lastUpdateTimestamp === 0 ||
        timestamp - this.lastUpdateTimestamp > this.options.updateInterval) &&
      this.socket?.readyState === WebSocket.OPEN
    ) {
      this.emit("combat_data", (listener) => {
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

type Constructor<T = {}> = new (...args: any[]) => T;

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
