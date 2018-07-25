import * as StellarSdk from "stellar-sdk";
import {
	Asset,
	Keypair,
	Account,
	CollectionPage,
	PaymentOperationRecord
} from "stellar-sdk";

import { KinNetwork } from "./networks";
import {
	KinBalance,
	Operations,
	isKinBalance,
	NativeBalance,
	StellarPayment,
	isNativeBalance
} from "./stellar";

export { Keypair };

export type Address = string;

export type OnPaymentListener = (payment: Payment) => void;

export interface Payment {
	readonly id: string;
	readonly hash: string;
	readonly amount: number;
	readonly sender: string;
	readonly recipient: string;
	readonly timestamp: string;
	readonly memo: string | undefined;
}

function fromStellarPayment(sp: StellarPayment): Payment {
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

async function getPaymentsFrom(collection: CollectionPage<PaymentOperationRecord>, asset: Asset): Promise<Payment[]> {
	const payments = await StellarPayment.allFrom(collection);
	return payments
		.filter(payment => payment.is(asset))
		.map(fromStellarPayment);
}

export interface KinWallet {
	getPayments(): Promise<Payment[]>;
	onPaymentReceived(listener: OnPaymentListener): void;
	pay(recipient: Address, amount: number, memo?: string): Promise<Payment>;
}

class PaymentStream {
	private static readonly POLLING_INTERVAL = 2000;

	private readonly accountId: string;
	private readonly network: KinNetwork;

	private timer: any | undefined;
	private cursor: string | undefined;
	private listener: OnPaymentListener | undefined;

	constructor(network: KinNetwork, accountId: string) {
		this.network = network;
		this.accountId = accountId;
		this.check = this.check.bind(this);
	}

	public setListener(listener: OnPaymentListener) {
		this.listener = listener;
	}

	public start() {
		if (this.timer === undefined) {
			this.timer = setTimeout(this.check, PaymentStream.POLLING_INTERVAL);
		}
	}

	public stop() {
		clearTimeout(this.timer);
		this.timer = undefined;
	}

	private async check() {
		const builder = this.network.server
			.payments()
			.forAccount(this.accountId)
			.order("desc");

		if (this.cursor) {
			builder.cursor(this.cursor);
		}

		const payments = await builder.call();

		if (this.listener) {
			(await getPaymentsFrom(payments, this.network.asset))
				.forEach(payment => this.listener!(payment));
		}

		this.start();
	}
}

class Wallet implements KinWallet {
	public static async create(operations: Operations, network: KinNetwork, keys: Keypair, account: Account, nativeBalance: NativeBalance, kinBalance: KinBalance | undefined): Promise<KinWallet> {
		if (kinBalance === undefined) {
			kinBalance = (await operations.establishTrustLine(keys.publicKey())) || undefined;
		}

		return new Wallet(operations, network, keys, account, nativeBalance, kinBalance);
	}

	private readonly keys: Keypair;
	private readonly account: Account;
	private readonly network: KinNetwork;
	private readonly operations: Operations;
	private readonly payments: PaymentStream;

	private nativeBalance: NativeBalance;
	private kinBalance: KinBalance | undefined;

	private constructor(operations: Operations, network: KinNetwork, keys: Keypair, account: Account, nativeBalance: NativeBalance, kinBalance: KinBalance | undefined) {
		this.keys = keys;
		this.account = account;
		this.network = network;
		this.kinBalance = kinBalance;
		this.operations = operations;
		this.nativeBalance = nativeBalance;
		this.payments = new PaymentStream(this.network, this.keys.publicKey());
	}

	public onPaymentReceived(listener: OnPaymentListener) {
		this.payments.setListener(listener);
		this.payments.start();
	}

	public async pay(recipient: Address, amount: number, memo?: string): Promise<Payment> {
		const op = StellarSdk.Operation.payment({
			destination: recipient,
			asset: this.network.asset,
			amount: amount.toString()
		});

		if (memo && typeof memo !== "string") {
			memo = undefined;
		}

		console.log("moo 1");
		const payment = await this.operations.send(op, memo);
		console.log("moo 2");
		const operation = (await payment.operations())._embedded.records[0] as PaymentOperationRecord;
		console.log("moo 3");
		return fromStellarPayment(await StellarPayment.from(operation));
	}

	public async getPayments() {
		const payments = await this.network.server
			.payments()
			.forAccount(this.keys.publicKey())
			.order("desc")
			.limit(10)
			.call();

		return await getPaymentsFrom(payments, this.network.asset);
	}
}

export async function create(network: KinNetwork, keys: Keypair) {
	console.log("create 1");
	const operations = Operations.for(network.server, keys, network.asset);
	console.log("create 2");
	const accountResponse = await operations.loadAccount(keys.publicKey());
	console.log("create 3");

	const account = new Account(accountResponse.accountId(), accountResponse.sequenceNumber());
	console.log("create 4");
	const nativeBalance = accountResponse.balances.find(isNativeBalance);
	console.log("create 5");
	const kinBalance = getKinBalance(accountResponse, network.asset);
	console.log("create 6");

	if (!nativeBalance) {
		throw new Error("account contains no balance");
	}

	console.log("create 7");
	return Wallet.create(operations, network, keys, account, nativeBalance, kinBalance);
}

function getKinBalance(accountResponse: StellarSdk.AccountResponse, asset: Asset) {
	return accountResponse.balances.find(balance => (
		isKinBalance(balance, asset)
	)) as KinBalance | undefined;
}
