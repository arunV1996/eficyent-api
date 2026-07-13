import { prisma } from "../../db/prisma";
import { MORPH_BENEFICIARY_TRANSACTION, MORPH_DEPOSIT_TRANSACTION, MORPH_WALLET_TRANSACTION } from "../../helpers/constants";
import { getVirtualAccountScope } from "../virtualAccounts/virtualAccountService";

export const statementService = {
    async fetchStatementData({
        user,
        userId,
        from_date,
        to_date,
        bank_account_id,
    }: {
        user: any;
        userId: bigint;
        from_date: string;
        to_date: string;
        bank_account_id: string;
    }) {
        const baseScope = await getVirtualAccountScope(user);

        const virtualAccount = await prisma().virtualAccount.findFirst({
            where: { ...baseScope, uniqueId: bank_account_id },
            include: { 
                user: { 
                    include: { 
                        merchants_merchants_user_idTousers: true,
                        merchants_users_merchant_idTomerchants: true,
                        information: true
                    } 
                } 
            }
        });

        if (!virtualAccount) {
            throw new Error("Virtual account not found or unauthorized");
        }

        const ledgers = await prisma().ledger.findMany({
            where: {
                userId: userId,
                virtualAccountId: virtualAccount.id,
                createdAt: {
                    gte: new Date(`${from_date}T00:00:00Z`),
                    lte: new Date(`${to_date}T23:59:59Z`),
                },
            },
            orderBy: { createdAt: "asc" },
        });

        const payins: any[] = [];
        const payouts: any[] = [];
        const wallet_transactions: any[] = [];
        let totalPayin = 0;
        let totalPayout = 0;

        const depositIds = ledgers
            .filter((l) => l.transactionType === MORPH_DEPOSIT_TRANSACTION)
            .map((l) => l.transactionId)
            .filter(Boolean) as bigint[];

        const beneficiaryIds = ledgers
            .filter((l) => l.transactionType === MORPH_BENEFICIARY_TRANSACTION)
            .map((l) => l.transactionId)
            .filter(Boolean) as bigint[];

        const walletTxnIds = ledgers
            .filter((l) => l.transactionType === MORPH_WALLET_TRANSACTION)
            .map((l) => l.transactionId)
            .filter(Boolean) as bigint[];

        const [deposits, beneficiaries, walletTxns] = await Promise.all([
            depositIds.length > 0
                ? prisma().depositTransaction.findMany({ where: { id: { in: depositIds } } })
                : [],
            beneficiaryIds.length > 0
                ? prisma().beneficiaryTransaction.findMany({ where: { id: { in: beneficiaryIds } } })
                : [],
            walletTxnIds.length > 0
                ? prisma().walletTransaction.findMany({ where: { id: { in: walletTxnIds } } })
                : [],
        ]);

        const depositMap = new Map(deposits.map((d) => [String(d.id), d]));
        const beneficiaryMap = new Map(beneficiaries.map((b) => [String(b.id), b]));
        const walletTxnMap = new Map(walletTxns.map((w) => [String(w.id), w]));

        const isRejectedOrRefunded = (status: number, isRefundLedger: boolean) => {
            // 2 = Rejected, 3 = Refunded
            return status === 2 || status === 3 || isRefundLedger;
        };

        for (const l of ledgers) {
            const isRefunded = !!l.refundLedgerId;

            if (l.transactionType === MORPH_DEPOSIT_TRANSACTION) {
                const txn = depositMap.get(String(l.transactionId));
                if (txn) {
                    payins.push({ ledger: l, transaction: txn });
                    if (!isRejectedOrRefunded(txn.status, isRefunded)) {
                        totalPayin += Number(txn.totalAmount ?? 0);
                    }
                }
            } else if (l.transactionType === MORPH_BENEFICIARY_TRANSACTION) {
                const txn = beneficiaryMap.get(String(l.transactionId));
                if (txn) {
                    payouts.push({ ledger: l, transaction: txn });
                    if (!isRejectedOrRefunded(txn.status, isRefunded)) {
                        totalPayout += Number(txn.totalAmount ?? 0);
                    }
                }
            } else if (l.transactionType === MORPH_WALLET_TRANSACTION) {
                const txn = walletTxnMap.get(String(l.transactionId));
                if (txn) {
                    wallet_transactions.push({ ledger: l, transaction: txn });
                }
            }
        }

        // Opening balance should be the balance BEFORE the first transaction in this period
        const latestLedgerBeforePeriod = await prisma().ledger.findFirst({
            where: { 
                userId: userId, 
                virtualAccountId: virtualAccount.id,
                createdAt: { lt: new Date(`${from_date}T00:00:00Z`) }
            },
            orderBy: { createdAt: "desc" },
        });

        const openingBalance = latestLedgerBeforePeriod ? Number(latestLedgerBeforePeriod.balance) : 0;
        
        let closingBalance = openingBalance;
        if (ledgers.length > 0) {
            // Closing balance is after the last transaction of the selected dates
            closingBalance = Number(ledgers[ledgers.length - 1]?.balance ?? openingBalance);
        }

        const userRec = virtualAccount.user;
        const ownerMerchant = userRec?.merchants_merchants_user_idTousers?.[0];
        const assignedMerchant = userRec?.merchants_users_merchant_idTomerchants;
        const merchant = ownerMerchant || assignedMerchant;
        const isMerchant = !!merchant;
        const merchantName = merchant?.name || "N/A";
        
        let userName = "N/A";
        if (userRec) {
            if (Number(userRec.userType) === 2) {
                const info = userRec.information?.[0];
                userName = info?.legalName || info?.businessName || `${userRec.firstName || ''} ${userRec.lastName || ''}`.trim() || "N/A";
            } else {
                userName = `${userRec.firstName || ''} ${userRec.lastName || ''}`.trim() || "N/A";
            }
        }
        
        const accountHolderName = virtualAccount.accountHolderName || (isMerchant ? merchantName : userName);

        const walletSummary = {
            account_number: virtualAccount.accountNumber || virtualAccount.uniqueId,
            currency: virtualAccount.currency,
            opening_balance: openingBalance,
            amount_received: totalPayin,
            amount_paid: totalPayout,
            closing_balance: closingBalance,
        };

        const generatedAt = new Date();
        const timeZone = user?.timezone || userRec?.timezone || "Asia/Kolkata";
        const formattedDate = generatedAt.toLocaleDateString("en-US", { timeZone, year: "numeric", month: "short", day: "numeric" });
        const formattedTime = generatedAt.toLocaleTimeString("en-US", { timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

        return {
            metadata: {
                isMerchant,
                merchantName,
                userName,
                accountHolderName,
                fromDate: from_date,
                toDate: to_date,
                generatedAt: `${formattedDate} ${formattedTime}`,
            },
            walletSummary,
            payins,
            payouts,
            wallet_transactions,
        };
    },
};
