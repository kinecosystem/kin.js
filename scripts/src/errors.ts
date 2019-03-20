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
