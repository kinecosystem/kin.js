import {
	Keypair,
	xdr,
	Operation,
	Memo
} from "@kinecosystem/kin-sdk";
import * as StellarSdk from "@kinecosystem/kin-sdk";

import { retry } from "./utils";

export * from "@kinecosystem/kin-sdk";

export type NativeBalance = {
	balance: string;
	asset_type: "native";
};

export function isNativeBalance(obj: any): obj is NativeBalance {
	return obj &&
		typeof obj.balance === "string" &&
		obj.asset_type === "native";
}

export function getKinBalance(account: StellarSdk.Server.AccountResponse): NativeBalance {
	return account && account.balances ?
		account.balances.find(balance => isNativeBalance(balance)) as NativeBalance
		: { balance: "0", asset_type: "native" };
}

export type TransactionError = {
	response: {
		status: number;
		statusText: string;
		data: {
			title: string;
			type: string;
			status: number;
			detail: string;
			extras: {
				envelope_xdr: string;
				result_xdr: string;
				result_codes: {
					transaction: string;
					operations: string[];
				};
			};
		};
	};
};

export function isTransactionError(error: any): error is TransactionError {
	return error.response && error.response.data && error.response.data.extras &&
		typeof error.response.data.title === "string" &&
		typeof error.response.data.type === "string" &&
		typeof error.response.data.status === "number" &&
		typeof error.response.data.detail === "string";
}

function isTransactionRecord(obj: StellarSdk.Server.TransactionRecord | StellarSdk.Server.PaymentOperationRecord): obj is StellarSdk.Server.TransactionRecord {
	return (obj as StellarSdk.Server.TransactionRecord).hash !== undefined;
}

export class KinPayment {
	public static from(stellarTransaction: StellarSdk.Server.TransactionRecord): Promise<KinPayment>;
	public static from(stellarPaymentOperation: StellarSdk.Server.PaymentOperationRecord): Promise<KinPayment>;
	public static async from(stellarObj: StellarSdk.Server.TransactionRecord | StellarSdk.Server.PaymentOperationRecord): Promise<KinPayment> {
		let transaction: StellarSdk.Server.TransactionRecord;
		let operation: StellarSdk.Server.PaymentOperationRecord;

		if (isTransactionRecord(stellarObj)) {
			transaction = stellarObj;
			operation = (await stellarObj.operations())._embedded.records[0] as StellarSdk.Server.PaymentOperationRecord;
		} else {
			operation = stellarObj;
			transaction = await operation.transaction();
		}

		return new KinPayment(transaction, operation);
	}

	public static async allFrom(collection: StellarSdk.Server.CollectionPage<StellarSdk.Server.PaymentOperationRecord>): Promise<KinPayment[]> {
		// TODO: add types, ad matai
		return (await Promise.all(collection.records.map(async record => await this.from(record)))) as any;
	}

	public readonly transaction: StellarSdk.Server.TransactionRecord;
	public readonly operation: StellarSdk.Server.PaymentOperationRecord;

	private constructor(transaction: StellarSdk.Server.TransactionRecord, operation: StellarSdk.Server.PaymentOperationRecord) {
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
	public static for(server: StellarSdk.Server, keys: Keypair): Operations {
		return new Operations(server, keys);
	}

	private readonly keys: Keypair;
	private readonly server: StellarSdk.Server;

	private constructor(server: StellarSdk.Server, keys: Keypair) {
		this.keys = keys;
		this.server = server;
	}

	public async send(operation: xdr.Operation<Operation.Operation>, memoText?: string): Promise<StellarSdk.Server.TransactionRecord> {
		const account = await this.loadAccount(this.keys.publicKey());  // loads the sequence number
		return await this._send(account, operation, memoText);
	}

	@retry({ errorMessagePrefix: "failed to load account" })
	public async loadAccount(address: string): Promise<StellarSdk.Server.AccountResponse> {
		return await this.server.loadAccount(address);
	}

	@retry({ errorMessagePrefix: "failed to fetch payment operation record" })
	public async getPaymentOperationRecord(hash: string): Promise<StellarSdk.Server.PaymentOperationRecord> {
		return (await this.server.operations().forTransaction(hash).call()).records[0] as StellarSdk.Server.PaymentOperationRecord;
	}

	@retry({ errorMessagePrefix: "transaction failure" })
	public async createTransactionXDR(account: StellarSdk.Server.AccountResponse, operation: xdr.Operation<Operation.Operation>, memoText?: string) {
		try {
			const transactionBuilder = new StellarSdk.TransactionBuilder(account);
			transactionBuilder.addOperation(operation);

			if (memoText) {
				transactionBuilder.addMemo(Memo.text(memoText));
			}
			const transaction = transactionBuilder.build();

			transaction.sign(this.keys);

			return transaction.toEnvelope().toXDR().toString();
		} catch (e) {
			if (isTransactionError(e)) {
				throw new Error(
					`\nStellar Error:\ntransaction: ${ e.response.data.extras.result_codes.transaction }` +
					`\n\toperations: ${e.response.data.extras.result_codes.operations.join(",")}`
				);
			} else {
				throw e;
			}
		}
	}

	@retry()
	private async checkKinBalance(address: string) {
		const accountResponse = await this.server.loadAccount(address);
		return getKinBalance(accountResponse)!;
	}

	@retry({ errorMessagePrefix: "transaction failure" })
	private async _send(account: StellarSdk.Server.AccountResponse, operation: xdr.Operation<Operation.Operation>, memoText?: string) {
		try {
			const transactionBuilder = new StellarSdk.TransactionBuilder(account);
			transactionBuilder.addOperation(operation);

			if (memoText) {
				transactionBuilder.addMemo(Memo.text(memoText));
			}
			const transaction = transactionBuilder.build();

			transaction.sign(this.keys);

			return await this.server.submitTransaction(transaction);
		} catch (e) {
			if (isTransactionError(e)) {
				throw new Error(
					`\nStellar Error:\ntransaction: ${ e.response.data.extras.result_codes.transaction }` +
					`\n\toperations: ${e.response.data.extras.result_codes.operations.join(",")}`
				);
			} else {
				throw e;
			}
		}
	}
}
