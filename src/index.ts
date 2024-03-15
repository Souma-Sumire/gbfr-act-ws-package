type ActorInfoRaw = [type: string, idx: number, id: number, party_idx: number];

interface SigilsRaw {
	first_trait_id: number;
	first_trait_level: number;
	second_trait_id: number;
	second_trait_level: number;
	sigil_id: number;
	sigil_level: number;
}

interface PartyMemberRaw {
	weapon: {
		weapon_id: number;
		skill1: number;
		skill1_lv: number;
		skill2: number;
		skill2_lv: number;
		skill3: number;
		skill3_lv: number;
		bless_item: number;
	};
	sigils: SigilsRaw[];
	is_online: number;
	c_name: string;
	d_name: string;
	common_info: ActorInfoRaw;
}

interface Sigils {
	firstTraitId: number;
	firstTraitLevel: number;
	secondTraitId: number;
	secondTraitLevel: number;
	sigilId: number;
	sigilLevel: number;
}

interface PartyMember {
	weapon: {
		weaponId: number;
		skill1: number;
		skill1Lv: number;
		skill2: number;
		skill2Lv: number;
		skill3: number;
		skill3Lv: number;
		blessItem: number;
	};
	sigils: Sigils[];
	isOnline: number;
	cName: string;
	dName: string;
	commonInfo: ActorInfo;
}

interface LoadPartyRaw {
	type: "load_party";
	time_ms: number;
	data: (PartyMemberRaw | null)[];
}

interface DamageRaw {
	type: "damage";
	time_ms: number;
	data: {
		action_id: number;
		damage: number;
		flags: number;
		source: ActorInfoRaw;
		target: ActorInfoRaw;
	};
}

interface EnterAreaRaw {
	type: "enter_area";
	time_ms: number;
}

interface UnknownRaw {
	type: "string";
	time_ms: number;
}

type RawEvent = LoadPartyRaw | DamageRaw | EnterAreaRaw | UnknownRaw;
type Event = LoadParty | Damage | EnterArea;

interface ActorInfo {
	type: string;
	idx: number;
	id: number;
	partyIdx: number;
}

interface LoadParty {
	type: "loadParty";
	timeMs: number;
	data: PartyMember[];
}

interface Damage {
	type: "damage";
	timeMs: number;
	data: {
		actionId: number;
		damage: number;
		flags: number;
		source: ActorInfo;
		target: ActorInfo;
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
		public source: ActorInfo,
		public target: ActorInfo,
		public actionId: number,
	) {}
}

interface Actor {
	type: string;
	idx: number;
	id: number;
	hexId: string;
	partyIdx: number;
	damage: number;
	damagePerSec: number;
	damagePercentage: number;
	damageInLastOneMinute: number;
	damagePerSecInLastOneMinute: number;
	actions: Action[];
}

class ActorRaw {
	public actions: Action[] = [];
	public damage = 0;
	public damagePerSec = 0;
	public damagePercentage = 0;
	public damageInLastOneMinute = 0;
	public damagePerSecInLastOneMinute = 0;
	public hexId: string;
	public addAction(action: Action) {
		this.actions.push(action);
		this.damage += action.damage;
	}
	constructor(
		public type: string,
		public idx: number,
		public id: number,
		public partyIdx: number,
	) {
		this.hexId = numberToHexStringWithZFill(this.id);
	}
	get transformActor(): Actor {
		return {
			type: this.type,
			idx: this.idx,
			id: this.id,
			hexId: this.hexId,
			partyIdx: this.partyIdx,
			damage: this.damage,
			damagePerSec: this.damagePerSec,
			damagePercentage: this.damagePercentage,
			damageInLastOneMinute: this.damageInLastOneMinute,
			damagePerSecInLastOneMinute: this.damagePerSecInLastOneMinute,
			actions: this.actions,
		};
	}
}

interface Duration {
	ms: number;
	seconds: number;
	minutes: number;
	MMSS: string;
}

interface CombatData {
	title: string;
	duration: Duration;
	partyDamage: number;
	partyDamagePerSec: number;
	partyDamagePerSecInLastOneMinute: number;
	actors: Actor[];
}

class CombatDataInternal {
	public title: string;
	public actors: ActorRaw[] = [];
	public lastTimestamp: number;
	private startTimestamp: number;
	public partyDamage = 0;
	constructor(title: string, startTimestamp: number) {
		this.title = title;
		this.startTimestamp = startTimestamp;
		this.lastTimestamp = startTimestamp;
	}
	get transformData(): CombatData {
		const ms = this.lastTimestamp - this.startTimestamp;
		const seconds = Math.floor(ms / 1000);
		const minutes = Math.floor(seconds / 60);
		const MMSS = `${minutes.toString().padStart(2, "0")}:${(seconds % 60)
			.toString()
			.padStart(2, "0")}`;
		const partyDamagePerSec =
			seconds === 0 ? this.partyDamage : Math.round(this.partyDamage / seconds);
		let partyDamagePerSecInLastOneMinute = 0;
		for (const v of this.actors) {
			v.damagePerSec =
				seconds === 0 ? v.damage : Math.round(v.damage / seconds);
			v.damagePercentage = (v.damage / this.partyDamage) * 100;
			v.damageInLastOneMinute = v.actions.reduce(
				(p, c) =>
					c.timestamp + 60000 >= this.lastTimestamp ? p + c.damage : p,
				0,
			);
			v.damagePerSecInLastOneMinute = Math.round(
				v.damageInLastOneMinute / (seconds === 0 ? 1 : Math.min(60, seconds)),
			);
			partyDamagePerSecInLastOneMinute += v.damagePerSecInLastOneMinute;
		}
		return {
			title: this.title,
			duration: { ms, seconds, minutes, MMSS },
			partyDamage: this.partyDamage,
			partyDamagePerSec: partyDamagePerSec,
			partyDamagePerSecInLastOneMinute: partyDamagePerSecInLastOneMinute,
			actors: this.actors.map((v) => v.transformActor),
		};
	}
}

interface MessageData {
	damage: Damage;
	enterArea: EnterArea;
	combatData: CombatData;
	loadParty: LoadParty;
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

const isDamageMessage = (v: RawEvent): v is DamageRaw => v.type === "damage";
const isEnterAreaMessage = (v: RawEvent): v is EnterAreaRaw =>
	v.type === "enter_area";
const isLoadParty = (v: RawEvent): v is LoadPartyRaw => v.type === "load_party";
const transformDamage = (msg: DamageRaw): Damage => ({
	type: "damage",
	timeMs: msg.time_ms,
	data: {
		actionId: msg.data.action_id,
		damage: msg.data.damage,
		flags: msg.data.flags,
		source: transformActorInfo(msg.data.source),
		target: transformActorInfo(msg.data.target),
	},
});
const transformEnterArea = (msg: EnterAreaRaw): EnterArea => {
	return {
		type: "enterArea",
		timeMs: msg.time_ms,
	};
};
const transformLoadParty = (msg: LoadPartyRaw): LoadParty => {
	const data = (msg.data.filter((v) => v !== null) as PartyMemberRaw[]).map(
		(v) => {
			return {
				cName: v.c_name,
				commonInfo: transformActorInfo(v.common_info),
				dName: v.d_name,
				isOnline: v.is_online,
				sigils: v.sigils.map((s) => ({
					firstTraitId: s.first_trait_id,
					firstTraitLevel: s.first_trait_level,
					secondTraitId: s.second_trait_id,
					secondTraitLevel: s.second_trait_level,
					sigilId: s.sigil_id,
					sigilLevel: s.sigil_level,
				})),
				weapon: {
					blessItem: v.weapon.bless_item,
					skill1: v.weapon.skill1,
					skill1Lv: v.weapon.skill1_lv,
					skill2: v.weapon.skill2,
					skill2Lv: v.weapon.skill2_lv,
					skill3: v.weapon.skill3,
					skill3Lv: v.weapon.skill3_lv,
					weaponId: v.weapon.weapon_id,
				},
			};
		},
	);
	return {
		type: "loadParty",
		timeMs: msg.time_ms,
		data,
	};
};

const transformActorInfo = ({
	"0": type,
	"1": idx,
	"2": id,
	"3": partyIdx,
}: ActorInfoRaw): ActorInfo => ({ type, idx, id, partyIdx });

const transformMessage = (msg: RawEvent): Event => {
	if (isDamageMessage(msg)) {
		return transformDamage(msg);
	}
	if (isEnterAreaMessage(msg)) {
		return transformEnterArea(msg);
	}
	if (isLoadParty(msg)) {
		return transformLoadParty(msg);
	}
	throw new Error(`Unknown message type: ${(msg as RawEvent).type}`);
};

class _GbfrActWs {
	private messageHandlers: { [key in MessageName]: MessageHandler<key>[] } = {
		damage: [],
		enterArea: [],
		combatData: [],
		loadParty: [],
	};
	private socket: WebSocket | null = null;
	private combats: CombatDataInternal[] = [];
	private combatCount = 0;
	private options: Options = {
		port: 24399,
		updateInterval: 1000,
		reconnectTimeout: 3000,
		maxCombats: 10,
	};
	private combatSubscriptions = 0;
	private lastRafTimestamp = 0;
	private lastDamageTimestamp = 0;
	private lastCombatDataTimestamp = 0;
	private rafId = -1;
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
			const msg: RawEvent = JSON.parse(event.data);
			try {
				const transformedMsg = transformMessage(msg);
				this.emit(transformedMsg.type, (listener) => listener(transformedMsg));
			} catch (e) {
				console.error(`无法处理消息: ${e}`);
			}
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
		for (const listener of listeners) {
			callback(listener);
		}
	}

	private reconnect() {
		console.debug("尝试重新连接...");
		setTimeout(() => {
			this.connect();
		}, this.options.reconnectTimeout);
	}

	private getLatestCombat(startTimestamp: number): CombatDataInternal {
		if (this.combats.length === 0) {
			this.newCombat(startTimestamp);
		}
		return this.combats[this.combats.length - 1];
	}

	private newCombat(startTimestamp: number) {
		this.combats.push(
			new CombatDataInternal(`#${++this.combatCount}`, startTimestamp),
		);
		if (this.combats.length >= this.options.maxCombats) {
			this.combats.shift();
		}
	}

	private processActionId: (data: Damage["data"]) => number = ({
		flags,
		actionId,
	}) => {
		if (flags & (1 << 15)) return -3; // 追击因子
		return actionId;
	};

	private handleDamageMessage = (data: Damage): void => {
		const { damage, source, target } = data.data;
		const {
			type: sourceType,
			idx: sourceIdx,
			id: sourceId,
			partyIdx: sourcePartyIdx,
		} = source;
		const {
			type: _targetType,
			idx: _targetIdx,
			id: targetId,
			partyIdx: _targetPartyIdx,
		} = target;
		if (targetId === 0x22a350f) return; // HARDCODE: 对欧根附加炸弹造成的伤害不进行记录
		if (sourcePartyIdx === -1) return; // 奥义连锁？
		const combat = this.getLatestCombat(data.timeMs);
		combat.partyDamage += damage;
		combat.lastTimestamp = data.timeMs;
		let actor = combat.actors.find((v) => v.idx === sourceIdx);
		if (actor === undefined) {
			actor =
				combat.actors[
					combat.actors.push(
						new ActorRaw(sourceType, sourceIdx, sourceId, sourcePartyIdx),
					) - 1
				];
			combat.actors.sort((a, b) => a.partyIdx - b.partyIdx);
		}
		const actionId = this.processActionId(data.data);
		actor.addAction(new Action(data.timeMs, damage, source, target, actionId));
		this.lastDamageTimestamp = data.timeMs;
	};

	private handleEnterAreaMessage = (data: EnterArea): void => {
		this.newCombat(data.timeMs);
	};

	private broadcastCombat = (currentTimestamp: number): void => {
		if (
			(this.lastRafTimestamp === 0 ||
				currentTimestamp - this.lastRafTimestamp >
					this.options.updateInterval) &&
			this.socket?.readyState === WebSocket.OPEN
		) {
			if (this.lastDamageTimestamp + 1000 > this.lastCombatDataTimestamp) {
				this.emit("combatData", (listener) => {
					for (let i = this.combats.length - 1; i >= 0; i--) {
						const combat = this.combats[i];
						if (combat.partyDamage > 0) {
							listener(combat.transformData);
							break;
						}
					}
				});
				this.lastCombatDataTimestamp = this.lastDamageTimestamp;
			}
			this.lastRafTimestamp = currentTimestamp;
		}
		this.rafId = requestAnimationFrame(this.broadcastCombat);
	};
}

const numberToHexStringWithZFill = (id: number) => {
	return id.toString(16).padEnd(8, "0");
};

// biome-ignore lint/complexity/noBannedTypes: <explanation>
// biome-ignore lint/suspicious/noExplicitAny: <explanation>
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

class _FakeCombatData {
	private intervalId: NodeJS.Timeout | null = null;
	private callback: MessageHandler<"combatData">;
	constructor(callback: MessageHandler<"combatData">) {
		this.callback = callback;
		this.start();
	}

	public start() {
		if (this.intervalId !== null) {
			console.warn("Fake combat data already started");
			return;
		}
		this.intervalId = setInterval(() => {
			const fakeMs = Math.floor(Math.random() * 10000);
			const fakeCombatData: CombatData = {
				title: "Mock Combat",
				duration: {
					ms: fakeMs,
					seconds: Math.round(fakeMs / 1000),
					minutes: Math.round(fakeMs / 1000 / 60),
					MMSS: `${Math.round(fakeMs / 1000 / 60)
						.toString()
						.padStart(2, "0")}:${(Math.round(fakeMs / 1000) % 60)
						.toString()
						.padStart(2, "0")}`,
				},
				partyDamage: Math.floor(Math.random() * 100),
				partyDamagePerSec: Math.floor(Math.random() * 100),
				partyDamagePerSecInLastOneMinute: Math.floor(Math.random() * 100),
				actors: [],
			};
			this.callback(fakeCombatData);
		}, 1000);
	}

	public stop() {
		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = null;
		}
	}
}

const GbfrActWs = singleton(_GbfrActWs);
const FakeCombatData = singleton(_FakeCombatData);

export { FakeCombatData, GbfrActWs };
