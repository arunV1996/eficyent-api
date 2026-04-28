<?php

namespace App\Exports;

use Illuminate\Contracts\View\View;
use Maatwebsite\Excel\Concerns\FromView;

class DepositExport implements FromView
{
    protected $deposit_details;

    public function __construct($deposit_details)
    {
        $this->deposit_details = $deposit_details;
    }

    public function view(): View
    {        
        return view('exports.deposit_export', [
            'deposit_details' => $this->deposit_details,
            'export_from' => 'API'
        ]);
    }
}
