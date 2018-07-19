export * from "stellar-sdk";

declare module "stellar-sdk" {
	export namespace Operation {
		interface ChangeTrustOptions {
			limit?: string;
		}
	}
}

export const KIN_ASSET_CODE = "KIN";

export type NativeBalance = {
	balance: string;
	asset_type: "native";
};

export function isNativeBalance(obj: any): obj is NativeBalance {
	return obj &&
		typeof obj.balance === "string" &&
		obj.asset_type === "native";
}

export type KinBalance = {
	limit: string;
	balance: string;
	asset_issuer: string;
	asset_type: "credit_alphanum4";
	asset_code: typeof KIN_ASSET_CODE;
};

export function isKinBalance(obj: any): obj is KinBalance {
	return obj &&
		typeof obj.balance === "string" &&
		obj.asset_code === KIN_ASSET_CODE &&
		obj.asset_type === "credit_alphanum4";
}

export type TransactionError = {
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
			}
		}
	}
};

export function isTransactionError(error: any): error is TransactionError {
	return error.data && error.data.extras &&
		typeof error.data.title === "string" &&
		typeof error.data.type === "string" &&
		typeof error.data.status === "number" &&
		typeof error.data.detail === "string";
}
