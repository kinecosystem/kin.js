import * as StellarSdk from "stellar-sdk";
import {
	xdr,
	Memo,
	Asset,
	Keypair,
	Account,
	Operation,
	CollectionPage,
	TransactionRecord,
	PaymentOperationRecord
} from "stellar-sdk";

import { retry } from "./utils";
import { KinNetwork } from "./networks";
import { NativeBalance, isNativeBalance, KinBalance, isKinBalance, isTransactionError, StellarPayment } from "./stellar";

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
	private readonly keys: Keypair;
	private readonly account: Account;
	private readonly network: KinNetwork;
	private readonly payments: PaymentStream;

	private nativeBalance: NativeBalance;
	private kinBalance: KinBalance | undefined;

	constructor(network: KinNetwork, keys: Keypair, account: Account, nativeBalance: NativeBalance, kinBalance: KinBalance | undefined) {
		this.keys = keys;
		this.account = account;
		this.network = network;
		this.kinBalance = kinBalance;
		this.nativeBalance = nativeBalance;
		this.payments = new PaymentStream(this.network, this.keys.publicKey());

		if (this.kinBalance === undefined) {
			this.establishTrustLine();
		}
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

		const payment = await this.stellarOperation(op, memo);
		const operation = (await payment.operations())._embedded.records[0] as PaymentOperationRecord;
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

	private async establishTrustLine() {
		console.log("establishing trustline");
		const op = StellarSdk.Operation.changeTrust({
			asset: this.network.asset
		});

		const fn = async () => {
			try {
				await this.stellarOperation(op);
				const accountResponse = await this.network.server.loadAccount(this.keys.publicKey());
				console.log("trustline established");

				this.kinBalance = accountResponse.balances.find(balance => (
					isKinBalance(balance) && balance.asset_issuer === this.network.asset.issuer
				)) as KinBalance | undefined;
			} catch (e) {
				console.log(e);
				return null;
			}
		};

		await retry(
			fn,
			res => res !== null,
			"failed to establish trustline");
	}

	private async stellarOperation(operation: xdr.Operation<Operation.Operation>, memoText?: string): Promise<TransactionRecord> {
		try {
			const accountResponse = await this.network.server.loadAccount(this.keys.publicKey());
			const transactionBuilder = new StellarSdk.TransactionBuilder(accountResponse);
			transactionBuilder.addOperation(operation);

			if (memoText) {
				transactionBuilder.addMemo(Memo.text(memoText));
			}
			const transaction = transactionBuilder.build();

			transaction.sign(this.keys);
			return await this.network.server.submitTransaction(transaction);
		} catch (e) {
			if (isTransactionError(e)) {
				throw new Error(
					`\nStellar Error:\ntransaction: ${ e.data.extras.result_codes.transaction }` +
					`\n\toperations: ${e.data.extras.result_codes.operations.join(",")}`
				);
			} else {
				throw e;
			}
		}
	}
}

export async function create(network: KinNetwork, keys: Keypair) {
	const accountResponse = await network.server.loadAccount(keys.publicKey());
	const account = new Account(accountResponse.accountId(), accountResponse.sequenceNumber());
	const nativeBalance = accountResponse.balances.find(isNativeBalance);
	const kinBalance = accountResponse.balances.find(balance => (
		isKinBalance(balance) && balance.asset_issuer === network.asset.issuer
	)) as KinBalance | undefined;

	if (!nativeBalance) {
		throw new Error("account contains no balance");
	}

	return new Wallet(network, keys, account, nativeBalance, kinBalance);
}
