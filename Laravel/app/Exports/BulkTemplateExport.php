<?php

namespace App\Exports;

use Maatwebsite\Excel\Concerns\FromArray;
use Maatwebsite\Excel\Concerns\WithEvents;
use Maatwebsite\Excel\Concerns\WithTitle;
use Maatwebsite\Excel\Events\AfterSheet;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;
use PhpOffice\PhpSpreadsheet\Cell\DataValidation;
use PhpOffice\PhpSpreadsheet\Cell\Coordinate;

class BulkTemplateExport implements FromArray, WithEvents, WithTitle
{
    public function __construct(private array $fields)
    {
        $this->fields = array_values(
            array_filter($fields, fn($f) => !empty($f['is_mandatory']))
        );
    }

    public function title(): string
    {
        return 'Payouts';
    }

    public function array(): array
    {
        return [
            collect($this->fields)->map(function ($field) {
                return ucfirst($field['section']) . ' ' . $field['field_label'];
            })->toArray(),

            collect($this->fields)->map(function ($field) {
                return $field['section'] . '.' . $field['field_key'];
            })->toArray(),
        ];
    }

    public function registerEvents(): array
    {
        return [
            AfterSheet::class => fn(AfterSheet $event)
            => $this->applyRules($event->sheet->getDelegate())
        ];
    }

    private function applyRules(Worksheet $sheet): void
    {
        $sheet->getRowDimension(2)->setVisible(false);
       
        $sheet->protectCells('A2:ZZ2', 'readonly');

        $spreadsheet = $sheet->getParent();

        $lookupSheet = new Worksheet($spreadsheet, '_lookups');
      
        $spreadsheet->addSheet($lookupSheet);
      
        $lookupSheet->setSheetState(Worksheet::SHEETSTATE_HIDDEN);

        $col = 'A';
        $lookupCol = 'A';

        foreach ($this->fields as $field) {

            if ($field['is_mandatory']) {
                $sheet->getStyle("{$col}1")->getFont()->setBold(true);



                if (!empty($field['values_supported'])) {

                    $row = 1;
                    foreach ($field['values_supported'] as $option) {
                        $lookupSheet->setCellValue(
                            "{$lookupCol}{$row}",
                            trim($option['label'])
                        );
                        $row++;
                    }

                    $endRow = $row - 1;

                    $validation = new DataValidation();
                    $validation->setType(DataValidation::TYPE_LIST);
                    $validation->setAllowBlank(!$field['is_mandatory']);
                    $validation->setShowDropDown(true);
                    $validation->setFormula1(
                        "='_lookups'!\${$lookupCol}\$1:\${$lookupCol}\${$endRow}"
                    );

                    $validation->setShowErrorMessage(true);
                    $validation->setErrorStyle(DataValidation::STYLE_STOP);
                    $validation->setError(
                        'Invalid value',
                        'Please select a value from the dropdown only.'
                    );


                    for ($r = 2; $r <= 300; $r++) {
                        $sheet->getCell("{$col}{$r}")
                            ->setDataValidation(clone $validation);
                    }

                    $lookupCol++;
                }
            }

            $col++;
        }

        $highestColumn = $sheet->getHighestColumn();
        $highestColumnIndex = Coordinate::columnIndexFromString($highestColumn);

        for ($i = 1; $i <= $highestColumnIndex; $i++) {
            $sheet->getColumnDimensionByColumn($i)->setAutoSize(true);
        }
    }
}
