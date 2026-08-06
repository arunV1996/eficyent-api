import { Op } from "sequelize";
import BeneficiaryTransaction from "../models/beneficiary_transaction.model";
import DepositTransaction from "../models/deposit_transaction.model";
import Ledger from "../models/ledger.model";
import Merchant from "../models/merchant.model";
import User from "../models/user.model";
import UserInformation from "../models/user_information.model";
import VirtualAccount from "../models/virtual_account.model";
import WalletTransaction from "../models/wallet_transaction.model";
import { computeBankBalanceAsOf } from "./balance.helper";
import { getVirtualAccountScope } from "./virtual_account.helper";
import {
    BENEFICIARY_TRANSACTION_CANCELLED,
    BENEFICIARY_TRANSACTION_COMPLIANCE_REJECTED,
    BENEFICIARY_TRANSACTION_EXPIRED,
    BENEFICIARY_TRANSACTION_FAILED,
    BENEFICIARY_TRANSACTION_REJECTED,
    DEPOSIT_TRANSACTION_FAILED,
    DEPOSIT_TRANSACTION_REJECTED,
    MORPH_BENEFICIARY_TRANSACTION,
    MORPH_DEPOSIT_TRANSACTION,
    MORPH_WALLET_TRANSACTION,
    USER_TYPE_BUSINESS,
} from "../utils/constants";

/**
 * Mirror of the legacy statementService.fetchStatementData —
 * partitions the account's ledger rows for the period into
 * payins/payouts/wallet transactions, computes opening/closing
 * balances from the ledger snapshots and resolves the account-holder
 * naming (merchant vs user vs business legal name).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface StatementEntry {
    ledger: Ledger;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transaction: any;
    /** True when a later refund ledger points back at this entry. */
    refunded: boolean;
}

export interface StatementData {
    metadata: {
        isMerchant: boolean;
        merchantName: string;
        userName: string;
        accountHolderName: string;
        fromDate: string;
        toDate: string;
        generatedAt: string;
        timezone: string;
    };
    walletSummary: {
        account_number: string;
        currency: string;
        opening_balance: number;
        amount_received: number;
        amount_paid: number;
        closing_balance: number;
    };
    payins: StatementEntry[];
    payouts: StatementEntry[];
    wallet_transactions: StatementEntry[];
}

export const fetchStatementData = async ({
    user,
    userId,
    from_date: fromDate,
    to_date: toDate,
    bank_account_id: bankAccountId,
}: {
    user: User;
    userId: number;
    from_date: string;
    to_date: string;
    bank_account_id: string;
}): Promise<StatementData> => {
    const baseScope = await getVirtualAccountScope(user);

    const virtualAccount = await VirtualAccount.findOne({
        where: {
            ...(baseScope as Record<string, unknown>),
            uniqueId: bankAccountId,
        },
    });
    if (!virtualAccount) {
        throw new Error("Virtual account not found or unauthorized");
    }

    const ledgers = await Ledger.findAll({
        where: {
            userId,
            virtualAccountId: virtualAccount.id,
            createdAt: {
                [Op.gte]: new Date(`${fromDate}T00:00:00Z`),
                [Op.lte]: new Date(`${toDate}T23:59:59Z`),
            },
        },
        order: [["created_at", "ASC"]],
    });

    const payins: StatementEntry[] = [];
    const payouts: StatementEntry[] = [];
    const walletTransactions: StatementEntry[] = [];
    let totalPayin = 0;
    let totalPayout = 0;

    const collectIds = (morphType: string): number[] =>
        ledgers
            .filter((ledger) => ledger.transactionType === morphType)
            .map((ledger) => ledger.transactionId)
            .filter((id): id is number => Boolean(id));

    const depositIds = collectIds(MORPH_DEPOSIT_TRANSACTION);
    const beneficiaryIds = collectIds(MORPH_BENEFICIARY_TRANSACTION);
    const walletTransactionIds = collectIds(MORPH_WALLET_TRANSACTION);

    const [deposits, beneficiaries, walletRows] = await Promise.all([
        depositIds.length > 0
            ? DepositTransaction.findAll({
                  where: { id: { [Op.in]: depositIds } },
              })
            : [],
        beneficiaryIds.length > 0
            ? BeneficiaryTransaction.findAll({
                  where: { id: { [Op.in]: beneficiaryIds } },
              })
            : [],
        walletTransactionIds.length > 0
            ? WalletTransaction.findAll({
                  where: { id: { [Op.in]: walletTransactionIds } },
              })
            : [],
    ]);

    const depositMap = new Map(
        deposits.map((deposit) => [String(deposit.id), deposit]),
    );
    const beneficiaryMap = new Map(
        beneficiaries.map((beneficiary) => [
            String(beneficiary.id),
            beneficiary,
        ]),
    );
    const walletTransactionMap = new Map(
        walletRows.map((walletRow) => [String(walletRow.id), walletRow]),
    );

    // Refund ledger rows carry refund_ledger_id pointing back at the
    // ORIGINAL debit ledger — collect those targets so original
    // entries can be flagged as refunded (the original row itself
    // never has refund_ledger_id set).
    const refundLedgerRows = await Ledger.findAll({
        where: { userId, refundLedgerId: { [Op.ne]: null } },
        attributes: ["refundLedgerId"],
    });
    const refundedLedgerIds = new Set(
        refundLedgerRows.map((row) => Number(row.refundLedgerId)),
    );

    // Terminal non-settled states per transaction type (the previous
    // shared status===2||3 check used the DEPOSIT numbering for
    // payouts too — 2/3 are INITIATED/PROCESSING there, so rejected
    // payouts were summed and in-flight ones dropped).
    const DEPOSIT_EXCLUDED_STATUSES = new Set<number>([
        DEPOSIT_TRANSACTION_FAILED,
        DEPOSIT_TRANSACTION_REJECTED,
    ]);
    const PAYOUT_EXCLUDED_STATUSES = new Set<number>([
        BENEFICIARY_TRANSACTION_FAILED,
        BENEFICIARY_TRANSACTION_EXPIRED,
        BENEFICIARY_TRANSACTION_REJECTED,
        BENEFICIARY_TRANSACTION_CANCELLED,
        BENEFICIARY_TRANSACTION_COMPLIANCE_REJECTED,
    ]);

    for (const ledger of ledgers) {
        const refunded =
            refundedLedgerIds.has(Number(ledger.id)) ||
            Boolean(ledger.refundLedgerId);

        if (ledger.transactionType === MORPH_DEPOSIT_TRANSACTION) {
            const transaction = depositMap.get(String(ledger.transactionId));
            if (transaction) {
                payins.push({ ledger, transaction, refunded });
                if (
                    !DEPOSIT_EXCLUDED_STATUSES.has(transaction.status) &&
                    !refunded
                ) {
                    totalPayin += Number(transaction.totalAmount ?? 0);
                }
            }
        } else if (
            ledger.transactionType === MORPH_BENEFICIARY_TRANSACTION
        ) {
            const transaction = beneficiaryMap.get(
                String(ledger.transactionId),
            );
            if (transaction) {
                payouts.push({ ledger, transaction, refunded });
                if (
                    !PAYOUT_EXCLUDED_STATUSES.has(transaction.status) &&
                    !refunded
                ) {
                    totalPayout += Number(transaction.totalAmount ?? 0);
                }
            }
        } else if (ledger.transactionType === MORPH_WALLET_TRANSACTION) {
            const transaction = walletTransactionMap.get(
                String(ledger.transactionId),
            );
            if (transaction) {
                walletTransactions.push({ ledger, transaction, refunded });
            }
        }
    }

    // Account owner naming: owned merchant first, then the assigned
    // merchant, then the user's (business legal) name.
    const accountUser = virtualAccount.userId
        ? await User.findByPk(virtualAccount.userId)
        : null;

    // Opening balance = the running bank balance immediately before the
    // period; closing = immediately after it. Reconstructed from the
    // transaction tables with the same formula as the live balance
    // (Helper::bankBalance) rather than trusting stored ledger
    // snapshots, which could drift (and go negative) when refunds
    // landed outside the account's ledger sequence.
    const balanceUser =
        userId === user.id ? user : ((await User.findByPk(userId)) ?? user);
    const [openingBalanceDecimal, closingBalanceDecimal] = await Promise.all([
        computeBankBalanceAsOf(
            balanceUser,
            virtualAccount,
            null,
            new Date(`${fromDate}T00:00:00Z`),
        ),
        computeBankBalanceAsOf(
            balanceUser,
            virtualAccount,
            null,
            new Date(new Date(`${toDate}T23:59:59Z`).getTime() + 1000),
        ),
    ]);
    const openingBalance = openingBalanceDecimal.toNumber();
    const closingBalance = closingBalanceDecimal.toNumber();
    const ownerMerchant = accountUser
        ? await Merchant.findOne({ where: { userId: accountUser.id } })
        : null;
    const assignedMerchant =
        accountUser?.merchantId && !ownerMerchant
            ? await Merchant.findByPk(accountUser.merchantId)
            : null;
    const merchant = ownerMerchant || assignedMerchant;
    const isMerchant = Boolean(merchant);
    const merchantName = merchant?.name || "N/A";

    let userName = "N/A";
    if (accountUser) {
        if (Number(accountUser.userType) === USER_TYPE_BUSINESS) {
            const information = await UserInformation.findOne({
                where: { userId: accountUser.id },
            });
            userName =
                information?.legalName ||
                information?.businessName ||
                `${accountUser.firstName || ""} ${accountUser.lastName || ""}`.trim() ||
                "N/A";
        } else {
            userName =
                `${accountUser.firstName || ""} ${accountUser.lastName || ""}`.trim() ||
                "N/A";
        }
    }

    const accountHolderName =
        virtualAccount.accountHolderName ||
        (isMerchant ? merchantName : userName);

    const walletSummary = {
        account_number:
            virtualAccount.accountNumber || virtualAccount.uniqueId,
        currency: virtualAccount.currency,
        opening_balance: openingBalance,
        amount_received: totalPayin,
        amount_paid: totalPayout,
        closing_balance: closingBalance,
    };

    const generatedAt = new Date();
    const timeZone = user?.timezone || accountUser?.timezone || "Asia/Kolkata";
    const formattedDate = generatedAt.toLocaleDateString("en-US", {
        timeZone,
        year: "numeric",
        month: "short",
        day: "numeric",
    });
    const formattedTime = generatedAt.toLocaleTimeString("en-US", {
        timeZone,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
    });

    return {
        metadata: {
            isMerchant,
            merchantName,
            userName,
            accountHolderName,
            fromDate,
            toDate,
            generatedAt: `${formattedDate} ${formattedTime}`,
            timezone: timeZone,
        },
        walletSummary,
        payins,
        payouts,
        wallet_transactions: walletTransactions,
    };
};
