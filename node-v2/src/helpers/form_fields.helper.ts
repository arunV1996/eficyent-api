import MerchantSetting from "../models/merchant_setting.model";
import SupportedCountry from "../models/supported_country.model";
import { Op } from "sequelize";
import {
    businessTypes,
    businessVerificationTypes,
    countries as buildCountries,
    findValueByKey,
    getLookups,
    mobileCountryCodes as buildMobileCountryCodes,
    serviceBanks,
    states as buildStates,
} from "./lookup.helper";
import {
    EXTERNAL_TYPE_DIGININE,
    EXTERNAL_TYPE_IME,
    EXTERNAL_TYPE_MOBI,
    EXTERNAL_TYPE_USI,
    LOOKUP_TYPE_ADDRESS_TYPES,
    LOOKUP_TYPE_COUNTRY_CONFIGURATIONS,
    LOOKUP_TYPE_DOCUMENT_TYPES,
    LOOKUP_TYPE_EEC_PAYMENT_PURPOSE,
    LOOKUP_TYPE_ID_TYPE,
    LOOKUP_TYPE_PROFESSIONS,
    LOOKUP_TYPE_PROOF_OF_ADDRESS,
    LOOKUP_TYPE_PURPOSES_OF_TRANSACTIONS,
    LOOKUP_TYPE_SOURCES_OF_INCOMES,
    LOOKUP_TYPE_SOURCE_OF_FUNDS,
    ONBOARDING_STEP_THREE,
    ONBOARDING_STEP_TWO,
    PASSWORD_REGEX,
    USER_TYPE_BUSINESS,
    USER_TYPE_PERSONAL,
} from "../utils/constants";

/**
 * Raised when a form-field builder rejects the requested corridor.
 * Controllers map this to the legacy {success:false, error, error_code}
 * envelope.
 */
export class FormFieldsError extends Error {
    public readonly errorCode: number;
    public readonly httpStatus: number;

    constructor(message: string, errorCode = 422, httpStatus = 422) {
        super(message);
        this.name = "FormFieldsError";
        this.errorCode = errorCode;
        this.httpStatus = httpStatus;
    }
}

/**
 * Onboarding slice of the legacy FieldsHelper / helpers/formFields.ts.
 *
 * Each field is shaped exactly like the Laravel `make()` output so the
 * frontend renderer is unchanged. Beneficiary / quote / sender field
 * builders arrive with their own module tranches.
 */

export interface FieldDef {
    field_key: string;
    field_label: string;
    field_type: "string" | "number" | "email" | "date" | "file" | "group";
    is_mandatory: boolean;
    is_editable: boolean;
    validation: Record<string, unknown>;
    category: string;
    values_supported: {
        label: string;
        value: string;
        flag?: string;
        country_name?: string;
        parent_value?: string;
    }[];
    children: FieldDef[];
    is_repeatable: boolean;
    field_value: string | number | null;
    parent_key: string;
    required_if_empty_of: string;
    required_if: string;
}

interface MakeOptions {
    type?: FieldDef["field_type"];
    mandatory?: boolean;
    editable?: boolean;
    validation?: Record<string, unknown>;
    category?: string;
    values?: FieldDef["values_supported"];
    children?: FieldDef[];
    repeatable?: boolean;
    parent_key?: string;
    required_if_empty_of?: string;
    required_if?: string;
}

export const make = (
    key: string,
    label: string,
    options: MakeOptions = {},
): FieldDef => {
    return {
        field_key: key,
        field_label: label,
        field_type: options.type ?? "string",
        is_mandatory: options.mandatory ?? true,
        is_editable: options.editable ?? true,
        validation: options.validation ?? {},
        category: options.category ?? "",
        values_supported: options.values ?? [],
        children: options.children ?? [],
        is_repeatable: options.repeatable ?? false,
        field_value: "",
        parent_key: options.parent_key ?? "",
        required_if_empty_of: options.required_if_empty_of ?? "",
        required_if: options.required_if ?? "",
    };
};

export const VALIDATION_PRESETS = {
    name: {
        min_length: 1,
        max_length: 100,
        regex: "/^(?=.{1,100}$)[A-Za-z]+(?:[ '-]+[A-Za-z]+)*$/",
    },
    business_name: {
        min_length: 2,
        max_length: 100,
        regex: "/^[A-Za-z0-9 .,&()-]{1,100}$/",
    },
    account_name: {
        min_length: 2,
        max_length: 100,
        regex: "/^[A-Za-z .,&()-]{1,100}$/",
    },
    swift: {
        min_length: 8,
        max_length: 11,
        regex: "/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/",
    },
    routing: { min_length: 9, max_length: 9, regex: "/^[0-9]{9}$/" },
    iban: {
        min_length: 15,
        max_length: 34,
        regex: "/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/",
    },
    ifsc: {
        min_length: 11,
        max_length: 11,
        regex: "/^[A-Z]{4}0[A-Z0-9]{6}$/",
    },
    aba: { min_length: 9, max_length: 9, regex: "/^[0-9]{9}$/" },
    generic_account: {
        min_length: 4,
        max_length: 34,
        regex: "/^[A-Za-z0-9]{4,34}$/",
    },
    lka_bank: {
        min_length: 4,
        max_length: 11,
        regex: "/^(?:\\d{4}|[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?)$/",
    },
    email: {
        min_length: 2,
        max_length: 100,
        regex: "/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9-]+(\\.[a-zA-Z0-9-]+)*\\.[A-Za-z]{2,}$/",
    },
    text: { min_length: 2, max_length: 100 },
    website: {
        min_length: 2,
        max_length: 100,
        regex: "/^https:\\/\\/[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}.*$/",
    },
    mobile: { min_length: 6, max_length: 50, regex: "/^\\d{6,15}$/" },
    id_number: {
        min_length: 6,
        max_length: 20,
        regex: "/^[A-Za-z0-9-]{6,20}$/",
    },
    postal_code: {
        min_length: 4,
        max_length: 10,
        regex: "/^(?=.*\\d)[A-Za-z0-9][A-Za-z0-9\\s-]{3,9}$/",
    },
    address: {
        min_length: 2,
        max_length: 85,
        regex: "/^[A-Za-z0-9\\s,.\\-\\/()#&]{2,85}$/",
    },
    city: {
        min_length: 2,
        max_length: 50,
        regex: "/^[A-Za-z]+(?:[ '-][A-Za-z]+)*$/",
    },
    password: {
        min_length: 8,
        max_length: 20,
        regex: PASSWORD_REGEX.toString().slice(1, -1),
    },
} as const;

const FILE_VALIDATION = {
    accepted_extensions: [
        "image/jpeg",
        "image/png",
        "image/jpg",
        "application/pdf",
    ],
    max_file_size: 5 * 1024 * 1024,
} as const;

interface FormBuildContext {
    countries: { label: string; value: string; flag: string }[];
    states: { label: string; value: string; parent_value: string }[];
    mobile_country_codes: {
        label: string;
        value: string;
        country_name: string;
        flag: string;
    }[];
    professions: { label: string; value: string }[];
    business_types: { label: string; value: string }[];
    id_types: { label: string; value: string }[];
    business_verification_types: { label: string; value: string }[];
    address_types: { label: string; value: string }[];
    proof_of_address: { label: string; value: string }[];
    source_of_funds: { label: string; value: string }[];
    purposes_of_transactions: { label: string; value: string }[];
    sources_of_income: { label: string; value: string }[];
    eec_payment_purposes: { label: string; value: string }[];
    document_types: { label: string; value: string }[];
}

const buildContext = async (): Promise<FormBuildContext> => {
    const [
        countries,
        mobileCountryCodes,
        states,
        professions,
        businessTypeRows,
        idTypes,
        businessVerificationTypeRows,
        addressTypes,
        proofOfAddress,
        sourceOfFunds,
        purposesOfTransactions,
        sourcesOfIncome,
        eecPaymentPurposes,
        documentTypes,
    ] = await Promise.all([
        buildCountries(),
        buildMobileCountryCodes(),
        buildStates(),
        getLookups(LOOKUP_TYPE_PROFESSIONS),
        businessTypes(),
        getLookups(LOOKUP_TYPE_ID_TYPE),
        businessVerificationTypes(),
        getLookups(LOOKUP_TYPE_ADDRESS_TYPES),
        getLookups(LOOKUP_TYPE_PROOF_OF_ADDRESS),
        getLookups(LOOKUP_TYPE_SOURCE_OF_FUNDS),
        getLookups(LOOKUP_TYPE_PURPOSES_OF_TRANSACTIONS),
        getLookups(LOOKUP_TYPE_SOURCES_OF_INCOMES),
        getLookups(LOOKUP_TYPE_EEC_PAYMENT_PURPOSE),
        getLookups(LOOKUP_TYPE_DOCUMENT_TYPES),
    ]);

    return {
        countries,
        states,
        mobile_country_codes: mobileCountryCodes,
        professions,
        business_types: businessTypeRows,
        id_types: idTypes,
        business_verification_types: businessVerificationTypeRows,
        address_types: addressTypes,
        proof_of_address: proofOfAddress,
        source_of_funds: sourceOfFunds,
        purposes_of_transactions: purposesOfTransactions,
        sources_of_income: sourcesOfIncome,
        eec_payment_purposes: eecPaymentPurposes,
        document_types: documentTypes,
    };
};

const addressFields = (
    prefix: string,
    context: FormBuildContext,
): FieldDef[] => {
    const category =
        prefix === "receiver"
            ? "Address"
            : `${prefix.charAt(0).toUpperCase()}${prefix
                  .slice(1)
                  .replace(/_/g, " ")} Address`;
    return [
        make(`${prefix}_address_line_1`, `${category} Line 1`, {
            validation: VALIDATION_PRESETS.address,
            category,
        }),
        make(`${prefix}_address_line_2`, `${category} Line 2`, {
            mandatory: false,
            validation: VALIDATION_PRESETS.address,
            category,
        }),
        make(`${prefix}_country`, `${category} Country`, {
            category,
            values: context.countries,
        }),
        make(`${prefix}_state`, `${category} State`, {
            category,
            values: context.states,
            parent_key: `${prefix}_country`,
        }),
        make(`${prefix}_postal_code`, `${category} Postal Code`, {
            validation: VALIDATION_PRESETS.postal_code,
            category,
        }),
        make(`${prefix}_city`, `${category} City`, {
            validation: VALIDATION_PRESETS.city,
            category,
        }),
    ];
};

const baseIndividualFields = (context: FormBuildContext): FieldDef[] => {
    return [
        make("first_name", "First Name", {
            validation: VALIDATION_PRESETS.name,
        }),
        make("middle_name", "Middle Name", {
            mandatory: false,
            validation: VALIDATION_PRESETS.name,
        }),
        make("last_name", "Last Name", { validation: VALIDATION_PRESETS.name }),
        make("email", "Email", { validation: VALIDATION_PRESETS.email }),
        make("mobile_country_code", "Mobile Country Code", {
            values: context.mobile_country_codes,
        }),
        make("mobile", "Mobile", { validation: VALIDATION_PRESETS.mobile }),
        ...addressFields("receiver", context),
    ];
};

const baseBusinessFields = (context: FormBuildContext): FieldDef[] => {
    return [
        make("business_name", "Business Name", {
            validation: VALIDATION_PRESETS.business_name,
        }),
        make("business_country", "Business Country", {
            values: context.countries,
        }),
        make("email", "Email", { validation: VALIDATION_PRESETS.email }),
        make("mobile_country_code", "Mobile Country Code", {
            values: context.mobile_country_codes,
        }),
        make("mobile", "Mobile", { validation: VALIDATION_PRESETS.mobile }),
        ...addressFields("receiver", context),
    ];
};

const eighteenYearsAgo = (): string => {
    return new Date(
        Date.now() - 18 * 365 * 24 * 60 * 60 * 1000 - 24 * 60 * 60 * 1000,
    )
        .toISOString()
        .split("T")[0];
};

const registrationFormFields = (context: FormBuildContext): FieldDef[] => {
    return [
        make("user_type", "User Type", {
            values: [
                { label: "Individual", value: "Individual" },
                { label: "Business", value: "Business" },
            ],
        }),
        make("email", "Email", { validation: VALIDATION_PRESETS.email }),
        make("password", "Password", {
            validation: VALIDATION_PRESETS.password,
        }),
        make("mobile_country_code", "Mobile Country Code", {
            values: context.mobile_country_codes,
        }),
        make("mobile", "Mobile", { validation: VALIDATION_PRESETS.mobile }),
        make("device_type", "Device Type", {
            mandatory: false,
            values: [
                { label: "Android", value: "Android" },
                { label: "IOS", value: "IOS" },
                { label: "Web", value: "Web" },
            ],
        }),
    ];
};

const individualOnboardingFields = (context: FormBuildContext): FieldDef[] => {
    return [
        make("title", "Title", {
            values: [
                { label: "Mr", value: "Mr" },
                { label: "Mrs", value: "Mrs" },
                { label: "Miss", value: "Miss" },
            ],
        }),
        make("first_name", "First Name", {
            validation: VALIDATION_PRESETS.name,
        }),
        make("middle_name", "Middle Name", {
            mandatory: false,
            validation: VALIDATION_PRESETS.name,
        }),
        make("last_name", "Last Name", { validation: VALIDATION_PRESETS.name }),
        make("dob", "Date of Birth", {
            type: "date",
            validation: { max_date: eighteenYearsAgo() },
        }),
        make("gender", "Gender", {
            values: [
                { label: "Male", value: "M" },
                { label: "Female", value: "F" },
                { label: "Others", value: "O" },
            ],
        }),
        make("address_1", "Address Line 1", {
            validation: VALIDATION_PRESETS.address,
        }),
        make("address_2", "Address Line 2", {
            validation: VALIDATION_PRESETS.address,
        }),
        make("country", "Country", { values: context.countries }),
        make("state", "State / Province", {
            values: context.states,
            parent_key: "country",
        }),
        make("city", "City", { validation: VALIDATION_PRESETS.city }),
        make("postal_code", "Postal Code", {
            validation: VALIDATION_PRESETS.postal_code,
        }),
        make("purpose_of_transactions", "Purpose of Transactions", {
            values: context.purposes_of_transactions,
        }),
        make("id_type", "ID Type", { values: context.id_types }),
        make("id_number", "ID Number", {
            validation: VALIDATION_PRESETS.id_number,
        }),
        make("profession", "Profession", { values: context.professions }),
        make("source_of_income", "Source of Income", {
            values: context.sources_of_income,
        }),
    ];
};

const businessOnboardingFields = (context: FormBuildContext): FieldDef[] => {
    return [
        make("legal_name", "Legal Name", {
            validation: VALIDATION_PRESETS.business_name,
        }),
        make("tax_id", "Tax ID Number", {
            validation: VALIDATION_PRESETS.id_number,
        }),
        make("country_of_incorporation", "Country  of Incorporation", {
            values: context.countries,
        }),
        make("formation_date", "Formation Date", {
            type: "date",
            validation: { max_date: new Date().toISOString().split("T")[0] },
        }),
        make("business_name", "Business Name", {
            validation: VALIDATION_PRESETS.business_name,
        }),
        make("type_of_business", "Type of Business", {
            values: context.business_types,
        }),
        make("website", "Website", { validation: VALIDATION_PRESETS.website }),
        make("address_1", "Address Line 1", {
            validation: VALIDATION_PRESETS.address,
        }),
        make("address_2", "Address Line 2", {
            validation: VALIDATION_PRESETS.address,
        }),
        make("country", "Country", { values: context.countries }),
        make("state", "State / Province", {
            values: context.states,
            parent_key: "country",
        }),
        make("city", "City", { validation: VALIDATION_PRESETS.city }),
        make("postal_code", "Postal Code", {
            validation: VALIDATION_PRESETS.postal_code,
        }),
        make("business_verification_type", "Business Verification Type", {
            values: context.business_verification_types,
        }),
        make("owners", "Business Owners", {
            type: "group",
            repeatable: true,
            validation: { min_length: 1, max_length: 3 },
            children: [
                make("first_name", "First Name", {
                    validation: VALIDATION_PRESETS.name,
                }),
                make("last_name", "Last Name", {
                    validation: VALIDATION_PRESETS.name,
                }),
                make("dob", "Date of Birth", {
                    type: "date",
                    validation: { max_date: eighteenYearsAgo() },
                }),
                make("id_type", "ID Type", { values: context.id_types }),
                make("id_number", "ID Number", {
                    validation: VALIDATION_PRESETS.id_number,
                }),
                make("email", "Email", {
                    validation: VALIDATION_PRESETS.email,
                }),
                make("mobile_country_code", "Mobile Country Code", {
                    values: context.mobile_country_codes,
                }),
                make("mobile", "Mobile", {
                    validation: VALIDATION_PRESETS.mobile,
                }),
                make("profession", "Profession", {
                    values: context.professions,
                }),
                make("address_1", "Address Line 1", {
                    validation: VALIDATION_PRESETS.address,
                }),
                make("address_2", "Address Line 2", {
                    mandatory: false,
                    validation: VALIDATION_PRESETS.address,
                }),
                make("country", "Country", { values: context.countries }),
                make("state", "State", {
                    values: context.states,
                    parent_key: "country",
                }),
                make("city", "City", { validation: VALIDATION_PRESETS.city }),
                make("postal_code", "Postal Code", {
                    validation: VALIDATION_PRESETS.postal_code,
                }),
            ],
        }),
    ];
};

const documentGroup = (
    key: string,
    label: string,
    countries: FormBuildContext["countries"] = [],
    types: { label: string; value: string }[] = [],
): FieldDef => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);

    return make(key, label, {
        type: "group",
        repeatable: false,
        category: label,
        children: [
            ...(types.length > 0
                ? [make("document_type", "Document Type", { values: types })]
                : []),
            ...(countries.length > 0
                ? [
                      make("document_country", "Document Issuing Country", {
                          values: countries,
                      }),
                  ]
                : []),
            make("document_file", "Document Front File", {
                type: "file",
                validation: { ...FILE_VALIDATION },
            }),
            make("document_back_file", "Document Back File", {
                type: "file",
                mandatory: false,
                validation: { ...FILE_VALIDATION },
            }),
            make("document_expiry_date", "Document Expiry Date", {
                type: "date",
                mandatory: false,
                validation: { min_date: tomorrow },
            }),
        ],
    });
};

const getDocumentGroups = (
    userType: number,
    context: FormBuildContext,
): FieldDef[] => {
    const commonGroups = [
        documentGroup(
            "proof_of_address",
            "Proof of Address",
            context.countries,
            context.proof_of_address,
        ),
        documentGroup(
            "source_of_funds",
            "Source of Funds",
            [],
            context.source_of_funds,
        ),
    ];

    if (Number(userType) === USER_TYPE_PERSONAL) {
        return [
            ...commonGroups,
            documentGroup(
                "id_document",
                "Identity Document",
                context.countries,
                context.id_types,
            ),
        ];
    }
    if (Number(userType) === USER_TYPE_BUSINESS) {
        return [
            ...commonGroups,
            documentGroup(
                "proof_of_ownership",
                "Proof of Ownership",
                context.countries,
            ),
        ];
    }
    return [];
};

/**
 * Mirror of FieldsHelper::onboardingFormFields. Returns the field
 * definitions for a given (user_type, step) combination.
 */
export const onboardingFormFields = async (
    userType: number,
    step: number,
): Promise<FieldDef[]> => {
    const context = await buildContext();
    switch (step) {
        case 1:
            return Number(userType) === USER_TYPE_PERSONAL ||
                Number(userType) === USER_TYPE_BUSINESS
                ? registrationFormFields(context)
                : [];
        case 2:
            if (Number(userType) === USER_TYPE_PERSONAL) {
                return individualOnboardingFields(context);
            }
            if (Number(userType) === USER_TYPE_BUSINESS) {
                return businessOnboardingFields(context);
            }
            return [];
        case 3:
            return getDocumentGroups(userType, context);
        default:
            return [];
    }
};

interface CountryConfiguration {
    taxIdLabel?: string;
    taxIdFormat?: string;
    vatRequired?: boolean;
    vatLabel?: string;
    vatFormat?: string;
    registrationNumberLabel?: string;
    hasStates?: boolean;
    stateLabel?: string;
    states?: FieldDef["values_supported"];
    additionalFields?: Array<{
        fieldName: string;
        label: string;
        type?: FieldDef["field_type"];
        required?: boolean;
        format?: string;
        options?: FieldDef["values_supported"];
    }>;
    requiredDocuments?: string[];
    countryCode?: FormBuildContext["countries"];
}

/**
 * Mirror of FieldsHelper::onboardingFormFields_new. Layers
 * country-of-incorporation configuration overrides (from the
 * country_configurations lookup) on top of the base field list; falls
 * back to the base list when no configuration applies.
 */
export const onboardingFormFieldsNew = async (
    userType: number,
    payload: Record<string, unknown>,
    countryCode?: string,
): Promise<FieldDef[]> => {
    if (countryCode) {
        const configurationString = await findValueByKey(
            countryCode,
            LOOKUP_TYPE_COUNTRY_CONFIGURATIONS,
        );
        if (configurationString && configurationString !== countryCode) {
            try {
                const configuration = JSON.parse(
                    configurationString,
                ) as CountryConfiguration;
                if (
                    typeof configuration === "object" &&
                    configuration !== null
                ) {
                    if (
                        Number(payload.type) === ONBOARDING_STEP_TWO &&
                        Number(userType) === USER_TYPE_BUSINESS
                    ) {
                        const fields: FieldDef[] = [];
                        if (configuration.taxIdLabel) {
                            fields.push(
                                make("tax_id", configuration.taxIdLabel, {
                                    validation: configuration.taxIdFormat
                                        ? { regex: configuration.taxIdFormat }
                                        : {},
                                }),
                            );
                        }
                        if (configuration.vatRequired) {
                            fields.push(
                                make(
                                    "vat_number",
                                    configuration.vatLabel ?? "VAT Number",
                                    {
                                        validation: configuration.vatFormat
                                            ? { regex: configuration.vatFormat }
                                            : {},
                                    },
                                ),
                            );
                        }
                        if (configuration.registrationNumberLabel) {
                            fields.push(
                                make(
                                    "registration_number",
                                    configuration.registrationNumberLabel,
                                ),
                            );
                        }
                        if (configuration.hasStates) {
                            fields.push(
                                make(
                                    "state",
                                    configuration.stateLabel ?? "State",
                                    {
                                        values: configuration.states ?? [],
                                        parent_key: "country",
                                        mandatory: false,
                                    },
                                ),
                            );
                        }
                        for (const additionalField of configuration.additionalFields ??
                            []) {
                            fields.push(
                                make(
                                    additionalField.fieldName,
                                    additionalField.label,
                                    {
                                        type: additionalField.type,
                                        mandatory: additionalField.required,
                                        validation: additionalField.format
                                            ? { regex: additionalField.format }
                                            : {},
                                        values: additionalField.options ?? [],
                                    },
                                ),
                            );
                        }
                        return fields;
                    }
                    if (
                        Number(payload.type) === ONBOARDING_STEP_THREE &&
                        Number(userType) === USER_TYPE_BUSINESS
                    ) {
                        const fields: FieldDef[] = [];
                        if (Array.isArray(configuration.requiredDocuments)) {
                            for (const documentCode of configuration.requiredDocuments) {
                                const label = String(documentCode)
                                    .replace(/_/g, " ")
                                    .replace(/\b\w/g, (letter) =>
                                        letter.toUpperCase(),
                                    );
                                fields.push(
                                    documentGroup(
                                        `document_${String(documentCode).toLowerCase()}`,
                                        label,
                                        configuration.countryCode ?? [],
                                        [],
                                    ),
                                );
                            }
                        }
                        return fields;
                    }
                }
            } catch {
                // Malformed configuration JSON — fall through to base fields.
            }
        }
    }
    return onboardingFormFields(userType, Number(payload.type));
};

/**
 * Country/currency-specific bank fields for the beneficiary form.
 * Mirror of the legacy bankFieldsByCountry.
 */
const bankFieldsByCountry = (
    country: string,
    currency: string,
    context: FormBuildContext,
): FieldDef[] => {
    const accountTypeField = make("account_type", "Account Type", {
        values: [
            { label: "Checking", value: "Checking" },
            { label: "Savings", value: "Savings" },
            { label: "General Ledger", value: "General Ledger" },
            { label: "Loan", value: "Loan" },
        ],
    });

    const isForeignCurrency = currency === "USD" && country !== "USA";

    const genericAccountNumberField = make("account_number", "Account Number", {
        validation: VALIDATION_PRESETS.generic_account,
    });
    const swiftCodeField = make("code", "SWIFT/BIC", {
        validation: VALIDATION_PRESETS.swift,
    });

    switch (country.toUpperCase()) {
        case "CHN":
        case "THA":
        case "IDN":
        case "MYS":
            return isForeignCurrency
                ? [accountTypeField, genericAccountNumberField, swiftCodeField]
                : [accountTypeField, genericAccountNumberField];
        case "SAU":
            return isForeignCurrency
                ? [accountTypeField, genericAccountNumberField, swiftCodeField]
                : [
                      accountTypeField,
                      genericAccountNumberField,
                      make("iban", "IBAN", {
                          validation: VALIDATION_PRESETS.generic_account,
                      }),
                  ];
        case "HKG":
            return [
                accountTypeField,
                make("account_number", "Account Number", {
                    validation: { regex: "^[A-Za-z0-9]{4,34}$" },
                }),
                make("code", isForeignCurrency ? "SWIFT/BIC" : "Branch Code", {
                    validation: isForeignCurrency
                        ? VALIDATION_PRESETS.swift
                        : { regex: "^\\d{3}$" },
                }),
            ];
        case "IND":
            return [
                accountTypeField,
                make("account_number", "Account Number", {
                    validation: { regex: "^[0-9]{9,18}$" },
                }),
                make("code", isForeignCurrency ? "SWIFT/BIC" : "IFSC Code", {
                    validation: isForeignCurrency
                        ? VALIDATION_PRESETS.swift
                        : VALIDATION_PRESETS.ifsc,
                }),
            ];
        case "ARE":
            return [
                accountTypeField,
                make("account_number", "IBAN", {
                    validation: VALIDATION_PRESETS.iban,
                }),
                swiftCodeField,
            ];
        case "LKA":
            return [
                accountTypeField,
                make("account_number", "Account Number", {
                    validation: { regex: "^\\d{6,15}$" },
                }),
                make("code", isForeignCurrency ? "SWIFT/BIC" : "Bank Code", {
                    validation: isForeignCurrency
                        ? VALIDATION_PRESETS.swift
                        : VALIDATION_PRESETS.lka_bank,
                }),
            ];
        case "NPL":
            return [
                accountTypeField,
                make("account_number", "Account Number", {
                    validation: { regex: "^[0-9]{10,18}$" },
                }),
                make("code", "SWIFT/BIC", {
                    mandatory: false,
                    validation: VALIDATION_PRESETS.swift,
                }),
            ];
        case "PAK":
            return [
                accountTypeField,
                make("account_number", "IBAN", {
                    validation: {
                        regex: "^[A-Z]{2}[0-9]{2}[A-Z]{4}[A-Z0-9]{16}$",
                    },
                }),
                make("code", "Code", {
                    mandatory: false,
                    validation: VALIDATION_PRESETS.swift,
                }),
            ];
        case "BGD":
            return [
                accountTypeField,
                make("account_number", "Account Number", {
                    validation: { regex: "^[0-9]{10,17}$" },
                }),
                make(
                    "code",
                    isForeignCurrency ? "SWIFT/BIC" : "Routing Number",
                    {
                        validation: isForeignCurrency
                            ? VALIDATION_PRESETS.swift
                            : { regex: "^[0-9]{9}$" },
                    },
                ),
            ];
        case "PHL":
            return [
                accountTypeField,
                make("account_number", "Account Number", {
                    validation: { regex: "^\\d{6,18}$" },
                }),
                make("code", isForeignCurrency ? "SWIFT/BIC" : "BRSTN", {
                    validation: isForeignCurrency
                        ? VALIDATION_PRESETS.swift
                        : { regex: "^[a-zA-Z0-9]{8,12}$" },
                }),
            ];
        case "USA":
            return [
                accountTypeField,
                make("account_number", "Account Number", {
                    mandatory: true,
                    validation: { regex: "/^[A-Za-z0-9]{4,34}$/" },
                }),
                make("iban", "IBAN", {
                    mandatory: false,
                    validation: VALIDATION_PRESETS.iban,
                }),
                make("code", "SWIFT/BIC", {
                    mandatory: false,
                    validation: VALIDATION_PRESETS.swift,
                }),
                make("routing_number", "Routing Number", {
                    mandatory: false,
                    validation: VALIDATION_PRESETS.routing,
                    required_if_empty_of: "code",
                }),
                ...addressFields("bank", context),
            ];
        default:
            return [
                accountTypeField,
                make("account_number", "Account Number / IBAN", {
                    validation: { regex: "/^[A-Za-z0-9]{4,34}$/" },
                }),
                make("code", "SWIFT/BIC/Routing Number", {
                    validation: VALIDATION_PRESETS.swift,
                }),
                ...addressFields("bank", context),
            ];
    }
};

/**
 * Mirror of FieldsHelper::beneficiary_form_fields. Returns the dynamic
 * payout-target form for (country, currency, type), with merchant
 * payout_countries scoping and per-merchant optional-field overrides.
 * Throws FormFieldsError for unsupported corridors.
 */
export const beneficiaryFormFields = async (payload: {
    country: string;
    currency: string;
    type: number;
    merchantId?: number | null;
}): Promise<FieldDef[]> => {
    if (payload.merchantId) {
        const payoutCountriesSetting = await MerchantSetting.findOne({
            where: { merchantId: payload.merchantId, key: "payout_countries" },
        });
        if (payoutCountriesSetting?.value) {
            let supportedIds: string[] = [];
            try {
                supportedIds = JSON.parse(
                    payoutCountriesSetting.value,
                ) as string[];
            } catch {
                supportedIds = [];
            }

            if (supportedIds.length > 0) {
                const merchantCountryMatch = await SupportedCountry.findOne({
                    where: {
                        id: { [Op.in]: supportedIds.map((id) => Number(id)) },
                        countryCode: payload.country,
                        status: 1,
                    },
                });
                if (!merchantCountryMatch) {
                    throw new FormFieldsError(
                        "Country is not supported for this beneficiary type.",
                    );
                }

                const merchantCurrencyMatch = await SupportedCountry.findOne({
                    where: {
                        id: { [Op.in]: supportedIds.map((id) => Number(id)) },
                        countryCode: payload.country,
                        currency: payload.currency,
                        status: 1,
                    },
                });
                if (!merchantCurrencyMatch) {
                    throw new FormFieldsError(
                        "Currency is not supported for the selected country.",
                    );
                }
            }
        }
    }

    const countryMatch = await SupportedCountry.findOne({
        where: { countryCode: payload.country, status: 1 },
    });
    if (!countryMatch) {
        throw new FormFieldsError(
            "Country is not supported for this beneficiary type.",
        );
    }

    const supportedCountry = await SupportedCountry.findOne({
        where: {
            countryCode: payload.country,
            currency: payload.currency,
            status: 1,
        },
    });
    if (!supportedCountry) {
        throw new FormFieldsError(
            "Currency is not supported for the selected country.",
        );
    }

    const context = await buildContext();
    const baseFields =
        Number(payload.type) === USER_TYPE_BUSINESS
            ? baseBusinessFields(context)
            : baseIndividualFields(context);

    baseFields.push(
        make("account_name", "Account Name", {
            validation: VALIDATION_PRESETS.account_name,
        }),
    );

    const additionalFields = bankFieldsByCountry(
        supportedCountry.countryCode,
        supportedCountry.currency,
        context,
    );

    if (supportedCountry.currency === "USD") {
        additionalFields.push(
            make("intermediary_bank_name", "Intermediary Bank Name", {
                mandatory: false,
                validation: VALIDATION_PRESETS.name,
                required_if: "code",
            }),
            make(
                "intermediary_bank_swift_code",
                "Intermediary Bank Swift Code",
                {
                    mandatory: false,
                    validation: VALIDATION_PRESETS.swift,
                },
            ),
            make("intermediary_bank_aba", "Intermediary Bank ABA", {
                mandatory: false,
                validation: VALIDATION_PRESETS.aba,
                required_if: "code",
            }),
            make("intermediary_bank_address", "Intermediary Bank Address", {
                mandatory: false,
                validation: VALIDATION_PRESETS.address,
            }),
            make("intermediary_bank_city", "Intermediary Bank City", {
                mandatory: false,
                validation: VALIDATION_PRESETS.city,
            }),
            make("intermediary_bank_country", "Intermediary Bank Country", {
                mandatory: false,
                values: context.countries,
            }),
            make("intermediary_bank_state", "Intermediary Bank State", {
                mandatory: false,
                values: context.states,
                parent_key: "intermediary_bank_country",
            }),
            make(
                "intermediary_bank_postal_code",
                "Intermediary Bank Postal Code",
                {
                    mandatory: false,
                    validation: VALIDATION_PRESETS.postal_code,
                },
            ),
        );
    }

    // Service-bank dropdown vs free-form bank name (legacy conditional).
    if (
        supportedCountry.externalType === EXTERNAL_TYPE_DIGININE ||
        supportedCountry.externalType === EXTERNAL_TYPE_IME ||
        supportedCountry.externalType === EXTERNAL_TYPE_MOBI ||
        payload.currency === "CNY" ||
        payload.currency === "THB"
    ) {
        const serviceBankRequired = [
            "NPL",
            "PAK",
            "NGA",
            "MYS",
            "IDN",
            "PHL",
            "THA",
            "CHN",
        ].includes(supportedCountry.countryCode);
        const serviceBankExternalType = ["CNY", "THB"].includes(
            payload.currency,
        )
            ? null
            : (supportedCountry.externalType ?? undefined);
        const banks = await serviceBanks(
            payload.country,
            payload.currency,
            serviceBankExternalType,
        );
        additionalFields.push(
            make("service_bank", "Service Bank", {
                mandatory: serviceBankRequired,
                values: banks,
            }),
        );
    } else {
        additionalFields.push(
            make("bank_name", "Bank Name", {
                validation: VALIDATION_PRESETS.name,
            }),
        );
    }

    let purposes: { label: string; value: string }[] = [];
    if (supportedCountry.externalType === EXTERNAL_TYPE_USI) {
        purposes = await getLookups(
            LOOKUP_TYPE_PURPOSES_OF_TRANSACTIONS,
            EXTERNAL_TYPE_USI,
        );
    } else if (supportedCountry.currency === "USD") {
        purposes = await getLookups(LOOKUP_TYPE_PURPOSES_OF_TRANSACTIONS);
    } else {
        purposes = await getLookups(
            LOOKUP_TYPE_PURPOSES_OF_TRANSACTIONS,
            EXTERNAL_TYPE_DIGININE,
        );
    }

    additionalFields.push(
        make("purpose_of_transaction", "Purpose of Transactions", {
            values: purposes,
        }),
    );

    let fields = [...baseFields, ...additionalFields];

    if (supportedCountry.currency === "USD") {
        fields = fields.map((field) => {
            if (field.field_key === "bank_name") {
                return { ...field, is_mandatory: true };
            }
            return field;
        });
    }

    if (payload.merchantId) {
        const beneficiaryFieldsSetting = await MerchantSetting.findOne({
            where: {
                merchantId: payload.merchantId,
                key: "beneficiary_fields",
                status: 1,
            },
        });
        if (beneficiaryFieldsSetting?.value) {
            try {
                const customOptionalFields: string[] = JSON.parse(
                    beneficiaryFieldsSetting.value,
                );
                if (Array.isArray(customOptionalFields)) {
                    fields = fields.map((field) => {
                        const isMandatory =
                            field.is_mandatory &&
                            !customOptionalFields.includes(field.field_key);
                        return { ...field, is_mandatory: isMandatory };
                    });
                }
            } catch {
                // Malformed merchant setting — leave mandatory flags as-is.
            }
        }
    }

    return fields;
};
