import { Op } from "sequelize";
import { findValueByKey, formatProcessingUnitFxRate } from "./lookup.helper";
import BeneficiaryAccount from "../models/beneficiary_account.model";
import BeneficiaryAdditionalDetail from "../models/beneficiary_additional_detail.model";
import BeneficiaryTransaction from "../models/beneficiary_transaction.model";
import Merchant from "../models/merchant.model";
import MerchantSetting from "../models/merchant_setting.model";
import MobileCountryCode from "../models/mobile_country_code.model";
import Quote from "../models/quote.model";
import Sender from "../models/sender.model";
import SenderDocument from "../models/sender_document.model";
import User from "../models/user.model";
import UserDocument from "../models/user_document.model";
import UserInformation from "../models/user_information.model";
import UserService from "../models/user_service.model";
import VirtualAccount from "../models/virtual_account.model";
import Wallet from "../models/wallet.model";
import WalletTransaction from "../models/wallet_transaction.model";
import {
    EXTERNAL_TYPE_CALIZA,
    MERCHANT_TYPE_PAYOUT,
    USER_TYPE_INDIVIDUAL,
} from "../utils/constants";

/**
 * Processing Unit payout payload builder (mirror of the legacy
 * services/external/processingUnitPayload.ts, itself a mirror of
 * App\ExternalServices\ProcessingUnit\ProcessingUnit::preparePayload).
 *
 * Shared by ProcessingUnit.make (and, upstream, the Compliance client).
 * The wire format is what the Processing Unit API validates against, so
 * key names, empty-string retention and the INR mobile normalization
 * must stay byte-identical to the legacy builder.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Mirror of the legacy removeEmpty — strips null/undefined leaves (and
 * then-empty nested objects). Empty strings ("") are intentionally
 * KEPT so mandatory API fields still serialize. This differs from the
 * removeEmptyValues used on the deposit payload, which also drops "".
 */
const removeEmpty = <T extends Record<string, unknown>>(input: T): T => {
    for (const [key, value] of Object.entries(input)) {
        if (value === null || value === undefined) {
            delete input[key];
            continue;
        }
        if (typeof value === "object" && !Array.isArray(value)) {
            const cleaned = removeEmpty(value as Record<string, unknown>);
            if (Object.keys(cleaned).length === 0) {
                delete input[key];
            } else {
                (input as Record<string, unknown>)[key] = cleaned;
            }
        }
    }
    return input;
};

interface RelatedRows {
    account: BeneficiaryAccount;
    additional: BeneficiaryAdditionalDetail | null;
    sender: Sender | null;
    quote: Quote;
    userInformation: UserInformation | null;
    sourceCurrency: string;
    externalReferenceId: string | null;
    merchant: Merchant | null;
    ownerUser: User;
}

const parseBusinessPersons = (raw: unknown): any[] => {
    if (!raw) {
        return [];
    }
    try {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

const loadRelated = async (
    transaction: BeneficiaryTransaction,
    user: User,
): Promise<RelatedRows | null> => {
    // When the caller is a merchant sub-user, the payout identity is the
    // merchant owner's, not the acting user's.
    let effectiveUser = user;
    let merchant: Merchant | null = null;
    if (user.merchantId) {
        merchant = await Merchant.findByPk(user.merchantId);
        if (merchant) {
            const owner = await User.findByPk(merchant.userId);
            if (owner) {
                effectiveUser = owner;
            }
        }
    }

    const [account, additional, sender, quote, userInformation] =
        await Promise.all([
            transaction.beneficiaryAccountId
                ? BeneficiaryAccount.findByPk(transaction.beneficiaryAccountId)
                : Promise.resolve(null),
            transaction.beneficiaryAccountId
                ? BeneficiaryAdditionalDetail.findOne({
                      where: {
                          beneficiaryAccountId:
                              transaction.beneficiaryAccountId,
                      },
                  })
                : Promise.resolve(null),
            transaction.senderId
                ? Sender.findByPk(transaction.senderId)
                : Promise.resolve(null),
            transaction.quoteId
                ? Quote.findByPk(transaction.quoteId)
                : Promise.resolve(null),
            UserInformation.findOne({ where: { userId: effectiveUser.id } }),
        ]);

    if (!account || !quote) {
        return null;
    }

    // Source currency: wallet-sourced payouts read the wallet currency,
    // virtual-account-sourced payouts read the VA currency — both keyed
    // through the quote's polymorphic source.
    let sourceCurrency = "";
    const walletTransaction = await WalletTransaction.findOne({
        where: { beneficiaryTransactionId: transaction.id },
    });
    if (walletTransaction) {
        const quoteId = walletTransaction.quoteId;
        if (quoteId) {
            const sourceQuote =
                quoteId === quote.id
                    ? quote
                    : await Quote.findByPk(quoteId);
            if (sourceQuote && sourceQuote.sourceId) {
                const wallet = await Wallet.findByPk(sourceQuote.sourceId);
                sourceCurrency = wallet?.currency ?? "";
            }
        }
    } else {
        const quoteId = transaction.quoteId;
        if (quoteId) {
            const sourceQuote =
                quoteId === quote.id
                    ? quote
                    : await Quote.findByPk(quoteId);
            if (sourceQuote && sourceQuote.sourceId) {
                const virtualAccount = await VirtualAccount.findByPk(
                    sourceQuote.sourceId,
                );
                sourceCurrency = virtualAccount?.currency ?? "";
            }
        }
    }

    // Provider user reference: PAYOUT merchants prefer their
    // caliza_account_id setting (or the owner's VA reference); everyone
    // else falls back to their active Caliza user_service reference.
    let externalReferenceId: string | null = null;
    if (merchant && merchant.type === MERCHANT_TYPE_PAYOUT) {
        const setting = await MerchantSetting.findOne({
            where: { merchantId: merchant.id, key: "caliza_account_id" },
        });
        if (setting?.value) {
            externalReferenceId = setting.value;
        } else {
            const virtualAccount = await VirtualAccount.findOne({
                where: { userId: effectiveUser.id },
            });
            if (virtualAccount) {
                externalReferenceId = virtualAccount.externalReferenceId;
            }
        }
    }
    if (!externalReferenceId) {
        const userService = await UserService.findOne({
            where: {
                userId: effectiveUser.id,
                serviceType: EXTERNAL_TYPE_CALIZA,
                isActive: 1,
            },
            attributes: ["externalReferenceId"],
        });
        externalReferenceId = userService?.externalReferenceId ?? null;
    }

    return {
        account,
        additional,
        sender,
        quote,
        userInformation,
        sourceCurrency,
        externalReferenceId,
        merchant,
        ownerUser: effectiveUser,
    };
};

/**
 * Maps a stored business_persons array to the provider wire shape,
 * promoting the first person to UBO (designation_id 5) when none is
 * flagged — mirror of the shared Laravel logic.
 */
const mapBusinessPersons = async (persons: any[]): Promise<any[]> => {
    const hasUbo = persons.some(
        (person) => Number(person.designation_id) === 5,
    );
    if (!hasUbo && persons[0]) {
        persons[0].designation_id = 5;
    }
    return Promise.all(
        persons.map(async (person) => ({
            first_name: person.first_name ?? null,
            last_name: person.last_name ?? null,
            mobile_country_code: person.mobile_country_code ?? null,
            mobile: person.mobile ?? null,
            country: person.country ?? null,
            id_type: person.id_type
                ? (await findValueByKey(person.id_type, "id_types")) || "Other"
                : "Other",
            id_number: person.id_number || "0000",
            designation: person.designation_id
                ? await findValueByKey(person.designation_id, "professions")
                : null,
        })),
    );
};

/**
 * Remitter object when NO sender is present (the user is the remitter).
 * Individuals carry no document fields; businesses attach a user
 * document and business_persons.
 */
const remitterFromUser = async (
    user: User,
    userInformation: UserInformation | null,
    merchant?: Merchant | null,
): Promise<Record<string, unknown>> => {
    const sourceFunds = userInformation?.sourceOfIncome || "Other";

    if (merchant) {
        const userDocument = await UserDocument.findOne({
            where: { userId: user.id },
        });

        let businessPersonIdType =
            (await findValueByKey(userInformation?.idType, "id_types")) ||
            "Other";
        let businessPersonIdNumber = userInformation?.idNumber || "0000";

        const persons = parseBusinessPersons(userInformation?.businessPersons);
        if (persons.length > 0) {
            const ubo =
                persons.find(
                    (person) => Number(person.designation_id) === 5,
                ) || persons[0];
            if (ubo) {
                businessPersonIdType = ubo.id_type
                    ? (await findValueByKey(ubo.id_type, "id_types")) || "Other"
                    : "Other";
                businessPersonIdNumber = ubo.id_number || "0000";
            }
        }

        const remitter: Record<string, unknown> = {
            type: "BUSINESS",
            business_name: merchant.name,
            type_of_business:
                (await findValueByKey(
                    userInformation?.typeOfBusiness,
                    "business_types",
                )) || "Company",
            document_file: userDocument?.documentFile ?? null,
            document_type: userDocument?.documentType
                ? (await findValueByKey(
                      userDocument.documentType,
                      "document_types",
                  )) || "Other"
                : userDocument?.documentFile
                  ? "Other"
                  : null,
            email: merchant.email,
            mobile_country_code: user.mobileCountryCode,
            mobile: user.mobile,
            address_1: userInformation?.address1,
            address_2: userInformation?.address2,
            city: userInformation?.city,
            state: userInformation?.state,
            postal_code: userInformation?.postalCode,
            id_type: businessPersonIdType,
            id_number: businessPersonIdNumber,
            source_of_funds: sourceFunds,
            country: userInformation?.country,
        };

        if (persons.length > 0) {
            remitter.business_persons = await mapBusinessPersons(persons);
        }
        return remitter;
    }

    if (Number(user.userType) === USER_TYPE_INDIVIDUAL) {
        return {
            type: "INDIVIDUAL",
            first_name: user.firstName,
            last_name: user.lastName ?? user.firstName,
            country: userInformation?.country,
            email: user.email,
            mobile_country_code: user.mobileCountryCode,
            mobile: user.mobile,
            dob: user.dob,
            nationality: userInformation?.country,
            address_1: userInformation?.address1,
            address_2: userInformation?.address2,
            city: userInformation?.city,
            state: userInformation?.state,
            postal_code: userInformation?.postalCode,
            id_type:
                (await findValueByKey(userInformation?.idType, "id_types")) ||
                "Other",
            id_number: userInformation?.idNumber || "0000",
            source_of_funds: sourceFunds,
        };
    }

    const userDocument = await UserDocument.findOne({
        where: { userId: user.id },
    });

    let businessPersonIdType =
        (await findValueByKey(userInformation?.idType, "id_types")) || "Other";
    let businessPersonIdNumber = userInformation?.idNumber || "0000";

    const persons = parseBusinessPersons(userInformation?.businessPersons);
    if (persons.length > 0) {
        const ubo =
            persons.find((person) => Number(person.designation_id) === 5) ||
            persons[0];
        if (ubo) {
            businessPersonIdType = ubo.id_type
                ? (await findValueByKey(ubo.id_type, "id_types")) || "Other"
                : "Other";
            businessPersonIdNumber = ubo.id_number || "0000";
        }
    }

    const remitter: Record<string, unknown> = {
        type:
            Number(user.userType) === USER_TYPE_INDIVIDUAL
                ? "INDIVIDUAL"
                : "BUSINESS",
        business_name: userInformation?.businessName,
        type_of_business:
            (await findValueByKey(
                userInformation?.typeOfBusiness,
                "business_types",
            )) || "Company",
        document_file: userDocument?.documentFile ?? null,
        document_type: userDocument?.documentType
            ? (await findValueByKey(
                  userDocument.documentType,
                  "document_types",
              )) || "Other"
            : userDocument?.documentFile
              ? "Other"
              : null,
        email: user.email,
        mobile_country_code: user.mobileCountryCode,
        mobile: user.mobile,
        address_1: userInformation?.address1,
        address_2: userInformation?.address2,
        city: userInformation?.city,
        state: userInformation?.state,
        postal_code: userInformation?.postalCode,
        id_type: businessPersonIdType,
        id_number: businessPersonIdNumber,
        source_of_funds: sourceFunds,
        country: userInformation?.country,
    };

    if (persons.length > 0) {
        remitter.business_persons = await mapBusinessPersons(persons);
    }
    return remitter;
};

/**
 * Remitter object when a sender IS present. Individuals carry no
 * document fields; businesses attach a sender document and
 * business_persons.
 */
const remitterFromSender = async (
    sender: Sender,
    user: User,
    userInformation: UserInformation | null,
): Promise<Record<string, unknown>> => {
    const sourceFunds = sender.sourceOfFunds || "Other";

    if (Number(sender.type) === USER_TYPE_INDIVIDUAL) {
        return {
            type: "INDIVIDUAL",
            title: sender.title,
            first_name: sender.firstName,
            last_name: sender.lastName ?? sender.firstName,
            country: sender.country,
            email: sender.email ?? user.email,
            mobile_country_code:
                sender.mobileCountryCode ?? user.mobileCountryCode,
            mobile: sender.mobile ?? user.mobile,
            dob: sender.dob,
            nationality: sender.nationality ?? sender.country,
            address_1: sender.address1,
            address_2: sender.address2,
            city: sender.city ?? userInformation?.city,
            state: sender.state,
            postal_code: sender.postalCode,
            id_type:
                (await findValueByKey(sender.idType, "id_types")) || "Other",
            id_number: sender.idNumber || "0000",
            source_of_funds: sourceFunds,
        };
    }

    const senderDocument = await SenderDocument.findOne({
        where: { senderId: sender.id },
    });

    const remitter: Record<string, unknown> = {
        type: "BUSINESS",
        business_name: sender.firstName,
        type_of_business:
            (await findValueByKey(
                userInformation?.typeOfBusiness,
                "business_types",
            )) || "Company",
        document_file: senderDocument?.documentFile ?? null,
        document_type: senderDocument?.documentType
            ? (await findValueByKey(
                  senderDocument.documentType,
                  "document_types",
              )) || "Other"
            : senderDocument?.documentFile
              ? "Other"
              : null,
        email: sender.email,
        mobile_country_code: sender.mobileCountryCode,
        mobile: sender.mobile,
        address_1: sender.address1,
        address_2: sender.address2,
        city: sender.city,
        state: sender.state,
        postal_code: sender.postalCode,
        id_type: (await findValueByKey(sender.idType, "id_types")) || "Other",
        id_number: sender.idNumber || "0000",
        source_of_funds: sourceFunds,
        country: sender.country,
    };

    const persons = parseBusinessPersons(sender.businessPersons);
    if (persons.length > 0) {
        remitter.business_persons = await mapBusinessPersons(persons);
    }
    return remitter;
};

export const buildPayoutPayload = async (
    transaction: BeneficiaryTransaction,
    user: User,
): Promise<Record<string, unknown> | null> => {
    const related = await loadRelated(transaction, user);
    if (!related) {
        return null;
    }

    const {
        account,
        additional,
        sender,
        quote,
        userInformation,
        sourceCurrency,
        externalReferenceId,
        merchant,
        ownerUser,
    } = related;

    const common = {
        order_id: transaction.orderId,
        from_amount: transaction.amount,
        from_currency: sourceCurrency,
        amount: transaction.recipientAmount,
        exchange_rate: formatProcessingUnitFxRate(quote.fxRate),
        receiving_currency: transaction.receivingCurrency,
        side: quote.quoteType,
        remarks: transaction.remarks,
        supporting_document: transaction.supportingDocument,
        purpose_of_payment: additional?.purposeOfTransaction ?? null,
        rail: (account.paymentRail
            ? account.paymentRail
            : account.currency === "USD"
              ? "SWIFT"
              : ""
        ).toUpperCase(),
    };

    // INR payouts require a bare 10-digit mobile with country code 91.
    let beneficiaryMobileCountryCode =
        account.mobileCountryCode || ownerUser.mobileCountryCode;
    let beneficiaryMobile = account.mobile || ownerUser.mobile;
    if (account.currency === "INR") {
        beneficiaryMobileCountryCode = account.mobileCountryCode || "91";
        beneficiaryMobile = account.mobile || ownerUser.mobile;
        if (beneficiaryMobile) {
            beneficiaryMobile = beneficiaryMobile.replace(/\D/g, "");
            if (beneficiaryMobile.length > 10) {
                beneficiaryMobile = beneficiaryMobile.substring(0, 10);
            }
            if (beneficiaryMobile.length < 10) {
                beneficiaryMobile = beneficiaryMobile.padEnd(10, "0");
            }
        }
    }

    const beneficiary = {
        type:
            Number(account.type) === USER_TYPE_INDIVIDUAL
                ? "INDIVIDUAL"
                : "BUSINESS",
        first_name: account.firstName,
        last_name: account.lastName || account.firstName,
        business_name: account.businessName,
        address_1: additional?.addressLine1 || null,
        address_2: additional?.addressLine2 || null,
        city: additional?.city || userInformation?.city || null,
        state: additional?.state || null,
        postal_code: additional?.postalCode || null,
        country: account.country
            ? account.country
            : additional?.country || null,
        currency: account.currency,
        bank_name: account.bankName || account.swiftCode,
        account_name: account.accountName,
        account_number: account.accountNumber,
        iban: account.accountNumber,
        account_type: account.accountType || "Checking",
        routing_number: account.routingNumber,
        swift_code: account.swiftCode,
        ifsc_code: account.swiftCode,
        iso_code: account.swiftCode,
        email:
            account.email != null && account.email !== ""
                ? account.email
                : ownerUser.email,
        mobile_country_code: beneficiaryMobileCountryCode,
        mobile: beneficiaryMobile,
        id_number: account.idNumber ?? null,
        intermediary_bank_swift_code: account.intermediaryBankSwiftCode ?? null,
        intermediary_bank_name: account.intermediaryBankName ?? null,
        intermediary_bank_aba: account.intermediaryBankAba ?? null,
        intermediary_bank_address: account.intermediaryBankAddress ?? null,
        intermediary_bank_city: account.intermediaryBankCity ?? null,
        intermediary_bank_state: account.intermediaryBankState ?? null,
        intermediary_bank_postal_code:
            account.intermediaryBankPostalCode ?? null,
        intermediary_bank_country: account.intermediaryBankCountry ?? null,
    };

    const remitter = sender
        ? await remitterFromSender(sender, ownerUser, userInformation)
        : await remitterFromUser(ownerUser, userInformation, merchant);

    const merchantName = merchant
        ? merchant.name
        : (ownerUser.firstName ?? ownerUser.email);
    const merchantEmail = merchant ? merchant.email : ownerUser.email;

    let bankAddress: string | null = null;
    if (additional) {
        const street1 = (additional.bankAddressLine1 || "").replace(/,/g, "");
        const street2 = (additional.bankAddressLine2 || "").replace(/,/g, "");
        const city = (additional.bankCity || "").replace(/,/g, "");
        const state = (additional.bankState || "").replace(/,/g, "");

        let country = additional.bankCountry || "";
        if (country) {
            const mobileCountryCode = await MobileCountryCode.findOne({
                where: {
                    [Op.or]: [{ alpha3Code: country }, { alpha2Code: country }],
                },
                attributes: ["alpha2Code"],
            });
            country = mobileCountryCode?.alpha2Code || country;
        }
        country = country.replace(/,/g, "").toUpperCase();

        const postalCode = (additional.bankPostalCode || "0000").replace(
            /,/g,
            "",
        );

        bankAddress = [
            street1,
            street2,
            city,
            state,
            country,
            postalCode,
        ].join(",");
    }

    const payload = {
        ...common,
        beneficiary,
        remitter,
        merchant: {
            name: merchantName,
            email: merchantEmail,
        },
    };

    const finalPayload = {
        ...removeEmpty(payload as Record<string, unknown>),
        meta_data: {
            bank_address: bankAddress ?? null,
            user_reference_id: externalReferenceId ?? null,
            beneficiary_reference_id: account.externalReferenceId ?? null,
            search_reference_id:
                transaction.clientReferenceId ?? transaction.txnRefNo ?? null,
            txn_ref_no: transaction.txnRefNo ?? null,
            txn_unique_id: transaction.uniqueId ?? null,
        },
    };

    return finalPayload;
};
