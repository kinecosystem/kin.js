import {
	Keypair,
	Account,
	Operation,
	Asset, Server
} from "@kinecosystem/kin-sdk";
import { KinNetwork } from "./networks";
import {
	Operations,
	KinBalance,
	getKinBalance,
	KinPayment,
	isKinBalance
} from "./blockchain";

export { Keypair };

export type Address = string;

export type OnPaymentListener = (payment: Payment, stream: PaymentStream) => void;

export interface Payment {
	readonly id: string;
	readonly hash: string;
	readonly amount: number;
	readonly sender: string;
	readonly recipient: string;
	readonly timestamp: string;
	readonly memo: string | undefined;
}

export type Balance = {
	readonly cached: number;
	update(): Promise<number>;
};

function fromBlockchainPayment(sp: KinPayment): Payment {
	return {
		id: sp.id,
		hash: sp.id,
		memo: sp.memo,
		sender: sp.from,
		recipient: sp.to,
		timestamp: sp.created_at,
		amount: Number(sp.amount)
	};
}

async function getPaymentsFrom(collection: Server.CollectionPage<Server.PaymentOperationRecord>): Promise<Payment[]> {
	const payments = await KinPayment.allFrom(collection);
	return payments
		.filter(payment => payment) // TODO check that payments are native asset
		.map(fromBlockchainPayment);
}

export interface KinWallet {
	readonly address: string;
	readonly balance: Balance;

	getPayments(): Promise<Payment[]>;

	onPaymentReceived(listener: OnPaymentListener): void;

	pay(recipient: Address, amount: number, options?: { memo?: string, fee?: number }): Promise<Payment>;

	getTransactionXdr(recipient: Address, amount: number, options?: { memo?: string, fee?: number }): Promise<string>;

	toString(): string;
}

class PaymentStream {
	private static readonly POLLING_INTERVAL = 2000;

	private readonly accountId: string;
	private readonly network: KinNetwork;

	private timer: any | undefined;
	private cursor: string | undefined;
	private listener: OnPaymentListener | undefined;
	private stopLoop: boolean = false;

	constructor(network: KinNetwork, accountId: string) {
		this.network = network;
		this.accountId = accountId;
		this.check = this.check.bind(this);
	}

	public setListener(listener: OnPaymentListener) {
		this.listener = listener;
	}

	public start() {
		if (this.stopLoop) {
			return;
		}
		if (this.timer === undefined) {
			this.timer = setTimeout(this.check, PaymentStream.POLLING_INTERVAL);
		}
	}

	public stop() {
		clearTimeout(this.timer);
		this.timer = undefined;
		this.stopLoop = true;
	}

	private async check() {
		this.timer = undefined;
		const builder = this.network.server
			.payments()
			.forAccount(this.accountId);

		let order: "asc" | "desc" = "desc";
		if (this.cursor) {
			builder.cursor(this.cursor);
			order = "asc";
		}
		builder.order(order);
		const blockchainPayments = await builder.call();

		if (this.listener) {
			let kinPayments = await getPaymentsFrom(blockchainPayments);

			if (order === "desc") {
				kinPayments = kinPayments.reverse();
			}
			kinPayments.forEach(payment => this.listener!(payment, this));
		}

		if (blockchainPayments.records.length) {
			if (order === "asc") {
				this.cursor = blockchainPayments.records[blockchainPayments.records.length - 1].paging_token;
			} else {
				this.cursor = blockchainPayments.records[0].paging_token;
			}
		}
		this.start();
	}
}

class Wallet implements KinWallet {
	public static async create(operations: Operations, network: KinNetwork, keys: Keypair, account: Account, kinBalance: KinBalance): Promise<KinWallet> {
		return new Wallet(operations, network, keys, account, kinBalance);
	}

	private readonly keys: Keypair;
	private readonly account: Account;
	private readonly network: KinNetwork;
	private readonly operations: Operations;

	private kinBalance: KinBalance;

	private constructor(operations: Operations, network: KinNetwork, keys: Keypair, account: Account, kinBalance: KinBalance) {
		this.keys = keys;
		this.account = account;
		this.network = network;
		this.kinBalance = kinBalance;
		this.operations = operations;
	}

	public onPaymentReceived(listener: OnPaymentListener) {
		const payments = new PaymentStream(this.network, this.keys.publicKey());
		payments.setListener(listener);
		payments.start();
	}

	public async getTransactionXdr(recipient: Address, amount: number, options: { memo?: string, fee?: number } = {}): Promise<string> {
		const op = Operation.payment({
			destination: recipient,
			asset: Asset.native(),
			amount: amount.toString()
		});

		if (options.memo && typeof options.memo !== "string") {
			options.memo = undefined;
		}

		return await this.operations.createTransactionXDR(op, options);
	}

	public async pay(recipient: Address, amount: number, options: { memo?: string, fee?: number } = {}): Promise<Payment> {
		const op = Operation.payment({
			destination: recipient,
			asset: Asset.native(),
			amount: amount.toString()
		});

		if (options.memo && typeof options.memo !== "string") {
			options.memo = undefined;
		}

		const payment = await this.operations.send(op, options);
		const operation = await this.operations.getPaymentOperationRecord(payment.hash);
		return fromBlockchainPayment(await KinPayment.from(operation));
	}

	public async getPayments() {
		const payments = await this.network.server
			.payments()
			.forAccount(this.keys.publicKey())
			.order("desc")
			.limit(10)
			.call();

		return await getPaymentsFrom(payments);
	}

	public get address() {
		return this.keys.publicKey();
	}

	public get balance() {
		const self = this;

		return {
			get cached() {
				return parseFloat(self.kinBalance!.balance);
			},
			async update() {
				await self.updateBalance();
				return parseFloat(self.kinBalance!.balance);
			}
		};
	}

	public toString() {
		return `[Wallet ${ this.keys.publicKey() }: ${ this.balance.cached } KIN] `;
	}

	private async updateBalance() {
		const account = await this.network.server.loadAccount(this.keys.publicKey());
		this.kinBalance = getKinBalance(account);
	}
}

export async function create(network: KinNetwork, keys: Keypair) {
	const operations = Operations.for(network.server, keys);
	const accountResponse = await operations.loadAccount(keys.publicKey());

	const account = new Account(accountResponse.accountId(), accountResponse.sequenceNumber());
	const nativeBalance = accountResponse.balances.find(isKinBalance);
	const kinBalance = getKinBalance(accountResponse);

	if (!nativeBalance) {
		throw new Error("account contains no balance");
	}

	return Wallet.create(operations, network, keys, account, kinBalance);
}
