import { Transaction } from "sequelize";
import sequelize from "../config/database";
import BeneficiaryAccount from "../models/beneficiary_account.model";
import BeneficiaryAdditionalDetail from "../models/beneficiary_additional_detail.model";
import Sender from "../models/sender.model";
import User from "../models/user.model";
import { NormalizedBeneficiaryPayload } from "./beneficiary_normalizer.helper";
import { generateUniqueId } from "../utils/common.utils";

/**
 * Reuse-or-create for beneficiary accounts and senders (remitters) —
 * shared by the direct payout endpoint and the bulk payout worker.
 *
 * Bulk batches dispatch every row as its own queue job, so ten rows
 * carrying the same beneficiary can race each other through a naive
 * lookup-then-create and insert ten duplicates. A per-user MySQL named
 * lock (GET_LOCK) serializes the lookup+create window across worker
 * processes, guaranteeing existing records are detected and reused.
 */

/**
 * Nulls out placeholder junk ("", "undefined", "null", "n/a") before a
 * value lands in a DB column — mirror of the legacy cleanDbField.
 */
export const cleanDbField = (value: unknown): string | null => {
    if (value === null || value === undefined) {
        return null;
    }
    const stringValue = String(value).trim();
    const lower = stringValue.toLowerCase();
    if (
        lower === "" ||
        lower === "undefined" ||
        lower === "null" ||
        lower === "n/a" ||
        lower === "na"
    ) {
        return null;
    }
    return stringValue;
};

/**
 * Runs fn() while holding the per-user MySQL named lock. GET_LOCK is
 * connection-scoped, so both the acquire and the release are pinned to
 * a single pooled connection via a dedicated transaction handle —
 * without the pin, RELEASE_LOCK could land on a different connection
 * and the lock would silently stop excluding anyone.
 */
const withUserUpsertLock = async <T>(
    userId: number,
    fn: (lockTransaction: Transaction) => Promise<T>,
): Promise<T> => {
    const lockName = `eficyent_party_upsert_${userId}`;
    const lockTransaction = await sequelize.transaction();
    let acquired = false;
    try {
        const [lockRows] = await sequelize.query(
            "SELECT GET_LOCK(:name, 30) AS got",
            {
                replacements: { name: lockName },
                transaction: lockTransaction,
            },
        );
        acquired =
            Number(
                (lockRows as Array<{ got: unknown }>)[0]?.got ?? 0,
            ) === 1;
        if (!acquired) {
            throw new Error(
                `Could not acquire upsert lock for user ${userId}.`,
            );
        }
        // fn's queries MUST ride this same transaction: it keeps the
        // whole upsert on the one pooled connection (a lock holder
        // waiting on a second connection while N other jobs pin the
        // rest of the pool is a deadlock) and makes the account +
        // detail insert atomic.
        const result = await fn(lockTransaction);
        await sequelize
            .query("SELECT RELEASE_LOCK(:name)", {
                replacements: { name: lockName },
                transaction: lockTransaction,
            })
            .catch(() => undefined);
        await lockTransaction.commit();
        return result;
    } catch (upsertError) {
        if (acquired) {
            await sequelize
                .query("SELECT RELEASE_LOCK(:name)", {
                    replacements: { name: lockName },
                    transaction: lockTransaction,
                })
                .catch(() => undefined);
        }
        await lockTransaction.rollback().catch(() => undefined);
        throw upsertError;
    }
};

/**
 * Beneficiary reuse key: (user, account number, currency) plus email
 * when one was supplied. Returns the existing row when matched;
 * otherwise creates the account + additional-detail pair.
 */
export const findOrCreateBeneficiaryAccount = async (
    user: User,
    beneficiary: NormalizedBeneficiaryPayload,
): Promise<BeneficiaryAccount> => {
    const account = beneficiary.beneficiaryAccount;
    const beneficiaryEmail = cleanDbField(account.email);
    const accountNumber = cleanDbField(account.account_number);
    const currency = String(account.currency ?? "");

    return withUserUpsertLock(user.id, async (lockTransaction) => {
        const existingAccount = await BeneficiaryAccount.findOne({
            where: {
                userId: user.id,
                accountNumber,
                currency,
                ...(beneficiaryEmail ? { email: beneficiaryEmail } : {}),
            },
            transaction: lockTransaction,
        });
        if (existingAccount) {
            return existingAccount;
        }

        const beneficiaryAccount = await BeneficiaryAccount.create({
            uniqueId: generateUniqueId(24),
            userId: user.id,
            type: typeof account.type === "number" ? account.type : null,
            country: String(account.country ?? "US"),
            currency,
            firstName: cleanDbField(account.first_name),
            middleName: cleanDbField(account.middle_name),
            lastName: cleanDbField(account.last_name),
            email: beneficiaryEmail,
            mobileCountryCode: cleanDbField(account.mobile_country_code),
            mobile: cleanDbField(account.mobile),
            accountNumber,
            accountName: cleanDbField(account.account_name),
            bankName: cleanDbField(account.bank_name),
            paymentRail: cleanDbField(account.payment_rail),
            routingNumber: cleanDbField(account.routing_number),
            swiftCode: cleanDbField(account.swift_code),
            iban: cleanDbField(account.iban),
            businessName: cleanDbField(account.business_name),
            businessCountry: cleanDbField(account.business_country),
            status: 1,
        }, { transaction: lockTransaction });

        const additionalDetail = beneficiary.beneficiaryAccountAdditionalDetail;
        await BeneficiaryAdditionalDetail.create({
            uniqueId: generateUniqueId(24),
            beneficiaryAccountId: beneficiaryAccount.id,
            addressType:
                cleanDbField(additionalDetail.address_type) ?? "PRESENT",
            addressLine1: cleanDbField(additionalDetail.address_line1),
            addressLine2: cleanDbField(additionalDetail.address_line2),
            postalCode: cleanDbField(additionalDetail.postal_code),
            city: cleanDbField(additionalDetail.city),
            state: cleanDbField(additionalDetail.state),
            country: cleanDbField(additionalDetail.country),
            paymentType: cleanDbField(additionalDetail.payment_type),
            bankAddressLine1: cleanDbField(additionalDetail.bank_address_line1),
            bankAddressLine2: cleanDbField(additionalDetail.bank_address_line2),
            bankPostalCode: cleanDbField(additionalDetail.bank_postal_code),
            bankCity: cleanDbField(additionalDetail.bank_city),
            bankState: cleanDbField(additionalDetail.bank_state),
            bankCountry: cleanDbField(additionalDetail.bank_country),
            purposeOfTransaction: cleanDbField(
                additionalDetail.purpose_of_transaction,
            ),
            userSourceOfIncome: cleanDbField(
                additionalDetail.user_source_of_income,
            ),
        }, { transaction: lockTransaction });

        return beneficiaryAccount;
    });
};

/**
 * Sender reuse key: (user, id_number). Returns the existing row when
 * matched; otherwise creates the sender.
 */
export const findOrCreateSender = async (
    user: User,
    sender: Record<string, unknown>,
): Promise<Sender> => {
    const senderIdNumber = cleanDbField(sender.id_number);

    return withUserUpsertLock(user.id, async (lockTransaction) => {
        if (senderIdNumber) {
            const existingSender = await Sender.findOne({
                where: { userId: user.id, idNumber: senderIdNumber },
                transaction: lockTransaction,
            });
            if (existingSender) {
                return existingSender;
            }
        }

        let dateOfBirth: Date | null = null;
        if (sender.dob) {
            const parsedDob = new Date(sender.dob as string);
            if (!Number.isNaN(parsedDob.getTime())) {
                dateOfBirth = parsedDob;
            }
        }

        return Sender.create({
            uniqueId: generateUniqueId(24),
            userId: user.id,
            firstName: cleanDbField(sender.first_name),
            middleName: cleanDbField(sender.middle_name),
            lastName: cleanDbField(sender.last_name),
            email: cleanDbField(sender.email),
            mobileCountryCode: cleanDbField(sender.mobile_country_code),
            mobile: cleanDbField(sender.mobile),
            dob: dateOfBirth,
            country: cleanDbField(sender.country),
            nationality: cleanDbField(sender.nationality),
            address1: cleanDbField(sender.address_1 ?? sender.address),
            address2: cleanDbField(sender.address_2),
            city: cleanDbField(sender.city),
            state: cleanDbField(sender.state),
            postalCode: cleanDbField(sender.postal_code),
            type: typeof sender.type === "number" ? sender.type : null,
            idType: cleanDbField(sender.id_type),
            idNumber: senderIdNumber,
            sourceOfFunds: cleanDbField(sender.source_of_funds),
            businessPersons: sender.business_persons ?? null,
            status: 1,
        }, { transaction: lockTransaction });
    });
};
