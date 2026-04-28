<?php

namespace App\Exports;

use Illuminate\Contracts\View\View;
use Maatwebsite\Excel\Concerns\FromView;
use Maatwebsite\Excel\Concerns\ShouldAutoSize;
use Maatwebsite\Excel\Concerns\WithColumnFormatting;
use PhpOffice\PhpSpreadsheet\Style\NumberFormat;

class LedgerExport implements FromView, ShouldAutoSize, WithColumnFormatting
{
    protected $ledger_details;

    public function __construct($ledger_details)
    {
        $this->ledger_details = $ledger_details;
    }

    public function columnFormats(): array
    {
        return [
            'B' => NumberFormat::FORMAT_TEXT,
            'C' => NumberFormat::FORMAT_TEXT,
        ];
    }

    public function view(): View
    {
        return view('exports.ledger_export', [
            'ledger_details' => $this->ledger_details,
            'export_from' => 'API'
        ]);
    }
}
