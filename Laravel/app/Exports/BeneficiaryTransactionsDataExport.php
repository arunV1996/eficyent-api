<?php

namespace App\Exports;

use Illuminate\Contracts\View\View;
use Maatwebsite\Excel\Concerns\FromView;
use Maatwebsite\Excel\Concerns\ShouldAutoSize;
use Maatwebsite\Excel\Concerns\WithCustomValueBinder;
use PhpOffice\PhpSpreadsheet\Cell\Cell;
use PhpOffice\PhpSpreadsheet\Cell\DataType;
use PhpOffice\PhpSpreadsheet\Cell\DefaultValueBinder;

class BeneficiaryTransactionsDataExport extends DefaultValueBinder implements FromView, WithCustomValueBinder,ShouldAutoSize
{
    protected $beneficiary_transactions;

    public function __construct($beneficiary_transactions)
    {
        $this->beneficiary_transactions = $beneficiary_transactions;
    }

    public function view(): View
    {
        return view('exports.beneficiary_transactions_data', [
            'data' => $this->beneficiary_transactions,
            'export_from' => 'API'
        ]);
    }

    public function bindValue(Cell $cell, $value)
    {
        $cell->setValueExplicit((string) $value, DataType::TYPE_STRING);
        return true;
    }
}
