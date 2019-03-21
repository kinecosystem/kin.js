import {
	Keypair,
	xdr,
	Operation,
	Memo,
	TransactionBuilder,
	TimeoutInfinite,
	Transaction,
	Server
} from "@kinecosystem/kin-sdk";

import { retry } from "./utils";
import { isTransactionError } from "./errors";

export type KinBalance = {
	balance: string;
	asset_type: "native";
};

export function isKinBalance(obj: any): obj is KinBalance {
	return obj &&
		typeof obj.balance === "string" &&
		obj.asset_type === "native";
}

export function getKinBalance(account: Server.AccountResponse): KinBalance {
	return account && account.balances ?
		account.balances.find(balance => isKinBalance(balance)) as KinBalance
		: { balance: "0", asset_type: "native" };
}

export function isTransactionRecord(obj: Server.TransactionRecord | Server.PaymentOperationRecord): obj is Server.TransactionRecord {
	return (obj as Server.TransactionRecord).hash !== undefined;
}

export class KinPayment {
	public static from(transaction: Server.TransactionRecord): Promise<KinPayment>;
	public static from(operation: Server.PaymentOperationRecord): Promise<KinPayment>;
	public static async from(obj: Server.TransactionRecord | Server.PaymentOperationRecord): Promise<KinPayment> {
		let transaction: Server.TransactionRecord;
		let operation: Server.PaymentOperationRecord;

		if (isTransactionRecord(obj)) {
			transaction = obj;
			operation = (await obj.operations())._embedded.records[0] as Server.PaymentOperationRecord;
		} else {
			operation = obj;
			transaction = await operation.transaction();
		}

		return new KinPayment(transaction, operation);
	}

	public static async allFrom(collection: Server.CollectionPage<Server.PaymentOperationRecord>): Promise<KinPayment[]> {
		return await Promise.all(collection.records.map(async record => await this.from(record)));
	}

	public readonly transaction: Server.TransactionRecord;
	public readonly operation: Server.PaymentOperationRecord;

	private constructor(transaction: Server.TransactionRecord, operation: Server.PaymentOperationRecord) {
		this.operation = operation;
		this.transaction = transaction;
	}

	public get id() {
		return this.transaction.id;
	}

	public get hash() {
		return this.transaction.hash;
	}

	public get amount() {
		return this.operation.amount;
	}

	public get to() {
		return this.operation.to;
	}

	public get from() {
		return this.operation.from;
	}

	public get created_at() {
		return this.transaction.created_at;
	}

	public get memo() {
		return this.transaction.memo;
	}
}

export class Operations {
	public static for(server: Server, keys: Keypair): Operations {
		return new Operations(server, keys);
	}

	private readonly keys: Keypair;
	private readonly server: Server;

	private constructor(server: Server, keys: Keypair) {
		this.keys = keys;
		this.server = server;
	}

	public async send(operation: xdr.Operation<Operation>, memoText?: string): Promise<Server.TransactionRecord> {
		const account = await this.loadAccount(this.keys.publicKey());  // loads the sequence number
		const transaction = this.createTransaction(account, operation, memoText);
		return await this._send(transaction);
	}

	@retry({ errorMessagePrefix: "failed to load account" })
	public async loadAccount(address: string): Promise<Server.AccountResponse> {
		return await this.server.loadAccount(address);
	}

	@retry({ errorMessagePrefix: "failed to fetch payment operation record" })
	public async getPaymentOperationRecord(hash: string): Promise<Server.PaymentOperationRecord> {
		return (await this.server.operations().forTransaction(hash).call()).records[0] as Server.PaymentOperationRecord;
	}

	public async createTransactionXDR(operation: xdr.Operation<Operation>, memoText?: string): Promise<string> {
		const account = await this.loadAccount(this.keys.publicKey());  // loads the sequence number

		const transaction = this.createTransaction(account, operation, memoText);
		return transaction.toEnvelope().toXDR().toString();
	}

	private createTransaction(account: Server.AccountResponse, operation: xdr.Operation<Operation>, memoText?: string) {
		const transactionBuilder = new TransactionBuilder(account);
		transactionBuilder.addOperation(operation);

		if (memoText) {
			transactionBuilder.addMemo(Memo.text(memoText));
		}
		transactionBuilder.setTimeout(TimeoutInfinite);

		const transaction = transactionBuilder.build();
		transaction.sign(this.keys);

		return transaction;
	}

	@retry()
	private async checkKinBalance(address: string) {
		const accountResponse = await this.server.loadAccount(address);
		return getKinBalance(accountResponse)!;
	}

	@retry({ errorMessagePrefix: "transaction failure" })
	private async _send(transaction: Transaction) {
		try {
			return await this.server.submitTransaction(transaction);
		} catch (e) {
			if (isTransactionError(e)) {
				throw new Error(
					`\nKin Blockchain Error:\ntransaction: ${ e.response.data.extras.result_codes.transaction }` +
					`\n\toperations: ${ e.response.data.extras.result_codes.operations.join(",") }`
				);
			} else {
				throw e;
			}
		}
	}
}
