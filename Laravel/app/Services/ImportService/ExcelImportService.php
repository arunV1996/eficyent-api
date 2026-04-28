<?php

namespace App\Services\ImportService;

use App\Helpers\Helper;
use App\Imports\BulkImportValidation;
use Illuminate\Validation\ValidationException;
use Maatwebsite\Excel\Facades\Excel;

class ExcelImportService
{
    public static function process($file, array $fields, callable $rowValidator): array
    {
        $dropdownMap = self::buildDropdownValueMap($fields);

        $rows = Excel::toArray(new BulkImportValidation, $file)[0];

        $firstRow = $rows[0] ?? [];

        $isAssociative = array_keys($firstRow) !== range(0, count($firstRow) - 1);

        $rows = array_values(array_filter($rows, fn($row) => !empty(array_filter($row))));

        $headers = $rows[0] ?? [];

        $dataRows = array_slice($rows, 1);

        $fieldMap = [];

        if ($isAssociative) {

            foreach ($fields as $field) {

                $flatKey = $field['section'] . '_' . $field['field_key'];

                $fieldMap[$flatKey] = $field['section'] . '.' . $field['field_key'];
            }

            $dataRows = $rows;

        } else {

            $headers = $rows[0] ?? [];

            $dataRows = array_slice($rows, 1);

            foreach ($headers as $index => $header) {

                $header = trim($header);

                foreach ($fields as $field) {

                    $expectedHeader = ucfirst($field['section']) . ' ' . $field['field_label'];

                    if ($expectedHeader === $header) {

                        $fieldMap[$index] = $field['section'] . '.' . $field['field_key'];
                        break;
                    }
                }
            }
        }

        $validatedRows = [];

        $errors = [];

        foreach ($dataRows as $index => $row) {

            $rowNumber = $index + 3;

            try {

                $payload = self::mapExcelRowToPayload($row, $fieldMap, $dropdownMap);

                $validatedRows[] = $rowValidator($payload, $rowNumber);
            } catch (ValidationException $e) {

                $rowErrors = [];

                foreach ($e->errors() as $field => $messages) {

                    foreach ($messages as $message) {

                        $rowErrors[] = compact('field', 'message');
                    }
                }

                $errors[] = [
                    'row'    => $rowNumber,
                    'errors' => $rowErrors,
                ];
            }
        }

        return compact('validatedRows', 'errors');
    }


    private static function buildDropdownValueMap(array $fields): array
    {
        $map = [];

        
        foreach ($fields as $field) {
            if (empty($field['values_supported'])) {
                continue;
            }

            $section = $field['section'];
            $key     = $field['field_key'];

            foreach ($field['values_supported'] as $option) {
                $label = trim($option['label']);
                $value = $option['value'];

                $map[$section][$key][$label] = $value;
            }
        }

        return $map;
    }

    private static function mapExcelRowToPayload(array $row, array $fieldMap, array $dropdownMap): array
    {

        $quote = [];

        $beneficiary = [];

        $remitter = [];

        $row = self::normalizeHeaders($row);

        foreach ($row as $excelKey => $value) {

            if ($value === null || $value === '') {
                continue;
            }

            if (!isset($fieldMap[$excelKey])) {
                continue;
            }

            $path = $fieldMap[$excelKey];

            if (!str_contains($path, '.')) {
                continue;
            }

            [$section, $field] = explode('.', $path, 2);

            $value = trim((string) $value);

            if (isset($dropdownMap[$section][$field])) {

                $options = $dropdownMap[$section][$field];
                $normalizedInput = strtolower(trim($value));

                $matched = null;

                foreach ($options as $label => $mappedValue) {
                    if (
                        strtolower(trim($label)) === $normalizedInput
                        || strtolower(trim($mappedValue)) === $normalizedInput
                    ) {
                        $matched = $mappedValue;
                        break;
                    }
                }

                if ($matched === null) {
                    throw ValidationException::withMessages([
                        "$section.$field" => "Invalid option selected: {$value}",
                    ]);
                }

                $value = $matched;
            }


            match ($section) {
                'quote'       => $quote[$field] = trim($value),
                'beneficiary' => $beneficiary[$field] = trim($value),
                'remitter'    => $remitter[$field] = trim($value),
                default       => null,
            };
        }

        return compact('quote', 'beneficiary', 'remitter');
    }

    private static function normalizeHeaders(array $row): array
    {
        $normalized = [];

        foreach ($row as $key => $value) {
            if (!$key) continue;

            $cleanKey = strtolower(trim($key));
            $cleanKey = preg_replace('/\s+/', '_', $cleanKey);

            $cleanKey = self::headerAliases()[$cleanKey] ?? $cleanKey;

            $normalized[$cleanKey] = is_string($value) ? trim($value) : $value;
        }

        return $normalized;
    }

    private static function headerAliases(): array
    {
        return [

            'quote_transaction_reference_number' => 'quote_txn_ref_no',

            'remitter_mobile_number' => 'remitter_mobile',
            'remitter_address' => 'remitter_address_1',

            'beneficiary_address_line_1' => 'beneficiary_receiver_address_line_1',
            
            'beneficiary_ifsc_code' => 'beneficiary_code',
            'account_type' => 'beneficiary_account_type',
            'beneficiary_purpose_of_transactions' => 'beneficiary_purpose_of_transaction',

        ];
    }
}
